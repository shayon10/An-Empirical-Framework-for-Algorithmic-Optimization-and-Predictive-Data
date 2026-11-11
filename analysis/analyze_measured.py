#!/usr/bin/env python3
"""
Analysis of the MEASURED browser benchmark (benchmark/run_browser_benchmark.js).

Input : benchmark/raw-results/measured_benchmark_results.csv
Output: analysis/measured_results_summary.md (also printed)

The same 30 trials are run in both modes, so the analysis is paired:
  - paired difference (Baseline - Optimised) per trial, with a bootstrap 95% confidence interval
  - Wilcoxon signed-rank test (two-sided, normal approximation with tie and continuity correction)
  - effect size: matched-pairs rank-biserial correlation
All statistics are computed from the CSV. Nothing is hard-coded. No third-party packages are needed.
"""
import csv, math, os, random, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'benchmark', 'raw-results', 'measured_benchmark_results.csv')
OUT_PATH = os.path.join(ROOT, 'analysis', 'measured_results_summary.md')
PROFILES = ['Broadband', 'Fast 4G', 'Throttled 3G']


def mean(v): return sum(v) / len(v)
def sd(v):
    m = mean(v); return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1)) if len(v) > 1 else 0.0
def median(v):
    s = sorted(v); n = len(s); return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
def percentile(v, q):
    s = sorted(v); k = (len(s) - 1) * q; f = math.floor(k); c = math.ceil(k)
    return s[int(k)] if f == c else s[f] + (s[c] - s[f]) * (k - f)

def bootstrap_ci(diffs, stat=mean, n_boot=10000, seed=42):
    rng = random.Random(seed); n = len(diffs)
    stats = sorted(stat([diffs[rng.randrange(n)] for _ in range(n)]) for _ in range(n_boot))
    return stats[int(0.025 * n_boot)], stats[int(0.975 * n_boot) - 1]

def wilcoxon_signed_rank(diffs):
    """Two-sided Wilcoxon signed-rank test. Returns (W_plus, W_minus, z, p, rank_biserial, n_nonzero)."""
    d = [x for x in diffs if x != 0]; n = len(d)
    if n == 0: return 0.0, 0.0, 0.0, 1.0, 0.0, 0
    order = sorted(range(n), key=lambda i: abs(d[i]))
    ranks = [0.0] * n; i = 0; tie_term = 0.0
    while i < n:
        j = i
        while j + 1 < n and abs(d[order[j + 1]]) == abs(d[order[i]]): j += 1
        r = (i + j) / 2 + 1
        for k in range(i, j + 1): ranks[order[k]] = r
        t = j - i + 1; tie_term += t ** 3 - t; i = j + 1
    w_plus = sum(r for r, x in zip(ranks, d) if x > 0); w_minus = sum(r for r, x in zip(ranks, d) if x < 0)
    mu = n * (n + 1) / 4; var = n * (n + 1) * (2 * n + 1) / 24 - tie_term / 48
    w = min(w_plus, w_minus)
    z = (w - mu + 0.5) / math.sqrt(var) if var > 0 else 0.0
    p = min(1.0, 2 * 0.5 * math.erfc(abs(z) / math.sqrt(2)))
    rbc = (w_plus - w_minus) / (n * (n + 1) / 2)
    return w_plus, w_minus, z, p, rbc, n

def wilson(k, n):
    if n == 0: return 0.0, 0.0
    z = 1.96; p = k / n; den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, c - h) * 100, min(1.0, c + h) * 100

def fmt_p(p): return '< 0.001' if p < 0.001 else f'{p:.3f}'


