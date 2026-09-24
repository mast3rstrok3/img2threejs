# Self-hosting behind a Cloudflare Tunnel + Access

This is the deployment this repo actually runs: the production build served by Node on the same
machine as the checkout, published through an existing `cloudflared` tunnel, gated by a Cloudflare
Access policy.

The point of self-hosting rather than deploying to Workers is the capture-view authoring UI.
Positioning a model against its reference photo is the one step of the refine loop that needs a
human eye, and running beside the checkout means the pose is written **straight into
`public/capture-views/<id>.json`** — the file the loop and `npm run capture` already read. No KV,
no sync step, one source of truth. (`docs/deploy-cloudflare.md` covers the Workers alternative,
where there is no filesystem and poses go to KV instead.)

The same self-hosted process can run complete skill workflows. `ecosystem.config.cjs` defines both
`image2threejs` and `image2threejs-workflow-worker`; start or reload them together:

```bash
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

In a demo, save the reference-aligned capture view first, then use **Refinement runs**. One loop is
one complete `SKILL.md` invocation. The worker requires a clean tracked worktree before claiming a
new job and creates a dedicated `refine/<model>/<job-id>` branch.

**Order matters: create the Access application before routing the hostname.** If the hostname
already resolves through a proxied wildcard record, adding a tunnel ingress rule publishes the app
the moment `cloudflared` reloads — there is no DNS step to act as a safety margin.

---

## 1. Cloudflare Access application

Zero Trust → Access → Applications → **Add a self-hosted application**.

- **Destination:** *Public hostname* (not Private IP — that is for WARP private networking)
  → subdomain + your domain, path empty so the whole app is covered including `/api/capture-view`
- **Policy:** Action `Allow`, Include → **Emails** → the address you log in with.
  Policies are default-deny, so this one rule is the gate. Do **not** leave it as
  "All authenticated users": with One-time PIN enabled that admits anyone who can receive email.
- **Identity providers:** at least one must be available. One-time PIN needs no external setup.

Verify with the Policy tester: a foreign address must be denied.

## 2. Local deployment values

```bash
cp deploy.local.example.cjs deploy.local.cjs   # then edit
```

`deploy.local.cjs` is gitignored. Fill in:

- `PORT` — a free loopback port
- `ACCESS_TEAM_DOMAIN` — `<team>.cloudflareaccess.com`
- `ACCESS_AUD` — the application's *Application Audience (AUD) Tag*

Both Access values are visible in the login redirect, so you can read them straight off a request
to the hostname once the application exists:

```bash
curl -sI https://<host>/ | grep -i location
```

The `kid=` parameter is the AUD, and the redirect target is the team domain.

Without these two values the write endpoint refuses writes (503). That is deliberate: a
half-finished setup fails closed rather than exposing an unauthenticated write into the repo.

## 3. Build and run

```bash
NODE_ENV=development npm install --include=dev   # this box exports NODE_ENV=production
npm run build
pm2 start ecosystem.config.cjs
```

The service binds **127.0.0.1 only**. `vinext start` ignores `HOST` and defaults to `0.0.0.0`,
which would put the app on every interface of the machine — reachable from the LAN without the
tunnel or Access at all — so `ecosystem.config.cjs` passes `--hostname 127.0.0.1` explicitly.

`pm2 save` if it should survive a reboot.

## 4. Tunnel ingress

Add a rule to the tunnel's config, **above any wildcard rule** — ingress matches top-to-bottom, so
a rule below `*.example.com` never fires:

```yaml
  - hostname: <host>
    service: http://127.0.0.1:<port>
```

Back the file up first, then validate before restarting — a syntax error takes down every other
hostname the tunnel serves:

```bash
cp config.yml config.yml.bak-$(date +%s)
cloudflared tunnel --config config.yml ingress validate
cloudflared tunnel --config config.yml ingress rule https://<host>      # must match your new rule
docker restart <cloudflared-container>
```

## 5. Verify the gate

Do this from outside, and do not skip it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/                      # 302 -> Access login
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/capture-view      # 302
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<host>/api/capture-view \
  -H 'content-type: application/json' \
  -d '{"model":"<id>","position":[0,0,5],"target":[0,0,0],"fov":30}'          # 302, and no file written
```

Anything that is not an Access bounce means the gate is not doing its job — pull the ingress rule
back out before going further. Also confirm the tunnel's other hostnames still respond.

---

## Layers

Three independent controls, so no single misconfiguration opens the write path:

1. **Cloudflare Access** at the edge, keyed on hostname
2. **The route verifies the Access JWT itself** (`app/api/capture-view/access.ts`) — signature
   against the team's public keys, `aud` match, validity window — so any other route that ever
   reaches this origin still cannot write
3. **Fail closed** — no Access config, or no storage backend, means writes are refused outright

## What runs where

| | deployed | local |
| --- | --- | --- |
| Browse, orbit, explode, inspect parts | yes | yes |
| Set capture view / reference overlay | yes → writes into the repo | yes |
| `npm run capture` headless render | no | yes |
| The refine loop | no | yes |

The loop edits `src/demos/*.ts`, runs `typecheck` and writes to `workbench/`, so it needs a
checkout and stays on your machine.
