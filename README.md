# An Empirical Framework for Algorithmic Optimization and Predictive Data-Fetching in Full-Stack Web Applications

| | |
| :--- | :--- |
| **Author** | Jarin Tasnim |
| **P-Number** | P2863744 |
| **Research field** | Software architecture, web performance optimization, empirical latency benchmarking |
| **Stack** | Next.js 14 (React 18), Express 4, Playwright, Vitest, Python 3 |
| **License** | Apache 2.0 |

---

## Contents

1. [Overview](#1-overview)
2. [System architecture](#2-system-architecture)
3. [How the optimization works](#3-how-the-optimization-works)
4. [What is measured and how](#4-what-is-measured-and-how)
5. [Installation and start-up](#5-installation-and-start-up)
6. [Measuring latency with the software](#6-measuring-latency-with-the-software)
7. [Measured results](#7-measured-results)
8. [Unit tests](#8-unit-tests)
9. [Repository layout](#9-repository-layout)
10. [Limitations](#10-limitations)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

A conventional web application requests data only after the user clicks, so every navigation waits for a full network round trip. This project builds a working full-stack prototype and a measurement harness to test whether that wait can be reduced by predicting the click.

Two data-fetching strategies are implemented in the same application and can be switched at run time:

| Mode | Strategy | Behaviour on click |
| :--- | :--- | :--- |
| **A: Baseline** | On-demand REST fetch. No cache, no prefetch, no request de-duplication. | Always sends a request and waits for it. |
| **B: Optimized** | Hover-intent prefetch (pointer dwell of 100 ms or more) with an in-memory Stale-While-Revalidate (SWR) cache and in-flight request de-duplication. | Served from cache, or joins the prefetch request already on the network, or falls back to a normal request. |

Both modes are compared under three fixed latency conditions (15 ms, 85 ms and 380 ms of added server delay) with 30 matched trials per condition, giving 180 measured navigations. The comparison reports the benefit (time saved) together with its cost (extra requests and wasted prefetches).

---

## 2. System architecture

```
 Browser (Next.js client, port 3000)                        Express API (port 5001)
 ------------------------------------------------           ---------------------------
 ProductCard  --pointerenter/leave-->  HoverIntentPrefetcher
      |                                      | dwell >= threshold
      | click                                v
      v                              fetchWithStrategy()  --HTTP GET-->  /api/products/:id
 PerformanceTracker  <--result---   |  SWRCache (LRU)  |   X-Simulated-Delay: 15|85|380
 (navigation records,                |  in-flight map   |  <--JSON------  setTimeout(delay)
  CSV export, HUD)                   --------------------                 5,000-product dataset
```

| Component | File | Responsibility |
| :--- | :--- | :--- |
| API client | `frontend/src/lib/api/client.js` | Single entry point `fetchWithStrategy()`. Chooses the baseline or optimized path, measures TTFB and payload size, de-duplicates in-flight requests. |
| SWR cache | `frontend/src/lib/cache/swrCache.js` | In-memory `Map` with TTL, stale grace period, LRU eviction and prefetch waste accounting. |
| Prefetcher | `frontend/src/lib/prefetch/hoverIntent.js` | Decides when to prefetch. One dwell timer per card, cancelled on pointer leave. |
| Tracker | `frontend/src/lib/metrics/performanceTracker.js` | Holds the mode and latency profile, timestamps each navigation, exports CSV, exposes `window.__research`. |
| Backend | `backend/src/controllers/productController.js` | Serves the catalog and applies the fixed response delay requested by the client. |
| Benchmark driver | `benchmark/run_browser_benchmark.js` | Drives a real browser with Playwright and writes the measured CSV. |
| Analysis | `analysis/analyze_measured.py` | Paired statistics from the measured CSV. Standard library only. |

---

## 3. How the optimization works

### 3.1 Hover-intent prefetching

1. `pointerenter` (or keyboard focus) on a product card calls `onPointerEnter(key, fetcher)`.
2. If the key is already cached or already in flight, nothing happens.
3. Otherwise a timer of `dwellThreshold` milliseconds starts (default 100, adjustable from 20 to 1000).
4. `pointerleave` before the timer fires clears it. No request is sent, so a pointer that merely passes over cards costs nothing.
5. If the timer fires, the prefetch request is sent and its result is stored in the cache flagged as `prefetched`. A request that has already been sent is not cancelled when the pointer leaves.

### 3.2 SWR cache

Each entry moves through three states based on its age:

| State | Condition | Behaviour |
| :--- | :--- | :--- |
| Fresh | age <= TTL (120 s) | Returned immediately. |
| Stale | TTL < age <= TTL + grace (60 s) | Returned immediately, then revalidated in the background. |
| Expired | age > TTL + grace | Removed and treated as a miss. |

- **Capacity:** 100 entries. The JavaScript `Map` preserves insertion order, and every hit re-inserts the entry, so the first key is always the least recently used and is the one evicted.
- **Garbage collection:** expired entries are swept every 15 seconds.
- **Failed requests are never cached.** Only successful responses reach `cache.set()`.

### 3.3 In-flight de-duplication

The client keeps one Promise per cache key for requests currently on the network. If the user clicks while the prefetch for that product is still in flight, the navigation awaits the same Promise instead of sending a second request. The navigation then waits only for the remainder of the request, and the prefetch is counted as consumed.

### 3.4 Outcome of a click in Mode B

| Situation at click | Result | Typical time |
| :--- | :--- | :--- |
| Prefetch finished | Cache hit, no HTTP request | Client rendering overhead only |
| Prefetch still in flight | Joins the existing request | Remaining part of the request |
| No prefetch (dwell below threshold) | Normal request | Same as baseline |

As an approximation, the time saved per navigation is `min(dwell - threshold, request time)`. This is why the benefit grows with dwell time and with network delay.

---

## 4. What is measured and how

### 4.1 Latency conditions

The selected profile is sent with every request in the `X-Simulated-Delay` header. The Express server holds the response for that time with `setTimeout`. Only the three study values are accepted; any other value is ignored.

| Profile | Added server delay |
| :--- | :---: |
| Broadband | 15 ms |
| Fast 4G | 85 ms |
| Throttled 3G | 380 ms |

The delay is constant. No jitter, bandwidth limit or packet loss is applied.

### 4.2 Metrics

All timings use `performance.now()`, the browser's monotonic high-resolution clock.

| Metric | Start | End | Source |
| :--- | :--- | :--- | :--- |
| **Navigation latency** | Click on the card (`tracker.startNavigation`) | Product data available to the detail page (`tracker.endNavigation`) | `navHistory[].latencyMs` |
| **Render latency** | `research-nav-start` performance mark | `research-detail-rendered` performance mark, set after the detail view has rendered | User Timing API |
| **TTFB** | `fetch()` called | `fetch()` resolves, which happens when response headers arrive | `navHistory[].ttfb`. Empty for a cache hit, because no request is made. |
| **Request volume** | | | Count of `GET /api/products/:id` in the browser network log |
| **Cache hit rate** | | | hits / (hits + misses) |
| **Prefetch waste rate** | | | (prefetches initiated - prefetches consumed) / prefetches initiated |

---

## 5. Installation and start-up

Everything runs locally. No paid API, cloud database or account is required.

### Requirements

| Software | Version | Needed for |
| :--- | :--- | :--- |
| Node.js | 18 or later | Application, tests, benchmark driver |
| Python | 3.8 or later | Statistical analysis (no third-party packages) |
| Microsoft Edge or Google Chrome | Any current version | Automated browser benchmark (the installed browser is used; nothing is downloaded) |

### Start the application

```bash
npm install        # root: benchmark driver and process runner
npm run setup      # installs backend and frontend, generates the 5,000-product dataset
npm run dev        # starts the API (port 5001) and the frontend (port 3000)
```

Alternatively run `start.bat` on Windows or `./start.sh` on macOS and Linux, or use `docker compose up --build`.

| Address | Purpose |
| :--- | :--- |
| http://localhost:3000 | Web application |
| http://localhost:3000/benchmark-dashboard | Benchmark dashboard |
| http://localhost:5001/api/health | API health check |
| http://localhost:5001/api/products | Catalog endpoint |

---

## 6. Measuring latency with the software

There are four ways to measure, from a quick manual check to the full reproducible experiment.

### Method 1: Manual measurement with the on-screen HUD

All controls are in the floating toolbar (HUD) on the application pages.

1. Start the application with `npm run dev` and open http://localhost:3000.
2. In the toolbar select **BASELINE**. Open the filter settings panel and choose a profile under **Simulated Latency**.
3. Click a product card. The toolbar shows the latency of that navigation under **SPEED**. Expect roughly the profile delay plus client overhead.
4. Go back and switch the toolbar to **SWR_PREFETCH**.
5. Rest the pointer on a card for more than 100 ms. The card highlights when the prefetch is sent. Click it. The reported latency is now much lower.
6. Move the pointer quickly across several cards. No prefetch is sent, because each dwell timer is cancelled before it fires.
7. To study the threshold, change **Hover Dwell Threshold** in the settings panel and repeat.

### Method 2: Recording a session and exporting CSV

1. Use the reset button in the toolbar to start from an empty cache and an empty history.
2. Perform a series of navigations in either mode.
3. Click **Export CSV** in the toolbar settings panel. The file contains one row per navigation with the columns `Run_ID, Timestamp, Mode, Network_Profile, Target_Route, Navigation_Latency_ms, TTFB_ms, Cache_Hit, Prefetched, Payload_Bytes`.

The page at http://localhost:3000/benchmark-dashboard displays and exports the data set stored in `benchmark/raw-results/benchmark_results.csv`, not the navigations of the current session.

### Method 3: Browser developer tools

The tracker, cache and prefetcher are exposed on `window.__research`. Open the developer tools (F12) and use the Console:

```js
const r = window.__research;

// Set the experimental condition and start from an empty cache
r.tracker.setMode('OPTIMIZED');            // or 'BASELINE'
r.tracker.setNetworkProfile('Fast 4G');    // 'Broadband' | 'Fast 4G' | 'Throttled 3G'
r.prefetcher.setDwellThreshold(100);       // ms
r.tracker.resetAll();

// ...hover and click a product card, then:
r.tracker.navHistory.at(-1);               // latencyMs, ttfb, cacheHit, deduplicated
r.cache.getMetrics();                      // hits, misses, hitRate, wasteRate, prefetch counters
performance.measure('click-to-render', 'research-nav-start', 'research-detail-rendered').duration;
```

To verify the numbers independently:

- **Network tab:** filter by `products/`. Each request's Timing section shows "Waiting for server response", which corresponds to the configured delay. In Mode B a prefetch request appears on hover, and no second request appears on click.
- **Performance tab:** record a click. The marks `research-nav-start` and `research-detail-rendered` appear in the Timings track.

### Method 4: Automated browser benchmark (the reproducible experiment)

This is the method that produces the reported results. Stop `npm run dev` first, because the driver makes its own production build.

```bash
npm run benchmark:browser    # runs 180 measured trials, about 8 minutes
npm run analyze:browser      # computes the statistics
```

What the driver does:

1. Starts the API, builds the frontend with `next build` and serves it with `next start` on port 3100. A production build is used so that React development-mode double rendering does not add requests.
2. Launches the installed Edge or Chrome through Playwright with a 1366 x 900 viewport.
3. For each latency profile, runs 3 warm-up trials per mode (discarded), then 30 matched trials.
4. Each trial opens a fresh page, sets the mode, profile and threshold, and clears the cache with `tracker.resetAll()`.
5. Trial *i* uses the same product card and the same scripted pointer movement in both modes. The two modes run back to back and their order alternates to balance drift.
6. Real pointer events are issued (`mouse.move`, wait for the dwell, `mouse.down`, `mouse.up`), cycling through five scripted interactions:

| Interaction | Dwell before click | Purpose |
| :--- | :---: | :--- |
| `hover_150_click` | 150 ms | Short dwell, prefetch often still in flight |
| `hover_300_click` | 300 ms | Medium dwell |
| `hover_600_click` | 600 ms | Long dwell, prefetch normally complete |
| `abandoned_hover_then_click` | 250 ms on another card, then 40 ms on the target | Produces a wasted prefetch |
| `quick_click_no_dwell` | 40 ms | Click below the threshold, no prefetch |

7. Reads the timings from the page and counts product requests from the network log.

Options (pass them directly to the script):

```bash
node benchmark/run_browser_benchmark.js --trials=10 --headed
node benchmark/run_browser_benchmark.js --threshold=150 --out=benchmark/raw-results/pilot_150.csv
python analysis/analyze_measured.py benchmark/raw-results/pilot_150.csv
```

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `--trials=N` | 30 | Matched trials per latency profile |
| `--warmup=N` | 3 | Discarded warm-up trials per mode and profile |
| `--threshold=MS` | 100 | Dwell threshold, for comparing 50, 100, 150 and 200 ms |
| `--headed` | off | Show the browser window while it runs |
| `--channel=NAME` | `msedge`, then `chrome` | Browser to use |
| `--base=URL` | none | Use an already running frontend instead of building one |
| `--out=FILE` | `benchmark/raw-results/measured_benchmark_results.csv` | Output CSV |

Outputs:

| File | Content |
| :--- | :--- |
| `benchmark/raw-results/measured_benchmark_results.csv` | One row per trial |
| `benchmark/raw-results/measured_benchmark_results.meta.json` | Browser version, OS, CPU, Node version and all settings of the run |
| `analysis/measured_results_summary.md` | Tables of statistics. Rewritten on every analysis run. |

CSV columns: `run_id, timestamp, scenario_network, delay_ms, mode, trial, target_route, interaction, scripted_dwell_ms, navigation_latency_ms, render_latency_ms, ttfb_ms, cache_hit, served_by_inflight_prefetch, product_requests, prefetch_initiated, prefetch_consumed, prefetch_wasted`.

### Statistical analysis

Because the same 30 trials run in both modes, the analysis is paired:

- Mean, standard deviation, median and 95th percentile per mode.
- Paired difference (Baseline minus Optimized) with a bootstrap 95% confidence interval (10,000 resamples, fixed seed).
- Two-sided Wilcoxon signed-rank test with tie and continuity correction. A non-parametric test is used because optimized latencies are not normally distributed: they cluster into cache hits, in-flight joins and misses.
- Effect size as the matched-pairs rank-biserial correlation.
- Wilson 95% confidence intervals for hit rate and waste rate.

### Synthetic model (not a measurement)

`npm run benchmark` and `npm run analyze` run `benchmark/run_synthetic_benchmark.js`, which generates latencies from a statistical model with random jitter. Its output (`benchmark/raw-results/benchmark_results.csv`, `analysis/results_summary_table.md`, `analysis/charts/latency_comparison.svg`) illustrates the expected behaviour and changes on every run. It must not be reported as measured data. Use Method 4 for results.

---

## 7. Measured results

Run of 11 November 2026: Microsoft Edge 156 (headless), Windows 11 x64, AMD Ryzen 5 5600H, Node.js 24.20, dwell threshold 100 ms, 180 rows. Full tables are in `analysis/measured_results_summary.md`.

### Navigation latency (click until product data are available)

| Profile | Baseline mean (ms) | Optimized mean (ms) | Mean saving (ms) | 95% CI (ms) | Reduction | Wilcoxon p | Effect size r |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Broadband (15 ms) | 67.86 | 51.82 | 16.04 | 8.38 to 23.41 | 23.6% | < 0.001 | 0.70 |
| Fast 4G (85 ms) | 140.24 | 80.23 | 60.01 | 41.70 to 77.79 | 42.8% | < 0.001 | 0.86 |
| Throttled 3G (380 ms) | 437.11 | 288.73 | 148.38 | 94.30 to 204.27 | 33.9% | < 0.001 | 0.78 |

### Cost of the optimization

| Profile | Requests, Baseline | Requests, Optimized | Cache hits | Served by in-flight prefetch | Prefetches wasted | Waste rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Broadband | 30 | 36 | 18 / 30 | 0 | 6 / 24 | 25.0% |
| Fast 4G | 30 | 36 | 12 / 30 | 6 | 6 / 24 | 25.0% |
| Throttled 3G | 30 | 36 | 6 / 30 | 12 | 6 / 24 | 25.0% |

### Interpretation

- The optimized mode is significantly faster under all three conditions, at a cost of 20% more product requests.
- The absolute saving grows with network delay: 16 ms on Broadband, 148 ms on Throttled 3G.
- On slow networks fewer prefetches finish before the click, so full cache hits fall from 60% to 20%. In-flight de-duplication recovers part of the benefit by letting the click join the running request.
- The saving depends on dwell time. On Throttled 3G a 600 ms dwell saves 394 ms, while a 150 ms dwell saves 102 ms.
- Clicks without sufficient dwell gain nothing and perform the same as baseline, within measurement noise.
- The optimized mode has a much larger standard deviation, because its latencies fall into separate groups rather than around one value.
- The 25% waste rate is a property of the scripted sequence (one abandoned hover in every five trials), not an estimate of real user behaviour.

---

## 8. Unit tests

```bash
npm test
```

Vitest runs against the real modules, not copies:

| Test file | Covers |
| :--- | :--- |
| `frontend/tests/swrCache.test.js` | Fresh, stale and expired states, LRU eviction, waste accounting, invalidation |
| `frontend/tests/hoverIntent.test.js` | Dwell timer, cancellation on leave, threshold limits, disabled state |
| `frontend/tests/client.test.js` | Baseline and optimized paths, in-flight de-duplication, background revalidation, failed requests not cached |

---

## 9. Repository layout

```
backend/
  src/server.js                          Express server
  src/routes/products.js                 Catalog, telemetry and benchmark routes
  src/controllers/productController.js   Handlers and the fixed response delay
  src/data/generate_dataset.js           Deterministic 5,000-product generator
frontend/
  src/app/page.js                        Catalog view
  src/app/products/[id]/page.js          Product detail view, ends the navigation timing
  src/app/category/[slug]/page.js        Category view
  src/app/benchmark-dashboard/page.js    Benchmark dashboard
  src/components/ProductCard.js          Pointer handlers, starts the navigation timing
  src/components/MetricsHUD.js           Live on-screen metrics
  src/components/Navbar.js               Mode and profile switcher
  src/lib/api/client.js                  Dual-mode fetch strategy
  src/lib/cache/swrCache.js              SWR cache
  src/lib/prefetch/hoverIntent.js        Hover-intent prefetcher
  src/lib/metrics/performanceTracker.js  Telemetry and CSV export
  tests/                                 Vitest unit tests
benchmark/
  run_browser_benchmark.js               Measured benchmark (Playwright)
  run_synthetic_benchmark.js             Synthetic model
  raw-results/                           CSV output and run metadata
analysis/
  analyze_measured.py                    Paired statistics for the measured benchmark
  analyze_results.py                     Statistics and chart for the synthetic model
  measured_results_summary.md            Measured results tables
docs/
  SYSTEM_ARCHITECTURE.md
  METHODOLOGY.md
  THESIS_CHAPTERS_GUIDE.md
start.bat, start.sh, docker-compose.yml  Launchers
```

---

## 10. Limitations

- The latency conditions are a fixed server-side delay on localhost. Real networks add jitter, bandwidth limits, packet loss and connection set-up time.
- Pointer behaviour is scripted. The hit rate and waste rate reflect the chosen interaction mix, not real users.
- Results come from one machine and one browser engine (Chromium).
- The cache lives in page memory and is lost on a full page reload.
- Hover intent does not exist on touch devices, so the technique as implemented applies to pointer and keyboard input.

---

## 11. Troubleshooting

| Problem | Solution |
| :--- | :--- |
| "Build failed" when running the browser benchmark | Stop `npm run dev` first. Both use the `frontend/.next` folder. |
| "playwright-core is not installed" | Run `npm install` in the project root. |
| "Could not start Microsoft Edge or Google Chrome" | Install one of them, or pass `--channel=chrome` or `--channel=msedge`. |
| `python3` is not recognised on Windows | Run the script directly: `python analysis/analyze_results.py`. |
| Port 3000 or 5001 already in use | Close the other process using the port, then start again. |
| Catalog is empty | Run `npm run setup` to generate the dataset. |

---

Author: Jarin Tasnim (P2863744)