def main():
    if not os.path.exists(CSV_PATH):
        print(f'No measured results found at {CSV_PATH}\nRun the browser benchmark first:  npm run benchmark:browser'); sys.exit(1)
    rows = list(csv.DictReader(open(CSV_PATH, newline='', encoding='utf-8')))
    cell = defaultdict(dict)
    for r in rows: cell[(r['scenario_network'], r['mode'])][int(r['trial'])] = r
    out = []
    w = out.append
    w('# Measured browser benchmark: results summary\n')
    w(f'Source: `{os.path.relpath(CSV_PATH, ROOT)}` ({len(rows)} measured rows). All values are computed from the CSV.\n')

    for metric, label in (('navigation_latency_ms', 'Navigation time (click until product data are available)'),
                          ('render_latency_ms', 'Render time (click until the detail view has rendered)')):
        w(f'## {label}, ms\n')
        w('| Network | Mode | n | Mean | SD | Median | 95th pct. |')
        w('|---|---|---|---|---|---|---|')
        for p in PROFILES:
            for m in ('BASELINE', 'OPTIMIZED'):
                v = [float(r[metric]) for r in cell[(p, m)].values()]
                if v: w(f'| {p} | {m.title()} | {len(v)} | {mean(v):.2f} | {sd(v):.2f} | {median(v):.2f} | {percentile(v, 0.95):.2f} |')
        w('')
        w('Paired comparison (Baseline minus Optimised, same trial):\n')
        w('| Network | Pairs | Mean difference | 95% CI (bootstrap) | Median difference | Reduction in mean | Wilcoxon W+ / W- | z | p | Rank-biserial r |')
        w('|---|---|---|---|---|---|---|---|---|---|')
        for p in PROFILES:
            b, o = cell[(p, 'BASELINE')], cell[(p, 'OPTIMIZED')]
            trials = sorted(set(b) & set(o))
            if not trials: continue
            d = [float(b[t][metric]) - float(o[t][metric]) for t in trials]
            lo, hi = bootstrap_ci(d)
            wp, wm, z, pv, rbc, n = wilcoxon_signed_rank(d)
            red = mean(d) / mean([float(b[t][metric]) for t in trials]) * 100
            w(f'| {p} | {len(trials)} | {mean(d):.2f} | {lo:.2f} to {hi:.2f} | {median(d):.2f} | {red:.1f}% | {wp:.0f} / {wm:.0f} | {z:.2f} | {fmt_p(pv)} | {rbc:.2f} |')
        w('')

    w('## Requests, cache hits and wasted prefetches\n')
    w('A request is one GET to `/api/products/:id` seen in the browser network log during the trial.\n')
    w('| Network | Requests Baseline | Requests Optimised | Extra requests | Cache hits | Hit rate (95% CI) | Served by in-flight prefetch | Prefetches started | Consumed | Wasted | Waste rate (95% CI) |')
    w('|---|---|---|---|---|---|---|---|---|---|---|')
    tot = defaultdict(int)
    for p in PROFILES:
        b = list(cell[(p, 'BASELINE')].values()); o = list(cell[(p, 'OPTIMIZED')].values())
        if not o: continue
        rb = sum(int(r['product_requests']) for r in b); ro = sum(int(r['product_requests']) for r in o)
        hits = sum(int(r['cache_hit']) for r in o); infl = sum(int(r['served_by_inflight_prefetch']) for r in o)
        ini = sum(int(r['prefetch_initiated']) for r in o); con = sum(int(r['prefetch_consumed']) for r in o); was = sum(int(r['prefetch_wasted']) for r in o)
        hl, hh = wilson(hits, len(o)); wl, wh = wilson(was, ini)
        for k, v in (('rb', rb), ('ro', ro), ('hits', hits), ('n', len(o)), ('infl', infl), ('ini', ini), ('con', con), ('was', was)): tot[k] += v
        w(f'| {p} | {rb} | {ro} | {(ro - rb) / rb * 100:+.1f}% | {hits} / {len(o)} | {hits / len(o) * 100:.1f}% ({hl:.0f} to {hh:.0f}) | {infl} | {ini} | {con} | {was} | {was / ini * 100 if ini else 0:.1f}% ({wl:.0f} to {wh:.0f}) |')
    if tot['n']:
        hl, hh = wilson(tot['hits'], tot['n']); wl, wh = wilson(tot['was'], tot['ini'])
        w(f"| **All** | {tot['rb']} | {tot['ro']} | {(tot['ro'] - tot['rb']) / tot['rb'] * 100:+.1f}% | {tot['hits']} / {tot['n']} | {tot['hits'] / tot['n'] * 100:.1f}% ({hl:.0f} to {hh:.0f}) | {tot['infl']} | {tot['ini']} | {tot['con']} | {tot['was']} | {tot['was'] / tot['ini'] * 100 if tot['ini'] else 0:.1f}% ({wl:.0f} to {wh:.0f}) |")
    w('')

    w('## Mean navigation time by scripted interaction, ms\n')
    w('| Network | Interaction | Trials | Baseline | Optimised | Saved |')
    w('|---|---|---|---|---|---|')
    for p in PROFILES:
        by = defaultdict(lambda: defaultdict(list))
        for m in ('BASELINE', 'OPTIMIZED'):
            for r in cell[(p, m)].values(): by[r['interaction']][m].append(float(r['navigation_latency_ms']))
        for name in sorted(by, key=lambda k: min(int(r['trial']) for r in cell[(p, 'BASELINE')].values() if r['interaction'] == k)):
            bm, om = mean(by[name]['BASELINE']), mean(by[name]['OPTIMIZED'])
            w(f"| {p} | {name} | {len(by[name]['BASELINE'])} | {bm:.1f} | {om:.1f} | {bm - om:.1f} |")
    w('')

    w('## Benefit against cost (RQ3)\n')
    w('| Network | Mean time saved per navigation, ms | Extra requests per 30 navigations | Waste rate | Time saved per extra request, ms |')
    w('|---|---|---|---|---|')
    for p in PROFILES:
        b, o = cell[(p, 'BASELINE')], cell[(p, 'OPTIMIZED')]
        trials = sorted(set(b) & set(o))
        if not trials: continue
        saved = mean([float(b[t]['navigation_latency_ms']) - float(o[t]['navigation_latency_ms']) for t in trials])
        extra = sum(int(o[t]['product_requests']) for t in trials) - sum(int(b[t]['product_requests']) for t in trials)
        ini = sum(int(o[t]['prefetch_initiated']) for t in trials); was = sum(int(o[t]['prefetch_wasted']) for t in trials)
        per = f'{saved * len(trials) / extra:.0f}' if extra > 0 else 'n/a'
        w(f'| {p} | {saved:.1f} | {extra} | {was / ini * 100 if ini else 0:.1f}% | {per} |')
    w('')

    text = '\n'.join(out)
    open(OUT_PATH, 'w', encoding='utf-8').write(text + '\n')
    print(text)
    print(f'\nSaved to {OUT_PATH}')


if __name__ == '__main__':
    main()
