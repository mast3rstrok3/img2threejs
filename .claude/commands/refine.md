---
description: Run N refinement loops on a demo model against its reference photo
argument-hint: "[model] [loops] [focus: shape|part|texture|detail|none] [target]"
---

Run the img2threejs refinement loop.

Arguments given (any may be absent): `$ARGUMENTS`

1. Invoke the `refine-loop` skill and follow `grimoire/feedback/refine_loop.md`.
2. Parse whatever was supplied above as `model`, `loops`, `focus`, `target` — in that order.
3. Ask (AskUserQuestion) for anything missing:
   - **model** — offer the demo ids in `src/demos/registry.ts`
   - **loops** — how many iterations to budget
   - **focus** — `shape` (silhouette/proportions) · `part` (one named part) ·
     `texture` (materials only) · `detail` (one identity-defining detail) ·
     `none` (all layers, worst gap first)
   - **target** — required when focus is `part` or `detail`
4. Before starting, confirm `public/capture-views/<model>.json` exists. If it does not, tell the
   user how to set the review angle (`npm run dev` → open the demo → **Overlay reference** →
   orbit onto the photo → **Set capture view**) and ask whether to proceed anyway on fallback
   framing, which is not comparable across loops.

Then run the loops and give the final report in the form
`grimoire/feedback/refine_loop.md` requires: what changed with before → after values, and what
still does not match.
