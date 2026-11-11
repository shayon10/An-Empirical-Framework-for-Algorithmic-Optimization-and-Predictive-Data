// Unit tests for the production hover-intent prefetcher module (not a copy).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HoverIntentPrefetcher } from '../src/lib/prefetch/hoverIntent';
import globalSWRCache from '../src/lib/cache/swrCache';

describe('HoverIntentPrefetcher', () => {
  beforeEach(() => { vi.useFakeTimers(); globalSWRCache.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not fetch when disabled (Baseline mode)', async () => {
    const p = new HoverIntentPrefetcher(); p.setEnabled(false);
    const fetcher = vi.fn(async () => ({}));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(150);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches once after the dwell threshold', async () => {
    const p = new HoverIntentPrefetcher({ dwellThreshold: 100 });
    const fetcher = vi.fn(async () => ({}));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(99);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(p.getHistory()).toHaveLength(1);
  });

  it('cancels the timer when the pointer leaves before the threshold', async () => {
    const p = new HoverIntentPrefetcher({ dwellThreshold: 100 });
    const fetcher = vi.fn(async () => ({}));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(40);
    p.onPointerLeave('k');
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('skips a key that is already cached', async () => {
    const p = new HoverIntentPrefetcher();
    globalSWRCache.set('k', { v: 1 });
    const fetcher = vi.fn(async () => ({}));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(150);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not start a second prefetch while one is in flight for the same key', async () => {
    const p = new HoverIntentPrefetcher({ dwellThreshold: 100 });
    let release;
    const fetcher = vi.fn(() => new Promise(resolve => { release = resolve; }));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(100);
    p.onPointerEnter('k', fetcher);   // second hover (or keyboard focus) on the same card
    await vi.advanceTimersByTimeAsync(150);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release({});
  });

  it('respects a changed dwell threshold and clamps it to 20-1000 ms', async () => {
    const p = new HoverIntentPrefetcher();
    p.setDwellThreshold(5);     expect(p.dwellThreshold).toBe(20);
    p.setDwellThreshold(5000);  expect(p.dwellThreshold).toBe(1000);
    p.setDwellThreshold(200);
    const fetcher = vi.fn(async () => ({}));
    p.onPointerEnter('k', fetcher);
    await vi.advanceTimersByTimeAsync(150);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('survives a failing fetcher and allows a later retry', async () => {
    const p = new HoverIntentPrefetcher({ dwellThreshold: 100 });
    const failing = vi.fn(async () => { throw new Error('network down'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    p.onPointerEnter('k', failing);
    await vi.advanceTimersByTimeAsync(100);
    const ok = vi.fn(async () => ({}));
    p.onPointerEnter('k', ok);
    await vi.advanceTimersByTimeAsync(100);
    expect(ok).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
