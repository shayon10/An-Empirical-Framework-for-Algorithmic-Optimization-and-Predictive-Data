// Unified API Client supporting BASELINE vs OPTIMIZED Fetching Modes
// Implements SWR caching, in-flight request de-duplication and telemetry recording.
//
// Latency conditions: the selected profile is sent to the API in the X-Simulated-Delay
// header and the Express server holds the response for that fixed time (15, 85 or 380 ms).
// No jitter, bandwidth limit or packet loss is applied.

import globalSWRCache from '../cache/swrCache';
import globalTracker from '../metrics/performanceTracker';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

// Fixed added response delay per latency profile (ms)
export const NETWORK_SIMULATION_DELAYS = {
  'Broadband': 15,
  'Fast 4G': 85,
  'Throttled 3G': 380
};

// One Promise per cache key for requests that are currently on the network.
// A second caller for the same key reuses the Promise instead of sending a new request.
const inFlightRequests = new Map();

export function getInFlightCount() {
  return inFlightRequests.size;
}

// Sends one real HTTP request and returns { data, ttfb, payloadBytes }
async function networkFetch(endpoint, profile, options = {}) {
  const delay = NETWORK_SIMULATION_DELAYS[profile] ?? 15;
  const start = performance.now();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Simulated-Profile': profile,
      'X-Simulated-Delay': String(delay),
      ...options.headers
    }
  });

  // fetch() resolves when the response headers arrive: this is the measured time to first byte
  const ttfb = performance.now() - start;

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const payloadBytes = new TextEncoder().encode(text).length; // measured response size
  globalTracker.recordHttpRequest(endpoint, payloadBytes);

  return { data: JSON.parse(text), ttfb, payloadBytes };
}

export async function fetchWithStrategy(endpoint, options = {}) {
  const { isPrefetch = false, ...fetchOptions } = options;
  const mode = globalTracker.mode; // 'BASELINE' or 'OPTIMIZED'
  const profile = globalTracker.networkProfile || 'Broadband';
  const cacheKey = `API:${endpoint}`;

  // ==========================================
  // STRATEGY A: BASELINE (no prefetch, no cache, no de-duplication)
  // ==========================================
  if (mode !== 'OPTIMIZED') {
    const { data, ttfb, payloadBytes } = await networkFetch(endpoint, profile, fetchOptions);
    return { data, fromCache: false, prefetched: false, isStale: false, deduplicated: false, ttfb, payloadBytes };
  }

  // ==========================================
  // STRATEGY B: OPTIMIZED (SWR Cache + Prefetch)
  // ==========================================
  if (isPrefetch) {
    // A prefetch is not a navigation: skip it if the data is already there or already
    // being fetched, without touching the hit/miss metrics.
    if (globalSWRCache.has(cacheKey)) {
      return { data: null, fromCache: true, prefetched: false, isStale: false, deduplicated: false, ttfb: null, payloadBytes: 0, skipped: true };
    }
  } else {
    const cached = globalSWRCache.get(cacheKey);
    if (cached.isHit) {
      // If stale, revalidate in background without blocking UI
      if (cached.isStale) {
        triggerBackgroundRevalidation(endpoint, cacheKey, profile);
      }
      return {
        data: cached.data,
        fromCache: true,
        prefetched: cached.prefetched,
        isStale: cached.isStale,
        deduplicated: false,
        ttfb: null, // no HTTP request is made for a cache hit, so TTFB does not apply
        payloadBytes: 0
      };
    }
  }

  // In-flight de-duplication: reuse a request that is already on the network
  const pending = inFlightRequests.get(cacheKey);
  if (pending) {
    const waitStart = performance.now();
    const result = await pending.promise;
    if (!isPrefetch && pending.isPrefetch) {
      globalSWRCache.markConsumed(cacheKey);
    }
    return {
      data: result.data,
      fromCache: false,
      prefetched: pending.isPrefetch,
      isStale: false,
      deduplicated: true,
      ttfb: performance.now() - waitStart,
      payloadBytes: 0
    };
  }

  const promise = (async () => {
    const result = await networkFetch(endpoint, profile, fetchOptions);
    // Only successful responses reach this line, so failed requests are never cached
    globalSWRCache.set(cacheKey, result.data, { prefetched: isPrefetch, fetchDuration: result.ttfb });
    return result;
  })();
  inFlightRequests.set(cacheKey, { promise, isPrefetch });

  try {
    const { data, ttfb, payloadBytes } = await promise;
    return { data, fromCache: false, prefetched: false, isStale: false, deduplicated: false, ttfb, payloadBytes };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// Background revalidation for SWR pattern.
// If it fails, the stale entry is kept until its grace period ends.
async function triggerBackgroundRevalidation(endpoint, cacheKey, profile) {
  if (inFlightRequests.has(cacheKey)) return;
  const promise = networkFetch(endpoint, profile);
  inFlightRequests.set(cacheKey, { promise, isPrefetch: false });
  try {
    const { data, ttfb } = await promise;
    globalSWRCache.set(cacheKey, data, { prefetched: false, fetchDuration: ttfb });
  } catch (err) {
    console.warn(`[SWR Revalidate] Error updating ${endpoint}`, err);
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// Helper methods for application pages
export async function getProducts(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/products${query ? `?${query}` : ''}`;
  return fetchWithStrategy(endpoint);
}

export async function getProductById(id) {
  const endpoint = `/products/${id}`;
  return fetchWithStrategy(endpoint);
}

// Speculative request issued by the hover-intent prefetcher
export async function prefetchProductById(id) {
  const endpoint = `/products/${id}`;
  return fetchWithStrategy(endpoint, { isPrefetch: true });
}

export async function getCategories() {
  const endpoint = `/categories`;
  return fetchWithStrategy(endpoint);
}
