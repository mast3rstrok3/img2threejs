# AGENTS.md

Entry point for coding agents (Codex, OpenCode, and anything else that reads `AGENTS.md`).

This repo is **img2threejs**: it rebuilds the object in a reference photo as procedural Three.js
code, gated by a staged pipeline and an AI-vision self-correction loop.

## Map

| path | what it is |
| --- | --- |
| `SKILL.md` | the skill contract — the staged pipeline, the gates, the self-correction vocabulary. **Read this first.** |
| `grimoire/` | the rubrics the gates apply (intake, build, feedback, review, readiness) |
| `forge/` | the Python pipeline. Pure 3.10+ **stdlib** — no pip installs, ever |
| `src/demos/<id>/` | one hand-refined `THREE.Group` factory per model, plus its spec/texture artifacts |
| `src/demos/registry.ts` | the model catalog — ids, camera, reference image, `build()` |
| `src/scene.ts` | the `Viewer`: renderer, OrbitControls, part inspector, capture mode |
| `public/references/<id>.*` | the ground-truth reference photo for each model |
| `public/capture-views/<id>.json` | the saved review angle each evaluation render is taken from |
| `workbench/` | refine-loop working evidence (gitignored — see `workbench/README.md`) |

## Commands

```bash
npm run dev         # Vite + vinext dev server on http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run capture -- --model <id> --label <label>   # headless evaluation render
npm run capture-views:pull -- --url <origin>      # pull angles authored in the deployed app
npm run deploy                                    # Cloudflare Workers (docs/deploy-cloudflare.md)
python3 -m unittest discover forge/tests          # forge tests
```

> This environment exports `NODE_ENV=production`, which makes npm skip devDependencies and the
> dev-only tooling disappear. Use `NODE_ENV=development npm install --include=dev` and
> `NODE_ENV=development npm run dev`.

## The refinement loop

To drive an existing model closer to its reference photo, run bounded iterations of
capture → gap-analysis → fix → verify.

**Procedure: `grimoire/feedback/refine_loop.md`.** Read it and follow it.

Inputs: `model`, `loops` (a budget), `focus` (`shape` · `part` · `texture` · `detail` · `none`),
and a `target` when the focus is `part` or `detail`. Ask for anything not supplied.

Before starting, check that `public/capture-views/<model>.json` exists. Without it renders are
framed by bbox arithmetic instead of the authored review angle, are marked `viewSource: fallback`,
and are not comparable across loops. The angle is set in the viewer: `npm run dev`, open the
demo, toggle **Overlay reference**, orbit until the model sits on the photo, click
**Set capture view**.

The same control exists in the deployed app, but there the pose goes to Workers KV, not the repo.
It has no effect on a local loop until `npm run capture-views:pull` brings it in.

## Rules that hold everywhere in this repo

- **Scripts enforce structure and package evidence; they never score visuals.** The acceptance
  score always comes from an agent's own vision inspecting the comparison sheet.
- **`forge/` is stdlib-only.** Node tooling lives in `scripts/`.
- **Do not over-claim.** State what changed with concrete before → after values, and name what
  still does not match. "Improved" is not "fixed" — see `SKILL.md`, *Transparency and Process
  Debugging*.
- **Every model ships explodable and clickable.** Explode and part-picking must share one
  definition of "a part".
