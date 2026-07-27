# Deploying to Cloudflare Workers, behind Access

> **Not the deployment this repo currently runs.** The live instance is self-hosted behind a
> `cloudflared` tunnel — see **[deploy-tunnel.md](deploy-tunnel.md)**. Keep this document for the
> Workers path, which differs in one substantive way: Workers has no filesystem, so authored
> capture views go to KV and have to be pulled back into the repo with
> `npm run capture-views:pull`. Self-hosted writes them into `public/capture-views/` directly.

The deployed app is the gallery **plus** the capture-view authoring UI, so a model can be
positioned for its evaluation screenshot without a checkout. That makes it a write endpoint, which
is why every step below treats the Access policy as part of the deploy rather than a follow-up.

**Order matters.** Do not point a hostname at the Worker before its Access application exists.

---

## 0. Prerequisites

- Cloudflare account with the `nightingale-ai.com` zone on it
- `CLOUDFLARE_API_TOKEN` exported (create with the **Edit Cloudflare Workers** template), or run
  `npx wrangler login` from an interactive shell
- `NODE_ENV=development npm install --include=dev` — this box exports `NODE_ENV=production`,
  which makes npm skip the whole toolchain

## 1. Create the KV namespace

Production has no filesystem, so authored angles land in KV.

```bash
npx wrangler kv namespace create CAPTURE_VIEWS
```

Paste the returned id into `wrangler.jsonc` over `REPLACE_WITH_KV_NAMESPACE_ID`.

## 2. First deploy (no public hostname yet)

```bash
npm run deploy
```

`preview_urls` is `false` in `wrangler.jsonc` on purpose: a `workers.dev` URL would be a second,
**ungated** route to the same Worker, including to the write endpoint. Leave it off.

At this point the Worker exists but has no route, so nothing is publicly reachable. Writes are
also still refused — `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` are empty and the route fails closed.

## 3. Create the Access application

In **Zero Trust → Access → Applications**, add a self-hosted application:

- **Domain:** `3js.nightingale-ai.com` (or whichever hostname you chose)
- **Policy:** Allow → Emails → your address

Then copy the application's **AUD tag** (Overview tab) and your team domain
(`<team>.cloudflareaccess.com`).

## 4. Wire the hostname and the Access config together

In `wrangler.jsonc`:

- uncomment the `routes` block and set the hostname to match step 3
- fill in `vars`:

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
  "ACCESS_AUD": "<the AUD tag>"
}
```

Redeploy:

```bash
npm run deploy
```

The write endpoint verifies the `Cf-Access-Jwt-Assertion` token itself — signature against the
team's public keys, `aud` match, and validity window (`app/api/capture-view/access.ts`). Access
fronting the hostname is the primary control; this is the second one, so that any *other* route
that ever reaches this Worker still cannot write.

## 5. Verify the gate

```bash
curl -sI https://3js.nightingale-ai.com/ | head -1      # expect a redirect to the Access login
curl -s -X POST https://3js.nightingale-ai.com/api/capture-view \
  -H 'content-type: application/json' \
  -d '{"model":"glock-ghost-protocol","position":[0,0,5],"target":[0,0,0],"fov":30}'
```

The POST must **not** succeed. Anything other than an Access bounce or a `403` means the gate is
not doing its job — stop and fix it before using the deployment.

## 6. Service token, for pulling angles back

A browser login cannot be replayed from a script, so the pull script authenticates with a service
token. **Zero Trust → Access → Service Auth → Create Service Token**, then add it to the
application's policy (Allow → Service Auth → the token).

```bash
export CF_ACCESS_CLIENT_ID=<uuid>.access
export CF_ACCESS_CLIENT_SECRET=<secret>
```

---

## The round trip

```
position a model in the deployed viewer      ->  pose written to KV
npm run capture-views:pull -- --url https://3js.nightingale-ai.com
                                             ->  public/capture-views/<id>.json
git add public/capture-views && git commit    ->  repo is the source of truth again
npm run capture -- --model <id> --label loop-01
```

KV is the handoff, not the store of record. `npm run capture` and the refine loop read the repo,
so **an angle authored in production does nothing locally until it is pulled**. The UI says as
much when it saves: `saved to KV · run npm run capture-views:pull`.

`--source wrangler` reads the namespace directly instead of going through the app, which is
easier from a machine already authenticated to Cloudflare and needs no service token.

## What is deployed vs. what stays local

| | deployed | local |
| --- | --- | --- |
| Browse, orbit, explode, inspect parts | yes | yes |
| Set capture view / reference overlay | yes (KV) | yes (repo file) |
| `npm run capture` headless render | no | yes |
| The refine loop | no | yes |

The loop edits `src/demos/*.ts`, runs `typecheck`, and writes to `workbench/` — it needs a
checkout and stays on your machine. Positioning is the one step that benefits from being
reachable from anywhere, which is exactly the step that was moved.
