// Tests for the production API client: two data paths, in-flight de-duplication,
// error handling and stale revalidation. The network is replaced by a counting stub.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWithStrategy, getProductById, prefetchProductById, getInFlightCount } from '../src/lib/api/client';
import globalSWRCache from '../src/lib/cache/swrCache';
import globalTracker from '../src/lib/metrics/performanceTracker';

let calls; let release; let failNext;
function installFetch({ manual = false } = {}) {
  calls = []; release = []; failNext = false;
  global.fetch = vi.fn((url, opts) => {
    calls.push({ url, opts });
    const make = () => failNext
      ? { ok: false, status: 500, statusText: 'Server Error', text: async () => '' }
      : { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ status: 'success', data: { id: 1, url } }) };
    if (!manual) return Promise.resolve(make());
    return new Promise(resolve => release.push(() => resolve(make())));
  });
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('fetchWithStrategy', () => {
  beforeEach(() => { globalSWRCache.clear(); globalTracker.totalHttpRequests = 0; globalTracker.networkProfile = 'Fast 4G'; });
  afterEach(() => { vi.useRealTimers(); });

  it('Baseline: every navigation uses the network and nothing is cached', async () => {
    globalTracker.mode = 'BASELINE'; installFetch();
    const a = await getProductById(1); const b = await getProductById(1);
    expect(a.fromCache).toBe(false); expect(b.fromCache).toBe(false);
    expect(calls).toHaveLength(2);
    expect(globalSWRCache.getMetrics().activeEntriesCount).toBe(0);
  });

  it('sends the fixed delay of the selected profile to the server', async () => {
    globalTracker.mode = 'BASELINE'; installFetch();
    await getProductById(1);
    expect(calls[0].opts.headers['X-Simulated-Delay']).toBe('85');
    globalTracker.networkProfile = 'Throttled 3G';
    await getProductById(1);
    expect(calls[1].opts.headers['X-Simulated-Delay']).toBe('380');
  });

  it('Optimised: a prefetch followed by a navigation is one request and a cache hit', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch();
    await prefetchProductById(1);
    const nav = await getProductById(1);
    expect(calls).toHaveLength(1);
    expect(nav.fromCache).toBe(true);
    expect(nav.prefetched).toBe(true);
    expect(nav.ttfb).toBeNull();            // no fabricated TTFB for a cache hit
    const m = globalSWRCache.getMetrics();
    expect(m.prefetchesInitiated).toBe(1);
    expect(m.prefetchesConsumed).toBe(1);
    expect(m.misses).toBe(0);               // the prefetch itself is not counted as a miss
  });

  it('Optimised: a click during an in-flight prefetch reuses the same request', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch({ manual: true });
    const pre = prefetchProductById(1);
    await flush();
    const nav = getProductById(1);          // click arrives while the prefetch is loading
    await flush();
    expect(calls).toHaveLength(1);          // no second HTTP request
    expect(getInFlightCount()).toBe(1);
    release[0]();
    const [, navResult] = await Promise.all([pre, nav]);
    expect(navResult.deduplicated).toBe(true);
    expect(navResult.prefetched).toBe(true);
    expect(navResult.data.data.id).toBe(1);
    expect(getInFlightCount()).toBe(0);
    const m = globalSWRCache.getMetrics();
    expect(m.prefetchesConsumed).toBe(1);
    expect(m.wasteRate).toBe(0);
  });

  it('Optimised: two concurrent navigations to the same product share one request', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch({ manual: true });
    const a = getProductById(2); const b = getProductById(2);
    await flush();
    expect(calls).toHaveLength(1);
    release[0]();
    await Promise.all([a, b]);
  });

  it('a prefetch for a key that is already cached sends no request', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch();
    await getProductById(1);
    const r = await prefetchProductById(1);
    expect(r.skipped).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('a failed request is not cached and the error is reported', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch(); failNext = true;
    await expect(getProductById(1)).rejects.toThrow('API request failed: 500');
    expect(globalSWRCache.has('API:/products/1')).toBe(false);
    expect(getInFlightCount()).toBe(0);
    failNext = false;
    const retry = await getProductById(1);  // the next attempt goes to the network again
    expect(retry.fromCache).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('a stale hit is served at once and revalidated in the background', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    globalTracker.mode = 'OPTIMIZED'; installFetch();
    await getProductById(1);
    vi.setSystemTime(150000);               // older than the TTL, inside the grace period
    const nav = await getProductById(1);
    expect(nav.fromCache).toBe(true);
    expect(nav.isStale).toBe(true);
    await flush();
    expect(calls).toHaveLength(2);          // background revalidation request
    expect(globalTracker.totalHttpRequests).toBe(2); // and it is counted
    const again = await getProductById(1);
    expect(again.isStale).toBe(false);      // entry was refreshed
  });

  it('a failed revalidation keeps the stale entry during the grace period', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    globalTracker.mode = 'OPTIMIZED'; installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await getProductById(1);
    vi.setSystemTime(150000);
    failNext = true;
    const nav = await getProductById(1);
    await flush();
    expect(nav.fromCache).toBe(true);
    expect(globalSWRCache.has('API:/products/1')).toBe(true);
    warn.mockRestore();
  });

  it('counts each real HTTP request exactly once', async () => {
    globalTracker.mode = 'OPTIMIZED'; installFetch();
    await prefetchProductById(1); await getProductById(1); await getProductById(2);
    expect(globalTracker.totalHttpRequests).toBe(2);
  });
});
