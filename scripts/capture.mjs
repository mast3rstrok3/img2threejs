#!/usr/bin/env node
/**
 * Headless evaluation capture for the img2threejs refine loop.
 *
 * Drives the gallery's existing capture contract — `#/demo/<id>?capture=1`, the
 * `window.__IMG2THREEJS_READY__` handshake, and `window.__IMG2THREEJS_PARTS__` — and writes the
 * evidence the review gates consume. Until this script existed the contract was implemented on
 * the page but nothing drove it, so every "screenshot" step in SKILL.md was done by hand.
 *
 * Usage:
 *   npm run capture -- --model <id> [--label loop-01] [--out <dir>] [--orbit 25,-25]
 *                      [--url http://localhost:3000] [--timeout 30000] [--keep-server]
 *
 * Writes into `workbench/<model>/<label>/`:
 *   render.png    the evaluation frame, taken from the model's saved capture view
 *   parts.png     -- via --orbit: orbit-<deg>.png, for the multi-angle gate
 *   parts.json    window.__IMG2THREEJS_PARTS__, for check_part_coverage.py --manifest
 *   capture.json  what was captured and how, including whether the saved view was actually used
 *
 * Exits non-zero on: unreachable/ unstartable dev server, ready-handshake timeout, a page error,
 * or a blank frame. A blank render that exits 0 is the worst outcome here — it gets scored.
 */

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'http://localhost:3000';
const DEFAULT_VIEWPORT = { width: 1600, height: 900 };

// ---------------------------------------------------------------------------------------------
// args

function parseArgs(argv) {
  // 90s, not 30: software WebGL runs a heavy scene at well under 1fps, and the page's ready
  // handshake waits 6 animation frames. A model that renders perfectly can legitimately need
  // ~30s here, and a false timeout costs far more than waiting does.
  const args = { orbit: [], timeout: 90_000, url: DEFAULT_URL, label: 'manual', keepServer: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) die(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--model') args.model = next();
    else if (arg === '--label') args.label = next();
    else if (arg === '--out') args.out = next();
    else if (arg === '--url') args.url = next().replace(/\/$/, '');
    else if (arg === '--timeout') args.timeout = Number(next());
    else if (arg === '--keep-server') args.keepServer = true;
    else if (arg === '--orbit') {
      args.orbit = next().split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    } else if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    } else die(`unknown flag: ${arg}`);
  }
  if (!args.model) die('--model <demo-id> is required');
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) die('--timeout must be a positive number');
  return args;
}

const HELP = `
capture.mjs — headless evaluation render for the img2threejs refine loop

  --model <id>      demo id, e.g. glock-ghost-protocol           (required)
  --label <name>    subfolder under workbench/<model>/           (default: manual)
  --out <dir>       write here instead of workbench/<model>/<label>
  --orbit a,b       extra renders yawed by these degrees, for the multi-angle gate
  --url <origin>    dev server origin                            (default: ${DEFAULT_URL})
  --timeout <ms>    ready-handshake timeout                      (default: 90000)
  --keep-server     leave an auto-started dev server running
`.trim();

