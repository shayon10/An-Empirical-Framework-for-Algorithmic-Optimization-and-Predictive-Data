# Measured browser benchmark: results summary

Source: `benchmark\raw-results\measured_benchmark_results.csv` (180 measured rows). All values are computed from the CSV.

## Navigation time (click until product data are available), ms

| Network | Mode | n | Mean | SD | Median | 95th pct. |
|---|---|---|---|---|---|---|
| Broadband | Baseline | 30 | 67.86 | 9.16 | 67.55 | 83.07 |
| Broadband | Optimized | 30 | 51.82 | 18.21 | 47.05 | 80.32 |
| Fast 4G | Baseline | 30 | 140.24 | 10.74 | 138.00 | 157.51 |
| Fast 4G | Optimized | 30 | 80.23 | 51.15 | 49.30 | 151.43 |
| Throttled 3G | Baseline | 30 | 437.11 | 8.25 | 434.85 | 451.14 |
| Throttled 3G | Optimized | 30 | 288.73 | 157.53 | 339.80 | 448.61 |

Paired comparison (Baseline minus Optimised, same trial):

| Network | Pairs | Mean difference | 95% CI (bootstrap) | Median difference | Reduction in mean | Wilcoxon W+ / W- | z | p | Rank-biserial r |
|---|---|---|---|---|---|---|---|---|---|
| Broadband | 30 | 16.04 | 8.38 to 23.41 | 26.20 | 23.6% | 395 / 70 | -3.33 | < 0.001 | 0.70 |
| Fast 4G | 30 | 60.01 | 41.70 to 77.79 | 88.00 | 42.8% | 433 / 32 | -4.11 | < 0.001 | 0.86 |
| Throttled 3G | 30 | 148.38 | 94.30 to 204.27 | 101.90 | 33.9% | 413 / 52 | -3.70 | < 0.001 | 0.78 |

## Render time (click until the detail view has rendered), ms

| Network | Mode | n | Mean | SD | Median | 95th pct. |
|---|---|---|---|---|---|---|
| Broadband | Baseline | 30 | 107.00 | 10.84 | 107.05 | 126.47 |
| Broadband | Optimized | 30 | 92.11 | 16.98 | 90.00 | 117.26 |
| Fast 4G | Baseline | 30 | 181.91 | 13.86 | 179.60 | 201.26 |
| Fast 4G | Optimized | 30 | 124.99 | 51.24 | 97.70 | 197.10 |
| Throttled 3G | Baseline | 30 | 476.92 | 10.42 | 476.05 | 494.83 |
| Throttled 3G | Optimized | 30 | 329.41 | 155.18 | 376.05 | 491.69 |

Paired comparison (Baseline minus Optimised, same trial):

| Network | Pairs | Mean difference | 95% CI (bootstrap) | Median difference | Reduction in mean | Wilcoxon W+ / W- | z | p | Rank-biserial r |
|---|---|---|---|---|---|---|---|---|---|
| Broadband | 30 | 14.89 | 6.75 to 22.64 | 24.80 | 13.9% | 386 / 79 | -3.15 | 0.002 | 0.66 |
| Fast 4G | 30 | 56.93 | 38.45 to 75.15 | 74.25 | 31.3% | 424 / 42 | -3.92 | < 0.001 | 0.82 |
| Throttled 3G | 30 | 147.50 | 94.33 to 202.39 | 108.05 | 30.9% | 414 / 51 | -3.72 | < 0.001 | 0.78 |

## Requests, cache hits and wasted prefetches

A request is one GET to `/api/products/:id` seen in the browser network log during the trial.

| Network | Requests Baseline | Requests Optimised | Extra requests | Cache hits | Hit rate (95% CI) | Served by in-flight prefetch | Prefetches started | Consumed | Wasted | Waste rate (95% CI) |
|---|---|---|---|---|---|---|---|---|---|---|
| Broadband | 30 | 36 | +20.0% | 18 / 30 | 60.0% (42 to 75) | 0 | 24 | 18 | 6 | 25.0% (12 to 45) |
| Fast 4G | 30 | 36 | +20.0% | 12 / 30 | 40.0% (25 to 58) | 6 | 24 | 18 | 6 | 25.0% (12 to 45) |
| Throttled 3G | 30 | 36 | +20.0% | 6 / 30 | 20.0% (10 to 37) | 12 | 24 | 18 | 6 | 25.0% (12 to 45) |
| **All** | 90 | 108 | +20.0% | 36 / 90 | 40.0% (30 to 50) | 18 | 72 | 54 | 18 | 25.0% (16 to 36) |

## Mean navigation time by scripted interaction, ms

| Network | Interaction | Trials | Baseline | Optimised | Saved |
|---|---|---|---|---|---|
| Broadband | hover_150_click | 6 | 67.3 | 41.6 | 25.8 |
| Broadband | hover_300_click | 6 | 72.8 | 40.7 | 32.1 |
| Broadband | hover_600_click | 6 | 67.0 | 33.9 | 33.1 |
| Broadband | abandoned_hover_then_click | 6 | 63.1 | 73.2 | -10.1 |
| Broadband | quick_click_no_dwell | 6 | 69.0 | 69.8 | -0.8 |
| Fast 4G | hover_150_click | 6 | 148.5 | 44.9 | 103.6 |
| Fast 4G | hover_300_click | 6 | 132.8 | 38.3 | 94.5 |
| Fast 4G | hover_600_click | 6 | 137.8 | 36.6 | 101.3 |
| Fast 4G | abandoned_hover_then_click | 6 | 136.6 | 137.1 | -0.5 |
| Fast 4G | quick_click_no_dwell | 6 | 145.4 | 144.3 | 1.1 |
| Throttled 3G | hover_150_click | 6 | 437.2 | 335.3 | 101.9 |
| Throttled 3G | hover_300_click | 6 | 437.4 | 184.8 | 252.6 |
| Throttled 3G | hover_600_click | 6 | 437.0 | 42.6 | 394.4 |
| Throttled 3G | abandoned_hover_then_click | 6 | 437.4 | 439.1 | -1.7 |
| Throttled 3G | quick_click_no_dwell | 6 | 436.6 | 441.8 | -5.2 |

## Benefit against cost (RQ3)

| Network | Mean time saved per navigation, ms | Extra requests per 30 navigations | Waste rate | Time saved per extra request, ms |
|---|---|---|---|---|
| Broadband | 16.0 | 6 | 25.0% | 80 |
| Fast 4G | 60.0 | 6 | 25.0% | 300 |
| Throttled 3G | 148.4 | 6 | 25.0% | 742 |

