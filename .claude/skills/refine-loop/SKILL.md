---
name: refine-loop
description: Run N bounded refinement iterations over an existing img2threejs demo model — capture a render from the model's saved review angle, gap-analyse it against the reference photo, implement one focused fix, and verify it. Use when asked to refine, iterate on, improve, or "run loops on" a model, or to close the gap between a model and its reference.
---

# Refinement loop

Drives an existing demo model closer to its reference photo, in bounded and logged iterations.

**Read `grimoire/feedback/refine_loop.md` and follow it.** That file is the procedure; this one
only collects inputs and states the rules that are easy to violate.

## Collect the inputs first

Ask the user for anything not supplied (use AskUserQuestion):

- **model** — a demo id from `src/demos/registry.ts`
- **loops** — how many iterations (a budget, not a target)
- **focus** — one of:
  - `shape` — overall silhouette, proportions, part placement
  - `part` — one named part (ask which)
  - `texture` — materials and surface response only, never geometry
  - `detail` — one identity-defining detail (ask which)
  - `none` — all layers; each loop takes the single highest-severity gap

## Rules that are easy to violate

- **Check the precondition.** No `public/capture-views/<model>.json` means no authored review
  angle. Say so and offer to have the user set it (`npm run dev` → open the demo → overlay the
  reference → "Set capture view") before burning loops on renders that are not comparable.
- **The scripts never score.** `diagnose_render.py` and `make_comparison_sheet.py` package
  evidence. The score comes from your own vision inspecting `comparison.png` against the
  reference. Never report a number a script did not produce and you did not look at.
- **Every plan needs a falsifiable acceptance check** with before → after values. Without one,
  step 4 has nothing to judge and "looks better" becomes the standard.
- **Stay inside the focus.** Record out-of-focus gaps in `gap-analysis.md`; do not fix them.
- **Stop early on repeated defect, oscillation, or plateau**, and report the budget as unspent.
  Ten loops that look busy are worse than three and an explanation.
- **Do not over-claim.** Report before → after values and name what still does not match.
  "Improved" is not "fixed".

## Artifacts

Everything goes to `workbench/<model>/loop-NN/` (gitignored; see `workbench/README.md`), plus one
line per loop in `workbench/<model>/history.jsonl`.
