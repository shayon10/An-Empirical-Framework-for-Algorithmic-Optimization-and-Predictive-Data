#!/usr/bin/env node
/**
 * Automated browser benchmark (Objective 4)
 * -----------------------------------------
 * Measures the RUNNING prototype in a real browser. Nothing in this file generates
 * or assumes results: every number in the output CSV is observed in the browser.
 *
 * Design: 2 modes (BASELINE, OPTIMIZED) x 3 fixed delays (15, 85, 380 ms) x 30 matched trials.
 *  - Trial i uses the same product card and the same scripted pointer actions in both modes.
 *  - Every trial starts from a fresh page load with an empty application cache.
 *  - The scripted sequence contains clicked hovers, an abandoned hover and clicks without dwell,
 *    so cache hits, in-flight requests and wasted prefetches come from the implementation.
 *
 * Usage (from the project root, with the dev servers stopped):
 *    npm run benchmark:browser
 * Options:
 *    --trials=30      trials per cell
 *    --headed         show the browser window
 *    --base=URL       use an already running frontend instead of building and starting one
 *    --threshold=100  dwell threshold in ms (used for the pilot: 50, 100, 150, 200)
 *    --out=FILE       output CSV (default benchmark/raw-results/measured_benchmark_results.csv)
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const TRIALS = parseInt(args.trials || '30', 10);
const WARMUP = parseInt(args.warmup || '3', 10);
const THRESHOLD = parseInt(args.threshold || '100', 10);
const FRONT_PORT = 3100;
const API_URL = 'http://localhost:5001';
const OUT = path.resolve(args.out || path.join(ROOT, 'benchmark', 'raw-results', 'measured_benchmark_results.csv'));

const PROFILES = [
  { name: 'Broadband', delay: 15 },
  { name: 'Fast 4G', delay: 85 },
  { name: 'Throttled 3G', delay: 380 }
];
const MODES = ['BASELINE', 'OPTIMIZED'];

// Fixed scripted interaction sequence (trial index modulo 5).
// dwell = time the pointer rests on the target card before the click.
const INTERACTIONS = [
  { name: 'hover_150_click', dwell: 150, decoy: false },
  { name: 'hover_300_click', dwell: 300, decoy: false },
  { name: 'hover_600_click', dwell: 600, decoy: false },
  { name: 'abandoned_hover_then_click', dwell: 40, decoy: true, decoyDwell: 250 },
  { name: 'quick_click_no_dwell', dwell: 40, decoy: false }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
function ping(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}
async function waitFor(url, label, seconds = 90) {
  for (let i = 0; i < seconds * 2; i++) { if (await ping(url)) return; await sleep(500); }
  throw new Error(`${label} did not start at ${url}`);
}

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright-core')); }
  catch (e) { console.error('playwright-core is not installed. Run:  npm install'); process.exit(1); }

  const children = [];
  const stop = () => children.forEach(c => { try { c.kill(); } catch (e) {} });
  process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(1); });

  // 1. Backend API
  if (!(await ping(`${API_URL}/api/health`))) {
    console.log('Starting API server on port 5001 ...');
    children.push(spawn(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: { ...process.env, NODE_ENV: 'test' }, stdio: 'ignore' }));
    await waitFor(`${API_URL}/api/health`, 'API server');
  } else {
    console.log('Using the API server that is already running on port 5001.');
  }

  // 2. Frontend (production build, so React development double-rendering does not add requests)
  let base = args.base;
  let buildMode = 'external (--base)';
  if (!base) {
    const nextBin = path.join(ROOT, 'frontend', 'node_modules', 'next', 'dist', 'bin', 'next');
    console.log('Building the frontend (production build) ...');
    const b = spawnSync(process.execPath, [nextBin, 'build'], { cwd: path.join(ROOT, 'frontend'), stdio: 'inherit' });
    if (b.status !== 0) { console.error('Build failed. Stop "npm run dev" first, then try again.'); process.exit(1); }
    console.log(`Starting the frontend on port ${FRONT_PORT} ...`);
    children.push(spawn(process.execPath, [nextBin, 'start', '-p', String(FRONT_PORT)], { cwd: path.join(ROOT, 'frontend'), stdio: 'ignore' }));
    base = `http://localhost:${FRONT_PORT}`;
    buildMode = 'next build + next start (production)';
    await waitFor(base, 'Frontend');
  }

  // 3. Browser: use an installed Edge or Chrome (no browser download needed)
  let browser = null; let channelUsed = null;
  for (const channel of (args.channel ? [args.channel] : ['msedge', 'chrome'])) {
    try { browser = await chromium.launch({ channel, headless: !args.headed, args: (process.env.BENCH_BROWSER_ARGS || '').split(' ').filter(Boolean) }); channelUsed = channel; break; } catch (e) { /* try next */ }
  }
  if (!browser) { console.error('Could not start Microsoft Edge or Google Chrome.'); process.exit(1); }
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

  const rows = [];
  let runId = 0;

  async function runTrial(profile, mode, trial, record) {
    const interaction = INTERACTIONS[trial % INTERACTIONS.length];
    const page = await context.newPage();
    let productRequests = 0; let counting = false;
    page.on('request', req => {
      if (counting && req.method() === 'GET' && /\/api\/products\/\d+(\?.*)?$/.test(req.url())) productRequests++;
    });
    try {
      await page.addInitScript(m => { try { localStorage.setItem('research_mode', m); } catch (e) {} }, mode);
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__research && document.querySelectorAll('[data-product-id]').length >= 8);

      // Controlled start state: empty cache, selected mode, latency profile and threshold
      await page.evaluate(({ mode, profile, threshold }) => {
        const r = window.__research;
        r.tracker.setMode(mode);
        r.tracker.setNetworkProfile(profile);
        r.prefetcher.setDwellThreshold(threshold);
        r.tracker.resetAll();
        performance.clearMarks();
      }, { mode, profile: profile.name, threshold: THRESHOLD });

      // Same card for trial i in both modes
      const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-product-id]')].map(e => e.getAttribute('data-product-id')))]);
      const targetId = ids[trial % ids.length];
      const decoyId = ids[(trial + Math.floor(ids.length / 2)) % ids.length];
      const target = page.locator(`[data-product-id="${targetId}"] .card-img-box`).first();
      const decoy = page.locator(`[data-product-id="${decoyId}"] .card-img-box`).first();

      await page.mouse.move(2, 2);
      counting = true;

      if (interaction.decoy) {
        await decoy.scrollIntoViewIfNeeded();
        const d = await decoy.boundingBox();
        await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
        await page.waitForTimeout(interaction.decoyDwell);   // prefetch starts, then the user moves away
        await page.mouse.move(2, 2);
      }
      await target.scrollIntoViewIfNeeded();
      const t = await target.boundingBox();
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
      await page.waitForTimeout(interaction.dwell);
      await page.mouse.down(); await page.mouse.up();

      await page.waitForFunction(() =>
        window.__research.tracker.navHistory.length >= 1 &&
        performance.getEntriesByName('research-detail-rendered').length >= 1, null, { timeout: 20000 });
      await page.waitForTimeout(profile.delay + 150);        // let an abandoned prefetch finish

      const m = await page.evaluate(() => {
        const r = window.__research;
        const nav = r.tracker.navHistory[r.tracker.navHistory.length - 1];
        const start = performance.getEntriesByName('research-nav-start').pop();
        const rendered = performance.getEntriesByName('research-detail-rendered').pop();
        const c = r.cache.getMetrics();
        return {
          nav, renderMs: rendered.startTime - start.startTime,
          initiated: c.prefetchesInitiated, consumed: c.prefetchesConsumed,
          route: location.pathname
        };
      });
      counting = false;

      if (record) {
        rows.push({
          run_id: ++runId,
          timestamp: new Date().toISOString(),
          scenario_network: profile.name,
          delay_ms: profile.delay,
          mode,
          trial: trial + 1,
          target_route: m.route,
          interaction: interaction.name,
          scripted_dwell_ms: interaction.dwell,
          navigation_latency_ms: m.nav.latencyMs.toFixed(2),
          render_latency_ms: m.renderMs.toFixed(2),
          ttfb_ms: m.nav.ttfb === null ? '' : m.nav.ttfb.toFixed(2),
          cache_hit: m.nav.cacheHit ? 1 : 0,
          served_by_inflight_prefetch: m.nav.deduplicated ? 1 : 0,
          product_requests: productRequests,
          prefetch_initiated: m.initiated,
          prefetch_consumed: m.consumed,
          prefetch_wasted: Math.max(0, m.initiated - m.consumed)
        });
      }
    } finally {
      await page.close();
    }
  }

  const started = Date.now();
  for (const profile of PROFILES) {
    for (const mode of MODES) for (let w = 0; w < WARMUP; w++) await runTrial(profile, mode, w, false);
    for (let trial = 0; trial < TRIALS; trial++) {
      // Matched pair, run back to back; the order alternates to balance any drift
      const order = trial % 2 === 0 ? MODES : [...MODES].reverse();
      for (const mode of order) await runTrial(profile, mode, trial, true);
      process.stdout.write(`\r${profile.name}: trial ${trial + 1}/${TRIALS}   `);
    }
    process.stdout.write('\n');
  }

  rows.sort((a, b) => PROFILES.findIndex(p => p.name === a.scenario_network) - PROFILES.findIndex(p => p.name === b.scenario_network)
    || MODES.indexOf(a.mode) - MODES.indexOf(b.mode) || a.trial - b.trial);
  rows.forEach((r, i) => { r.run_id = i + 1; });

  const headers = Object.keys(rows[0]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, [headers.join(','), ...rows.map(r => headers.map(h => r[h]).join(','))].join('\n') + '\n');

  const meta = {
    generated_by: 'benchmark/run_browser_benchmark.js',
    measured: true,
    date: new Date().toISOString(),
    duration_seconds: Math.round((Date.now() - started) / 1000),
    design: `${MODES.length} modes x ${PROFILES.length} delays x ${TRIALS} matched trials`,
    warmup_trials_per_cell: WARMUP,
    dwell_threshold_ms: THRESHOLD,
    delays_ms: PROFILES,
    interactions: INTERACTIONS,
    cache_reset: 'new page load and tracker.resetAll() before every trial',
    frontend: buildMode,
    browser: { channel: channelUsed, version: browser.version(), headless: !args.headed, viewport: '1366x900' },
    node: process.version,
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
    rows: rows.length
  };
  fs.writeFileSync(OUT.replace(/\.csv$/, '') + '.meta.json', JSON.stringify(meta, null, 2) + '\n');

  await browser.close();
  stop();
  console.log(`\nSaved ${rows.length} measured rows to ${OUT}`);
  console.log('Next step:  npm run analyze:browser');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
