#!/usr/bin/env python3
"""
Empirical Data Analysis & Statistical Evaluation Script
For: An Empirical Framework for Algorithmic Optimization and Predictive Data-Fetching in Full-Stack Web Applications
Researcher: Jarin Tasnim
"""

import os
import csv
import math

CSV_PATH = os.path.join(os.path.dirname(__file__), '../benchmark/raw-results/benchmark_results.csv')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'charts')
SUMMARY_TABLE_PATH = os.path.join(os.path.dirname(__file__), 'results_summary_table.md')

os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_data():
    if not os.path.exists(CSV_PATH):
        print(f"Error: CSV file not found at {CSV_PATH}. Please run benchmark runner first.")
        return []
    
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                'run_id': int(r['run_id']),
                'scenario': r['scenario_network'].strip('"'),
                'mode': r['mode'].strip('"'),
                'latency': float(r['navigation_latency_ms']),
                'ttfb': float(r['ttfb_ms']),
                'cache_hit': int(r['cache_hit']),
                'prefetched': int(r['prefetched']),
                'request_volume': int(r['request_volume']),
                'payload_bytes': int(r['payload_bytes'])
            })
    return rows

def compute_stats(values):
    n = len(values)
    if n == 0:
        return {'mean': 0, 'std': 0, 'median': 0, 'p95': 0}
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1) if n > 1 else 0
    std = math.sqrt(variance)
    sorted_v = sorted(values)
    median = sorted_v[n // 2] if n % 2 != 0 else (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2
    p95_idx = int(0.95 * n)
    p95 = sorted_v[min(p95_idx, n - 1)]
    return {'mean': mean, 'std': std, 'median': median, 'p95': p95}

def _betacf(a, b, x):
    """Continued fraction for the regularized incomplete beta function (Lentz's method)."""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    if abs(d) < tiny: d = tiny
    d = 1.0 / d; h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d; d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c; c = tiny if abs(c) < tiny else c
        d = 1.0 / d; h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d; d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c; c = tiny if abs(c) < tiny else c
        d = 1.0 / d; delta = d * c; h *= delta
        if abs(delta - 1.0) < 1e-12: break
    return h

def _betai(a, b, x):
    if x <= 0.0: return 0.0
    if x >= 1.0: return 1.0
    bt = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b

def t_two_sided_p(t_stat, df):
    """Two-sided p-value of Student's t distribution, computed (not assumed)."""
    return _betai(df / 2.0, 0.5, df / (df + t_stat * t_stat))

def welch_ttest(sample1, sample2):
    """Welch's two-sample t-test. Returns (|t|, df, two-sided p), all computed from the data."""
    n1, n2 = len(sample1), len(sample2)
    m1, m2 = sum(sample1)/n1, sum(sample2)/n2
    v1 = sum((x - m1)**2 for x in sample1) / (n1 - 1)
    v2 = sum((x - m2)**2 for x in sample2) / (n2 - 1)
    se = math.sqrt((v1 / n1) + (v2 / n2))
    if se == 0:
        return 0, 1.0, 1.0
    t_stat = (m1 - m2) / se
    df = ((v1/n1 + v2/n2)**2) / (((v1/n1)**2)/(n1-1) + ((v2/n2)**2)/(n2-1))
    return abs(t_stat), df, t_two_sided_p(t_stat, df)

def generate_svg_latency_chart(results):
    svg = '''<svg width="720" height="420" xmlns="http://www.w3.org/2000/svg" style="background:#0e131f; font-family:'Plus Jakarta Sans', -apple-system, sans-serif;">
  <defs>
    <linearGradient id="baselineGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#be123c"/>
    </linearGradient>
    <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>

  <text x="360" y="38" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="bold">Comparative Client Navigation Latency by Network Profile</text>
  <text x="360" y="60" text-anchor="middle" fill="#94a3b8" font-size="12">Mean Latency (ms) with 95% Confidence Bounds (N=30 runs per scenario)</text>

  <!-- Legend -->
  <rect x="220" y="80" width="16" height="12" fill="url(#baselineGrad)" rx="2"/>
  <text x="244" y="91" fill="#cbd5e1" font-size="12">Baseline (On-Demand)</text>
  <rect x="420" y="80" width="16" height="12" fill="url(#optGrad)" rx="2"/>
  <text x="444" y="91" fill="#cbd5e1" font-size="12">Optimized (Hover >100ms + SWR)</text>

  <!-- Axes & Grid -->
  <line x1="80" y1="120" x2="80" y2="340" stroke="#334155" stroke-width="1.5"/>
  <line x1="80" y1="340" x2="660" y2="340" stroke="#334155" stroke-width="1.5"/>

  <!-- Y Axis Ticks (0 to 450 ms) -->
  <text x="70" y="344" fill="#64748b" font-size="10" text-anchor="end">0ms</text>
  <line x1="75" y1="340" x2="660" y2="340" stroke="#1e293b" stroke-dasharray="3,3"/>

  <text x="70" y="289" fill="#64748b" font-size="10" text-anchor="end">100ms</text>
  <line x1="75" y1="285" x2="660" y2="285" stroke="#1e293b" stroke-dasharray="3,3"/>

  <text x="70" y="234" fill="#64748b" font-size="10" text-anchor="end">200ms</text>
  <line x1="75" y1="230" x2="660" y2="230" stroke="#1e293b" stroke-dasharray="3,3"/>

  <text x="70" y="179" fill="#64748b" font-size="10" text-anchor="end">300ms</text>
  <line x1="75" y1="175" x2="660" y2="175" stroke="#1e293b" stroke-dasharray="3,3"/>

  <text x="70" y="124" fill="#64748b" font-size="10" text-anchor="end">400ms</text>
  <line x1="75" y1="120" x2="660" y2="120" stroke="#1e293b" stroke-dasharray="3,3"/>
'''
    # Scaling: max 450ms -> height = 220px (from 340 down to 120)
    # y = 340 - (val / 450) * 220
    scenarios = ['Broadband', 'Fast 4G', 'Throttled 3G']
    center_xs = [170, 370, 560]

    for i, sc in enumerate(scenarios):
        cx = center_xs[i]
        b_mean = results[sc]['BASELINE']['latency']['mean']
        o_mean = results[sc]['OPTIMIZED']['latency']['mean']

        b_h = (b_mean / 450.0) * 220.0
        o_h = (o_mean / 450.0) * 220.0

        b_y = 340 - b_h
        o_y = 340 - o_h

        # Baseline bar
        svg += f'''
  <!-- {sc} Baseline -->
  <rect x="{cx - 55}" y="{b_y:.1f}" width="45" height="{b_h:.1f}" fill="url(#baselineGrad)" rx="4"/>
  <text x="{cx - 32}" y="{b_y - 8:.1f}" fill="#f43f5e" font-size="11" font-weight="bold" text-anchor="middle">{b_mean:.1f}ms</text>

  <!-- {sc} Optimized -->
  <rect x="{cx + 10}" y="{o_y:.1f}" width="45" height="{o_h:.1f}" fill="url(#optGrad)" rx="4"/>
  <text x="{cx + 32}" y="{o_y - 8:.1f}" fill="#34d399" font-size="11" font-weight="bold" text-anchor="middle">{o_mean:.1f}ms</text>

  <!-- Scenario Label -->
  <text x="{cx}" y="365" fill="#f8fafc" font-size="13" font-weight="600" text-anchor="middle">{sc}</text>
'''

    svg += '</svg>'
    chart_path = os.path.join(OUTPUT_DIR, 'latency_comparison.svg')
    with open(chart_path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f"✓ Saved publication chart: {chart_path}")

def main():
    data = load_data()
    if not data:
        return

    scenarios = ['Broadband', 'Fast 4G', 'Throttled 3G']
    results = {}

    for sc in scenarios:
        results[sc] = {}
        for mode in ['BASELINE', 'OPTIMIZED']:
            subset = [d for d in data if d['scenario'] == sc and d['mode'] == mode]
            latencies = [d['latency'] for d in subset]
            ttfbs = [d['ttfb'] for d in subset]
            requests = sum(d['request_volume'] for d in subset)
            hits = sum(d['cache_hit'] for d in subset)
            prefetches = sum(d['prefetched'] for d in subset)

            results[sc][mode] = {
                'count': len(subset),
                'latency': compute_stats(latencies),
                'ttfb': compute_stats(ttfbs),
                'requests': requests,
                'hits': hits,
                'prefetches': prefetches,
                'raw_latencies': latencies
            }

    # Generate Markdown Table
    table_lines = [
        "# Empirical Benchmark Results: Baseline vs. Predictive Prefetching + SWR",
        "**Project Title:** An Empirical Framework for Algorithmic Optimization and Predictive Data-Fetching in Full-Stack Web Applications  ",
        "**Proposer:** Jarin Tasnim  ",
        f"**Sample Size:** N=30 test runs per scenario (180 total experimental runs)  \n",
        "| Network Profile | Architecture Mode | Mean Latency (ms) | Std Dev (ms) | Median (ms) | 95th %ile (ms) | Mean TTFB (ms) | Total Requests | Latency Reduction (%) | Welch t-test (t, p) |",
        "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    ]

    findings = []
    for sc in scenarios:
        b = results[sc]['BASELINE']
        o = results[sc]['OPTIMIZED']
        
        b_lat = b['latency']['mean']
        o_lat = o['latency']['mean']
        reduction = ((b_lat - o_lat) / b_lat) * 100

        t_val, df, p_val = welch_ttest(b['raw_latencies'], o['raw_latencies'])
        findings.append((sc, reduction, o['latency']['median'], (o['requests'] - b['requests']) / b['requests'] * 100, p_val))

        table_lines.append(
            f"| **{sc}** | Baseline (On-Demand) | {b['latency']['mean']:.2f} | {b['latency']['std']:.2f} | {b['latency']['median']:.2f} | {b['latency']['p95']:.2f} | {b['ttfb']['mean']:.2f} | {b['requests']} | — | — |"
        )
        table_lines.append(
            f"| **{sc}** | Optimized (Hover SWR) | {o['latency']['mean']:.2f} | {o['latency']['std']:.2f} | {o['latency']['median']:.2f} | {o['latency']['p95']:.2f} | {o['ttfb']['mean']:.2f} | {o['requests']} | **{reduction:.2f}%** | t={t_val:.2f}, df={df:.1f}, p={p_val:.2e} |"
        )

    table_lines.append("\n## Notes on interpretation")
    table_lines.append("These rows are SIMULATED outputs of the benchmark model (run_synthetic_benchmark.js / Benchmark Cockpit), not browser measurements. For measured results run `npm run benchmark:browser` and `npm run analyze:browser`.")
    for sc, reduction, o_median, extra, p_val in findings:
        table_lines.append(f"- **{sc}**: modelled mean latency reduction {reduction:.2f}%, Optimised median {o_median:.2f} ms, modelled extra requests {extra:+.1f}%, Welch p = {p_val:.2e} (computed).")

    summary_text = '\n'.join(table_lines)
    with open(SUMMARY_TABLE_PATH, 'w', encoding='utf-8') as f:
        f.write(summary_text)

    print(f"✓ Generated empirical results summary: {SUMMARY_TABLE_PATH}")
    generate_svg_latency_chart(results)

if __name__ == '__main__':
    main()
