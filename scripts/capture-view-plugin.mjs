/**
 * Dev-only Vite middleware that persists a review viewpoint to `public/capture-views/<model>.json`.
 *
 * This is the write half of the capture-view contract: the viewer's "Set capture view" control
 * POSTs the current camera pose here, and every later evaluation screenshot is taken from it
 * (`scripts/capture.mjs` -> `Viewer.setView`). Authoring an angle by dragging and saving it beats
 * hand-editing camera vectors, which is why this exists at all.
 *
 * Why a Vite plugin and not an `app/api/.../route.ts`: this project serves the app through
 * `@cloudflare/vite-plugin`, so app routes execute inside workerd, which has no access to the host
 * filesystem — an app route physically cannot write this file. `configureServer` runs in Vite's
 * own Node process, which can. It also makes "dev only" structural rather than a runtime guard:
 * `apply: 'serve'` means this code is never part of a build.
 *
 * See `grimoire/feedback/refine_loop.md`.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY_BYTES = 8 * 1024;

const isVec3 = (v) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** Collect the request body with a hard cap, so a malformed client cannot exhaust memory. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function captureViewPlugin() {
  return {
    name: 'img2threejs-capture-view',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root ?? process.cwd();

      server.middlewares.use('/api/capture-view', (req, res, next) => {
        // GET mirrors the deployed Worker route (app/api/capture-view/route.ts) so the client
        // speaks one protocol in both environments. Locally the backing store is the repo file;
        // in production it is KV. Same contract, different source of truth — the right one each time.
        if (req.method === 'GET') {
          void (async () => {
            const model = new URL(req.url ?? '', 'http://localhost').searchParams.get('model');
            if (!model || !SLUG.test(model)) return send(res, 400, { error: '`model` must be a demo id slug' });
            try {
              const file = join(root, 'public', 'capture-views', `${model}.json`);
              return send(res, 200, JSON.parse(await readFile(file, 'utf8')));
            } catch {
              return send(res, 404, { error: `no capture view for '${model}'` });
            }
          })().catch((err) => send(res, 500, { error: err.message }));
          return;
        }

        if (req.method !== 'POST') return next();

        void (async () => {
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch (err) {
            return send(res, 400, { error: `invalid request body: ${err.message}` });
          }

          const { model, position, target, fov, width, height, note } = body ?? {};

          if (typeof model !== 'string' || !SLUG.test(model)) {
            return send(res, 400, { error: '`model` must be a demo id slug (lowercase, digits, hyphens)' });
          }
          if (!isVec3(position)) return send(res, 400, { error: '`position` must be 3 finite numbers' });
          if (!isVec3(target)) return send(res, 400, { error: '`target` must be 3 finite numbers' });
          if (typeof fov !== 'number' || !Number.isFinite(fov) || fov <= 0 || fov >= 180) {
            return send(res, 400, { error: '`fov` must be a finite number in (0, 180)' });
          }

          // The real traversal guard: the id must resolve to a demo that exists on disk. The slug
          // regex already rejects `..` and separators; this rejects a well-formed id for a demo
          // that isn't there, so a typo fails loudly instead of writing an orphan file the loop
          // would later read as an authored angle.
          try {
            await access(join(root, 'src', 'demos', model));
          } catch {
            return send(res, 404, { error: `unknown demo '${model}' — no src/demos/${model} directory` });
          }

          const payload = {
            model,
            position,
            target,
            fov,
            width: Number.isFinite(width) ? Math.round(width) : 1600,
            height: Number.isFinite(height) ? Math.round(height) : 900,
            ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
            updated: new Date().toISOString().slice(0, 10),
          };

          const dir = join(root, 'public', 'capture-views');
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `${model}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

          server.config.logger.info(`  capture view saved -> public/capture-views/${model}.json`);
          return send(res, 200, { ok: true, path: `public/capture-views/${model}.json`, view: payload });
        })().catch((err) => send(res, 500, { error: err.message }));
      });
    },
  };
}
