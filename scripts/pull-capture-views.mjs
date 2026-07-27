#!/usr/bin/env node
/**
 * Pulls review viewpoints authored in the deployed app back into `public/capture-views/`.
 *
 * The deployed app has no filesystem, so "Set capture view" there writes to Workers KV. The
 * refine loop and `npm run capture` read the repo, not KV. This is the bridge — KV is the handoff,
 * git stays the source of truth. Run it after positioning models in the deployed viewer, then
 * commit what changed.
 *
 * Usage:
 *   npm run capture-views:pull -- --url https://3js.nightingale-ai.com [--model <id>] [--dry-run]
 *
 * The deployment sits behind Cloudflare Access, so this needs a **service token** to get through
 * (a browser login cannot be replayed from a script). Create one under
 * Zero Trust -> Access -> Service Auth, add it to the application's policy, and export:
 *
 *   export CF_ACCESS_CLIENT_ID=<uuid>.access
 *   export CF_ACCESS_CLIENT_SECRET=<secret>
 *
 * Alternatively `--source wrangler` reads the KV namespace directly with wrangler, bypassing
 * Access entirely — useful from a machine that is already authenticated to Cloudflare.
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'capture-views');
const KV_BINDING = 'CAPTURE_VIEWS';

const HELP = `
pull-capture-views.mjs — bring deployed capture views into the repo

  --url <origin>    deployed app origin (required for --source http)
  --source http     fetch through the app's API, using a CF Access service token  (default)
  --source wrangler read the KV namespace directly via wrangler
  --model <id>      pull just this one
  --dry-run         report what would change, write nothing
`.trim();

function die(message) {
  console.error(`pull-capture-views: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { source: 'http', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) die(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--url') args.url = next().replace(/\/$/, '');
    else if (arg === '--source') args.source = next();
    else if (arg === '--model') args.model = next();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') { console.log(HELP); process.exit(0); }
    else die(`unknown flag: ${arg}`);
  }
  if (!['http', 'wrangler'].includes(args.source)) die('--source must be http or wrangler');
  if (args.source === 'http' && !args.url) die('--url is required with --source http');
  return args;
}

/** Which models to ask about: every demo on disk, or the one named. */
async function demoIds(args) {
  if (args.model) return [args.model];
  const entries = await readdir(join(ROOT, 'src', 'demos'), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function fetchViaHttp(args, ids) {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret) {
    console.warn(
      'pull-capture-views: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET are not set.\n' +
      '         Behind Cloudflare Access every request will be bounced to the login page,\n' +
      '         which arrives here as HTML rather than JSON. See the header of this file.',
    );
  }
  const headers = id && secret
    ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
    : {};

  const found = new Map();
  for (const model of ids) {
    const res = await fetch(`${args.url}/api/capture-view?model=${encodeURIComponent(model)}`, {
      headers,
      redirect: 'manual',
    });
    if (res.status === 404) continue;
    // An Access bounce is a redirect or an HTML login page, never JSON. Treat it as the auth
    // failure it is instead of writing a login page into the repo as a capture view.
    if (res.status >= 300 && res.status < 400) {
      die(`Cloudflare Access redirected the request (${res.status}). The service token is missing or not on the policy.`);
    }
    if (!res.ok) {
      console.warn(`  ${model}: HTTP ${res.status}, skipped`);
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) {
      die(`expected JSON for '${model}' but got '${type}' — almost certainly the Access login page.`);
    }
    found.set(model, await res.json());
  }
  return found;
}

async function fetchViaWrangler(ids) {
  const found = new Map();
  for (const model of ids) {
    try {
      const { stdout } = await execFileAsync(
        'npx',
        ['wrangler', 'kv', 'key', 'get', model, '--binding', KV_BINDING, '--remote'],
        { cwd: ROOT, env: { ...process.env, NODE_ENV: 'development' } },
      );
      const text = stdout.trim();
      if (text) found.set(model, JSON.parse(text));
    } catch {
      // key absent for this model — normal, most demos have no deployed override
    }
  }
  return found;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids = await demoIds(args);
  console.log(`pull-capture-views: checking ${ids.length} demo(s) via ${args.source}`);

  const found = args.source === 'wrangler' ? await fetchViaWrangler(ids) : await fetchViaHttp(args, ids);
  if (found.size === 0) {
    console.log('pull-capture-views: nothing to pull.');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  let changed = 0;
  let same = 0;
  for (const [model, view] of found) {
    const file = join(OUT_DIR, `${model}.json`);
    const next = `${JSON.stringify(view, null, 2)}\n`;
    let current = null;
    try {
      current = await readFile(file, 'utf8');
    } catch {
      // no local file yet
    }
    if (current === next) {
      same += 1;
      continue;
    }
    changed += 1;
    const verb = current === null ? 'new' : 'updated';
    console.log(`  ${verb}: public/capture-views/${model}.json`);
    if (!args.dryRun) await writeFile(file, next, 'utf8');
  }

  console.log(
    `pull-capture-views: ${changed} changed, ${same} already current` +
    (args.dryRun ? ' (dry run — nothing written)' : ''),
  );
  if (changed && !args.dryRun) {
    console.log('pull-capture-views: review with `git diff public/capture-views/` and commit.');
  }
}

await main();
