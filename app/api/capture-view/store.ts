/**
 * Storage backend for capture views, chosen at runtime from where the code is executing.
 *
 * The same route serves two very different deployments, and they disagree about what durable
 * storage even is:
 *
 *  - **Workers** (`wrangler deploy`) has no filesystem. Poses go to a KV namespace, and
 *    `npm run capture-views:pull` brings them back into the repo.
 *  - **Self-hosted Node** (`vinext start` behind the tunnel) runs on the same machine as the
 *    checkout. Poses go straight into `public/capture-views/`, which is exactly what the refine
 *    loop and `npm run capture` read — so there is nothing to pull and no second source of truth.
 *
 * Detection is by capability, not by an env var somebody has to remember to set: try the Workers
 * binding, and if `cloudflare:workers` will not even import, we are on Node.
 */

export interface CaptureViewStore {
  kind: 'kv' | 'fs';
  get(model: string): Promise<unknown | null>;
  put(model: string, view: unknown): Promise<void>;
}

interface KvLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

let cached: CaptureViewStore | null | undefined;

/** Workers bindings, or null when this is not a Workers runtime. */
async function workersEnv(): Promise<Record<string, unknown> | null> {
  try {
    // Indirect specifier: a bare `import('cloudflare:workers')` is statically resolvable, and the
    // Node build then tries to load a scheme its ESM loader rejects outright (ERR_UNSUPPORTED_ESM_URL_SCHEME)
    // before this catch can ever run.
    const specifier = 'cloudflare:workers';
    const mod = (await import(/* @vite-ignore */ specifier)) as { env?: Record<string, unknown> };
    return mod.env ?? null;
  } catch {
    return null;
  }
}

/** Repo root when running self-hosted. `vinext start` runs from the project directory. */
async function repoRoot(): Promise<string> {
  const { cwd } = await import('node:process');
  return cwd();
}

async function fsStore(): Promise<CaptureViewStore> {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = await repoRoot();
  const sourceDir = join(root, 'public', 'capture-views');
  // The built client is served from dist/, so a pose written only to public/ would leave the
  // static fallback serving a stale angle until the next build. Mirror it.
  const builtDir = join(root, 'dist', 'client', 'capture-views');

  return {
    kind: 'fs',
    async get(model) {
      try {
        return JSON.parse(await readFile(join(sourceDir, `${model}.json`), 'utf8'));
      } catch {
        return null;
      }
    },
    async put(model, view) {
      const body = `${JSON.stringify(view, null, 2)}\n`;
      await mkdir(sourceDir, { recursive: true });
      await writeFile(join(sourceDir, `${model}.json`), body, 'utf8');
      try {
        await mkdir(builtDir, { recursive: true });
        await writeFile(join(builtDir, `${model}.json`), body, 'utf8');
      } catch {
        // No dist/ (dev, or a build that has not run) — the source copy is the one that matters.
      }
    },
  };
}

function kvStore(kv: KvLike): CaptureViewStore {
  return {
    kind: 'kv',
    get: (model) => kv.get(model, 'json').then((v) => v ?? null),
    put: (model, view) => kv.put(model, JSON.stringify(view)),
  };
}

/** The active store, or null if neither backend is available (writes then refuse). */
export async function getStore(): Promise<CaptureViewStore | null> {
  if (cached !== undefined) return cached;
  const env = await workersEnv();
  if (env) {
    const kv = env.CAPTURE_VIEWS as KvLike | undefined;
    cached = kv ? kvStore(kv) : null;
  } else {
    cached = await fsStore();
  }
  return cached;
}

/** Workers `vars` in production, `process.env` self-hosted — the Access config lives in both. */
export async function getConfig(name: string): Promise<string | undefined> {
  const env = await workersEnv();
  if (env && typeof env[name] === 'string') return env[name] as string;
  try {
    const { env: nodeEnv } = await import('node:process');
    return nodeEnv[name];
  } catch {
    return undefined;
  }
}

/** Static assets binding, Workers only — used to fall back to the committed capture view. */
export async function getAssets(): Promise<{ fetch: (r: string) => Promise<Response> } | null> {
  const env = await workersEnv();
  return (env?.ASSETS as { fetch: (r: string) => Promise<Response> } | undefined) ?? null;
}