function die(message) {
  console.error(`capture: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// browser resolution
//
// Deliberately does not download anything: `playwright-core` ships no browsers. Try Playwright's
// own cached build first (it is the version this playwright-core was built against), then the
// system Chrome. Failing both is a setup error the user has to fix, so say exactly what was tried.

async function launchBrowser(chromium) {
  const attempts = [
    ['playwright cached chromium', {}],
    ['system chrome (channel)', { channel: 'chrome' }],
    ['system chrome (/usr/bin/google-chrome)', { executablePath: '/usr/bin/google-chrome' }],
  ];
  const args = [
    // SwiftShader: headless Chrome has no GPU here, and without a software GL backend every
    // WebGL context creation fails and the model renders as an empty white frame.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    // Without these, headless throttles rAF to ~2fps because nothing is driving the compositor.
    // The page's ready handshake waits 6 animation frames, so the throttle alone is enough to
    // blow past the timeout on a model that renders perfectly well.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--run-all-compositor-stages-before-draw',
    '--hide-scrollbars',
  ];
  const failures = [];
  for (const [what, opts] of attempts) {
    try {
      return await chromium.launch({ headless: true, args, ...opts });
    } catch (err) {
      failures.push(`  - ${what}: ${String(err.message).split('\n')[0]}`);
    }
  }
  die(`could not launch a browser. Tried:\n${failures.join('\n')}`);
}

// ---------------------------------------------------------------------------------------------
// dev server

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServer(url) {
  if (await isUp(url)) return null;

  console.log(`capture: no server at ${url} — starting one`);
  const child = spawn('npx', ['vinext', 'dev'], {
    cwd: ROOT,
    // The dev middleware that serves saved capture views is `apply: 'serve'` only, and a shell
    // with NODE_ENV=production makes tooling behave as though this were a build.
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'ignore',
    detached: false,
  });
  child.on('error', (err) => die(`failed to start dev server: ${err.message}`));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(url)) return child;
    if (child.exitCode !== null) die(`dev server exited with code ${child.exitCode}`);
  }
  child.kill('SIGTERM');
  die(`dev server did not come up at ${url} within 60s`);
}

// ---------------------------------------------------------------------------------------------
// blank-frame detection
//
// A minimal PNG reader (zlib + unfilter) so a white or near-empty render fails loudly. This is
// the exact failure `src/scene.ts`'s ready handshake was added to fix; the point of checking here
// is that a regression must not sail through as a legitimate render and get an AI-vision score.

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val = line[x];
      if (filter === 1) val += a;
      else if (filter === 2) val += b;
      else if (filter === 3) val += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = val & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, pixels: out };
}

/** Fraction of pixels that differ from the flat white capture background. */
function subjectCoverage(buffer) {
  const { width, height, channels, pixels } = decodePng(buffer);
  let hits = 0;
  let total = 0;
  // Sampling every 4th pixel: this is a smoke test for "did anything render", not a metric.
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = y * width * channels + x * channels;
      total += 1;
      if (pixels[i] < 246 || pixels[i + 1] < 246 || pixels[i + 2] < 246) hits += 1;
    }
  }
  return total ? hits / total : 0;
}

// ---------------------------------------------------------------------------------------------
// main

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const require = createRequire(import.meta.url);
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    die('playwright-core is not installed. Run: npm install --include=dev');
  }

  // The saved review viewpoint decides the capture viewport, so the PNG the loop compares has the
  // same dimensions every run. Missing file is not fatal — the page falls back and says so.
  let viewport = { ...DEFAULT_VIEWPORT };
  let savedView = null;
  const viewFile = join(ROOT, 'public', 'capture-views', `${args.model}.json`);
  try {
    savedView = JSON.parse(await readFile(viewFile, 'utf8'));
    if (Number.isFinite(savedView.width) && Number.isFinite(savedView.height)) {
      viewport = { width: savedView.width, height: savedView.height };
    }
  } catch {
    console.warn(
      `capture: no saved view at public/capture-views/${args.model}.json — the page will fall back\n` +
      '         to bbox auto-framing. Set an angle in the viewer for a reproducible render.',
    );
  }

  const outDir = args.out ? resolve(args.out) : join(ROOT, 'workbench', args.model, args.label);
  await mkdir(outDir, { recursive: true });

  const server = await ensureServer(args.url);
  const browser = await launchBrowser(chromium);
  let exitCode = 0;

  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // A demo with no authored angle 404s on its capture-view probe by design — we asked for a
      // file we already know is missing, and the page handled it. Recording that as a page error
      // would make the honest `viewSource: fallback` signal look like a malfunction.
      if (!savedView && /Failed to load resource/.test(text) && /404/.test(text)) return;
      pageErrors.push(`console: ${text}`);
    });

    const target = `${args.url}/#/demo/${args.model}?capture=1`;
    await page.goto(target, { waitUntil: 'load', timeout: args.timeout });
    try {
      await page.waitForFunction(() => window.__IMG2THREEJS_READY__ === true, null, { timeout: args.timeout });
    } catch {
      const detail = pageErrors.length ? `\n  page errors:\n   - ${pageErrors.join('\n   - ')}` : '';
      die(`the page never became capture-ready within ${args.timeout}ms at ${target}${detail}`);
    }

    const viewSource = await page.evaluate(() => window.__IMG2THREEJS_VIEW_SOURCE__ ?? 'unknown');
    const parts = await page.evaluate(() => window.__IMG2THREEJS_PARTS__ ?? null);

    const renderPath = join(outDir, 'render.png');
    const shot = await page.screenshot({ path: renderPath });

    const coverage = subjectCoverage(shot);
    if (coverage < 0.001) {
      const detail = pageErrors.length ? `\n  page errors:\n   - ${pageErrors.join('\n   - ')}` : '';
      die(`blank frame — ${(coverage * 100).toFixed(3)}% of pixels differ from the background.\n` +
          `  Wrote ${renderPath} anyway so it can be inspected.${detail}`);
    }

    // Orbit views for the "multi-angle or it didn't happen" gate. Yaw the saved view about the
    // target's Y axis; a form that collapses from a different angle is a flat plane faking volume.
    const orbits = [];
    for (const deg of args.orbit) {
      const applied = await page.evaluate((d) => {
        const v = window.__IMG2THREEJS_VIEWER__;
        if (!v) return false;
        const view = v.getView();
        const [px, py, pz] = view.position;
        const [tx, ty, tz] = view.target;
        const rad = (d * Math.PI) / 180;
        const dx = px - tx;
        const dz = pz - tz;
        v.setView({
          position: [
            tx + dx * Math.cos(rad) - dz * Math.sin(rad),
            py,
            tz + dx * Math.sin(rad) + dz * Math.cos(rad),
          ],
          target: [tx, ty, tz],
          fov: view.fov,
        });
        return true;
      }, deg);
      if (!applied) {
        console.warn(`capture: --orbit needs window.__IMG2THREEJS_VIEWER__; skipped ${deg}deg`);
        break;
      }
      const name = `orbit-${deg > 0 ? '+' : ''}${deg}.png`;
      await page.screenshot({ path: join(outDir, name) });
      orbits.push(name);
    }

    await writeFile(join(outDir, 'parts.json'), `${JSON.stringify(parts, null, 2)}\n`, 'utf8');
    await writeFile(
      join(outDir, 'capture.json'),
      `${JSON.stringify({
        model: args.model,
        label: args.label,
        url: target,
        viewport,
        // 'saved' = framed at the authored angle and comparable across loops; 'fallback' = framed
        // by bbox arithmetic. The loop records this, because the two are not the same evidence.
        viewSource,
        view: savedView,
        orbits,
        subjectCoverage: Number(coverage.toFixed(4)),
        pageErrors,
        captured: new Date().toISOString(),
      }, null, 2)}\n`,
      'utf8',
    );

    const rel = outDir.replace(`${ROOT}/`, '');
    console.log(`capture: ${rel}/render.png  (${viewport.width}x${viewport.height}, view=${viewSource}, coverage=${(coverage * 100).toFixed(1)}%)`);
    if (parts?.parts?.length) console.log(`capture: ${parts.parts.length} parts -> ${rel}/parts.json`);
    if (orbits.length) console.log(`capture: orbits -> ${orbits.join(', ')}`);
    if (viewSource === 'fallback') {
      console.warn('capture: WARNING framed by fallback auto-framing, not an authored angle.');
    }
    if (pageErrors.length) console.warn(`capture: ${pageErrors.length} page error(s) recorded in capture.json`);
  } catch (err) {
    console.error(`capture: ${err.message}`);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    if (server && !args.keepServer) server.kill('SIGTERM');
  }
  process.exit(exitCode);
}

await main();
