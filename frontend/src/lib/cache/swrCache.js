// In-Memory Stale-While-Revalidate (SWR) Cache
// Engineered for Empirical Evaluation of Web Data-Fetching Optimizations
//
// Entry lifecycle:
//   fresh   (age <= ttl)                 -> returned immediately
//   stale   (ttl < age <= ttl + grace)   -> returned immediately, caller revalidates in background
//   expired (age > ttl + grace)          -> removed, treated as a miss
// Capacity: at most `maxEntries` entries. When full, the least recently used entry is evicted.

class SWRCache {
  constructor(defaultTTL = 120000, staleGracePeriod = 60000, maxEntries = 100) {
    this.cache = new Map(); // Map keeps insertion order; the first key is the least recently used
    this.defaultTTL = defaultTTL; // ms until considered stale
    this.staleGracePeriod = staleGracePeriod; // ms allowed for background revalidation
    this.maxEntries = maxEntries; // capacity limit (LRU eviction)
    this.subscribers = new Set();
    this.metrics = this.emptyMetrics();

    // Garbage collection timer for expired items (browser only)
    if (typeof window !== 'undefined') {
      this.gcInterval = setInterval(() => this.reapExpired(), 15000);
    }
  }

  emptyMetrics() {
    return {
      hits: 0,
      misses: 0,
      prefetchesInitiated: 0,
      prefetchesConsumed: 0,
      prefetchesWasted: 0,
      staleHitsRevalidated: 0,
      evictions: 0,
      totalBytesCached: 0
    };
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const snapshot = this.getMetrics();
    this.subscribers.forEach(cb => {
      try { cb(snapshot); } catch (e) { console.error('Cache listener error', e); }
    });
  }

  isExpired(entry, now = Date.now()) {
    return (now - entry.timestamp) > (entry.ttl + this.staleGracePeriod);
  }

  /**
   * Retrieves data from cache for a navigation. Updates hit/miss metrics and LRU order.
   * Returns: { data, isHit, isStale, prefetched }
   */
  get(key) {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.metrics.misses++;
      this.notify();
      return { data: null, isHit: false, isStale: false, prefetched: false };
    }

    if (this.isExpired(entry, now)) {
      this.removeEntry(key, entry);
      this.metrics.misses++;
      this.recalculateTotalBytes();
      this.notify();
      return { data: null, isHit: false, isStale: false, prefetched: false };
    }

    // Cache hit
    const isStale = (now - entry.timestamp) > entry.ttl;
    this.metrics.hits++;
    if (entry.prefetched && !entry.consumed) {
      entry.consumed = true;
      this.metrics.prefetchesConsumed++;
    }
    if (isStale) {
      this.metrics.staleHitsRevalidated++;
    }

    // LRU: move the entry to the most-recently-used position
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.notify();

    return {
      data: entry.data,
      isHit: true,
      isStale,
      prefetched: entry.prefetched,
      timestamp: entry.timestamp
    };
  }

  /**
   * Stores data in cache. Evicts the least recently used entry when the capacity is exceeded.
   */
  set(key, data, options = {}) {
    const { prefetched = false, ttl = this.defaultTTL, fetchDuration = 0 } = options;
    const now = Date.now();

    const jsonStr = JSON.stringify(data || '');
    const estimatedBytes = jsonStr ? jsonStr.length * 2 : 0; // rough utf-16 estimate

    // Replacing an existing unused prefetched entry counts it as wasted first
    const existing = this.cache.get(key);
    if (existing) {
      this.removeEntry(key, existing);
    }

    if (prefetched) {
      this.metrics.prefetchesInitiated++;
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      ttl,
      prefetched,
      consumed: false,
      fetchDuration,
      estimatedBytes
    });

    // Capacity limit: evict least recently used entries
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.removeEntry(oldestKey, this.cache.get(oldestKey));
      this.metrics.evictions++;
    }

    this.recalculateTotalBytes();
    this.notify();
  }

  /** Removes an entry and counts it as wasted if it was prefetched and never used. */
  removeEntry(key, entry) {
    if (entry && entry.prefetched && !entry.consumed) {
      this.metrics.prefetchesWasted++;
    }
    this.cache.delete(key);
  }

  /**
   * Invalidates one key (for example after the product was updated or deleted).
   */
  invalidate(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    this.removeEntry(key, entry);
    this.recalculateTotalBytes();
    this.notify();
    return true;
  }

  /**
   * Mark a prefetched key as consumed when a user actually navigates to it.
   */
  markConsumed(key) {
    const entry = this.cache.get(key);
    if (entry && entry.prefetched && !entry.consumed) {
      entry.consumed = true;
      this.metrics.prefetchesConsumed++;
      this.notify();
      return true;
    }
    return false;
  }

  /** True when a usable (not expired) entry exists. Does not change metrics or LRU order. */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return !this.isExpired(entry);
  }

  recalculateTotalBytes() {
    let sum = 0;
    this.cache.forEach(entry => {
      sum += entry.estimatedBytes || 0;
    });
    this.metrics.totalBytesCached = sum;
  }

  /**
   * Sweeps expired items and records wasted prefetches
   */
  reapExpired() {
    const now = Date.now();
    let changed = false;

    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry, now)) {
        this.removeEntry(key, entry);
        changed = true;
      }
    });

    if (changed) {
      this.recalculateTotalBytes();
      this.notify();
    }
  }

  getMetrics() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0
      ? parseFloat(((this.metrics.hits / totalRequests) * 100).toFixed(2))
      : 0;

    const totalPrefetches = this.metrics.prefetchesInitiated;
    // Waste rate = prefetches not (yet) used / prefetches initiated.
    // Unused entries still in the cache are counted as wasted, so the rate is correct
    // at the end of a session or trial without waiting for the entries to expire.
    const unused = Math.max(0, totalPrefetches - this.metrics.prefetchesConsumed);
    const wasteRate = totalPrefetches > 0
      ? parseFloat(((unused / totalPrefetches) * 100).toFixed(2))
      : 0;

    return {
      ...this.metrics,
      totalRequests,
      hitRate,
      wasteRate,
      maxEntries: this.maxEntries,
      activeEntriesCount: this.cache.size
    };
  }

  clear() {
    this.cache.clear();
    this.metrics = this.emptyMetrics();
    this.notify();
  }
}

export { SWRCache };

// Global singleton instance for the application
export const globalSWRCache = new SWRCache();
export default globalSWRCache;
