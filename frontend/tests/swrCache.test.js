// Unit tests for the production SWR cache module (not a copy).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SWRCache } from '../src/lib/cache/swrCache';

describe('SWRCache', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns a miss for an unknown key', () => {
    const cache = new SWRCache();
    expect(cache.get('a').isHit).toBe(false);
    expect(cache.getMetrics().misses).toBe(1);
  });

  it('serves a fresh entry as a hit that is not stale', () => {
    const cache = new SWRCache(120000, 60000);
    cache.set('a', { v: 1 });
    vi.setSystemTime(119000);
    const r = cache.get('a');
    expect(r.isHit).toBe(true);
    expect(r.isStale).toBe(false);
    expect(r.data).toEqual({ v: 1 });
  });

  it('serves a stale entry within the grace period with isStale = true', () => {
    const cache = new SWRCache(120000, 60000);
    cache.set('a', { v: 1 });
    vi.setSystemTime(150000);
    const r = cache.get('a');
    expect(r.isHit).toBe(true);
    expect(r.isStale).toBe(true);
    expect(cache.getMetrics().staleHitsRevalidated).toBe(1);
  });

  it('removes an expired entry and treats it as a miss', () => {
    const cache = new SWRCache(120000, 60000);
    cache.set('a', { v: 1 });
    vi.setSystemTime(180001);
    expect(cache.get('a').isHit).toBe(false);
    expect(cache.has('a')).toBe(false);
  });

  it('counts an unused prefetched entry as wasted when it expires', () => {
    const cache = new SWRCache(120000, 60000);
    cache.set('a', { v: 1 }, { prefetched: true });
    vi.setSystemTime(180001);
    cache.reapExpired();
    const m = cache.getMetrics();
    expect(m.prefetchesInitiated).toBe(1);
    expect(m.prefetchesWasted).toBe(1);
    expect(m.wasteRate).toBe(100);
  });

  it('marks a prefetched entry as consumed on first read and does not waste it', () => {
    const cache = new SWRCache();
    cache.set('a', { v: 1 }, { prefetched: true });
    expect(cache.get('a').prefetched).toBe(true);
    const m = cache.getMetrics();
    expect(m.prefetchesConsumed).toBe(1);
    expect(m.wasteRate).toBe(0);
  });

  it('reports unused prefetches as waste before they expire', () => {
    const cache = new SWRCache();
    cache.set('a', 1, { prefetched: true });
    cache.set('b', 2, { prefetched: true });
    cache.get('a');
    expect(cache.getMetrics().wasteRate).toBe(50);
  });

  it('enforces the capacity limit by evicting the least recently used entry', () => {
    const cache = new SWRCache(120000, 60000, 3);
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
    cache.get('a');            // 'a' becomes most recently used, 'b' is now the oldest
    cache.set('d', 4);         // exceeds capacity -> 'b' is evicted
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    const m = cache.getMetrics();
    expect(m.activeEntriesCount).toBe(3);
    expect(m.evictions).toBe(1);
  });

  it('never grows beyond maxEntries', () => {
    const cache = new SWRCache(120000, 60000, 100);
    for (let i = 0; i < 250; i++) cache.set(`k${i}`, i);
    expect(cache.getMetrics().activeEntriesCount).toBe(100);
  });

  it('counts an evicted unused prefetch as wasted', () => {
    const cache = new SWRCache(120000, 60000, 1);
    cache.set('a', 1, { prefetched: true });
    cache.set('b', 2);
    expect(cache.getMetrics().prefetchesWasted).toBe(1);
  });

  it('invalidate() removes a key', () => {
    const cache = new SWRCache();
    cache.set('a', 1);
    expect(cache.invalidate('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.invalidate('a')).toBe(false);
  });

  it('has() does not change hit or miss metrics', () => {
    const cache = new SWRCache();
    cache.set('a', 1);
    cache.has('a'); cache.has('zzz');
    const m = cache.getMetrics();
    expect(m.hits + m.misses).toBe(0);
  });
});
