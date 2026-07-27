/**
 * Capture-view API for the DEPLOYED app — the endpoint behind "Set capture view".
 *
 * Positioning a model against its reference photo is the one step of the refine loop that needs a
 * human eye, so it is the step worth reaching from anywhere. Where the pose lands depends on where
 * this is running (`store.ts`): a KV namespace on Workers, `public/capture-views/` when
 * self-hosted next to the checkout. Local `npm run dev` never reaches this file at all — the Vite
 * middleware in `scripts/capture-view-plugin.mjs` intercepts the same path first.
 *
 * GET  /api/capture-view?model=<id>  -> the stored pose, else the committed JSON, else 404
 * POST /api/capture-view             -> validate + store (requires a valid Cloudflare Access token)
 *
 * The deployment is gated by a Cloudflare Access policy, and this route independently verifies
 * the Access JWT. Writes fail closed: with Access unconfigured, POST is refused outright rather
 * than left open until somebody remembers to finish the setup.
 */

import { verifyAccessJwt } from './access';
import { getAssets, getConfig, getStore } from './store';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY_BYTES = 8 * 1024;

const bad = (error: string, status = 400): Response => Response.json({ error }, { status });

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export async function GET(request: Request): Promise<Response> {
  const model = new URL(request.url).searchParams.get('model');
  if (!model || !SLUG.test(model)) return bad('`model` must be a demo id slug');

  const store = await getStore();
  const stored = await store?.get(model);
  if (stored) {
    return Response.json(stored, { headers: { 'cache-control': 'no-store' } });
  }

  // Nothing authored in this deployment yet — serve whatever was committed, so a fresh instance
  // still frames every model at its checked-in angle instead of falling back to bbox arithmetic.
  const assets = await getAssets();
  if (assets) {
    const asset = await assets.fetch(new URL(`/capture-views/${model}.json`, request.url).toString());
    if (asset.ok) {
      return new Response(asset.body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
  }
  return bad(`no capture view for '${model}'`, 404);
}

export async function POST(request: Request): Promise<Response> {
  const teamDomain = await getConfig('ACCESS_TEAM_DOMAIN');
  const aud = await getConfig('ACCESS_AUD');

  if (!teamDomain || !aud) {
    return bad(
      'writes are disabled: set ACCESS_TEAM_DOMAIN and ACCESS_AUD (wrangler.jsonc vars, or the environment when self-hosted)',
      503,
    );
  }
  const access = await verifyAccessJwt(request, { teamDomain, aud });
  if (!access.ok) return bad(`Cloudflare Access check failed: ${access.reason}`, 403);

  const store = await getStore();
  if (!store) return bad('writes are disabled: no capture-view storage is available', 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return bad('request body too large', 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return bad('request body is not valid JSON');
  }

  const { model, position, target, fov, width, height, note } = body;
  if (typeof model !== 'string' || !SLUG.test(model)) {
    return bad('`model` must be a demo id slug (lowercase, digits, hyphens)');
  }
  if (!isVec3(position)) return bad('`position` must be 3 finite numbers');
  if (!isVec3(target)) return bad('`target` must be 3 finite numbers');
  if (typeof fov !== 'number' || !Number.isFinite(fov) || fov <= 0 || fov >= 180) {
    return bad('`fov` must be a finite number in (0, 180)');
  }

  const payload = {
    model,
    position,
    target,
    fov,
    width: typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : 1600,
    height: typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : 900,
    ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
    updated: new Date().toISOString().slice(0, 10),
    // So a pose that turns up in a git diff is traceable to a person rather than appearing
    // from nowhere.
    ...(access.email ? { authoredBy: access.email } : {}),
  };

  await store.put(model, payload);

  return Response.json({
    ok: true,
    storage: store.kind,
    view: payload,
    // 'fs' lands in the repo and is immediately usable; 'kv' still has to be pulled. The client
    // shows this verbatim, so it must not imply the work is finished when it is not.
    hint: store.kind === 'kv'
      ? 'run `npm run capture-views:pull` to bring this into public/capture-views/'
      : 'written to public/capture-views/ — commit it',
  });
}
