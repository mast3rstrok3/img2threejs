# /refine — img2threejs refinement loop

> **Setup:** Codex reads custom prompts from `~/.codex/prompts/`, not from the project. To get
> `/refine` as a slash command, link this file once:
> `mkdir -p ~/.codex/prompts && ln -sf "$PWD/.codex/prompts/refine.md" ~/.codex/prompts/refine.md`
> Without that, use `AGENTS.md` — it points at the same procedure and needs no setup.

Run N bounded refinement iterations over an existing demo model, driving it toward its reference
photo.

**Read `grimoire/feedback/refine_loop.md` and follow it.** That is the procedure.

## Inputs — ask for any that were not given

- **model** — a demo id from `src/demos/registry.ts`
- **loops** — how many iterations to budget
- **focus** — `shape` · `part` · `texture` · `detail` · `none`
- **target** — required when focus is `part` or `detail`

## Rules

- No `public/capture-views/<model>.json` means no authored review angle: renders fall back to
  bbox framing, are recorded as `viewSource: fallback`, and are not comparable across loops. Say
  so before spending the budget.
- The scripts package evidence and never score. The score comes from your own vision inspecting
  `comparison.png` against the reference.
- Every plan needs a falsifiable acceptance check with before → after values.
- Stay inside the focus; record other gaps without fixing them.
- Stop early on repeated defect, oscillation, or plateau, and report the unspent budget.
- Report before → after values and name what still does not match. "Improved" is not "fixed".

Artifacts: `workbench/<model>/loop-NN/`, plus a line per loop in `workbench/<model>/history.jsonl`.
