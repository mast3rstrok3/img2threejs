# Refinement Loop

A bounded, logged capture → gap-analysis → fix → verify cycle over an existing demo model. This
is the single source of truth for the loop; the harness wrappers (`.claude/skills/refine-loop/`,
`.claude/commands/refine.md`, `.codex/prompts/refine.md`, `AGENTS.md`) all point here.

Use it when a model already builds and needs to get *closer to its reference*. It is not a
replacement for the staged pipeline in `SKILL.md` — that is how a model comes into existence;
this is how an existing one is driven toward its photo.

## Inputs

Ask for these before starting. Do not guess.

| input | meaning |
| --- | --- |
| `model` | a demo id from `src/demos/registry.ts` (e.g. `glock-ghost-protocol`) |
| `loops` | how many iterations to run — a budget, not a target |
| `focus` | `shape` \| `part` \| `texture` \| `detail` \| `none` |
| `target` | free text; **required** for `part` and `detail` (which part, which detail) |

## Preconditions

1. `public/capture-views/<model>.json` exists. If it does not, stop and tell the user to set the
   angle first: `npm run dev`, open the demo, toggle **Overlay reference**, orbit until the model
   sits on the photo, click **Set capture view**.
   The angle can also be set in the **deployed** app, where it is stored in Workers KV rather than
   the repo. That does nothing for this loop until it is pulled — if the user says they positioned
   a model in production, run `npm run capture-views:pull -- --url <origin>` first
   (`docs/deploy-cloudflare.md`).
   Running without it is allowed, but every log line must record `viewSource: fallback` and the
   final report must say the renders were framed by arithmetic rather than aligned to the
   reference — such renders are not comparable across loops.
2. A reference exists at `public/references/<model>.*`.
3. `npm run typecheck` passes before the first loop. Do not start a refinement run on a red tree;
   you will not be able to tell your breakage from the pre-existing kind.

## Per iteration

`NN` is the loop number, zero-padded: `loop-01`, `loop-02`.

### 1. Capture

```bash
npm run capture -- --model <model> --label loop-NN
```

Writes `workbench/<model>/loop-NN/{render.png,parts.json,capture.json}`. The same saved pose
every loop — that is what makes loop-03 comparable to loop-01. Add `--orbit 25,-25` when the
change is three-dimensional and the multi-angle gate applies.

Check `capture.json`: a `viewSource` of `fallback`, a non-empty `pageErrors`, or a low
`subjectCoverage` all mean the evidence is compromised. Say so rather than scoring it.

### 2. Gap analysis

Run in this order. `SKILL.md` blocks Tier 2 on a render that has not passed Tier 1:

```bash
python3 forge/stage4_review/diagnose_render.py --render workbench/<model>/loop-NN/render.png \
  --reference public/references/<model>.png
python3 forge/stage4_review/make_comparison_sheet.py \
  --reference public/references/<model>.png \
  --render workbench/<model>/loop-NN/render.png \
  --out workbench/<model>/loop-NN/comparison.png --json
```

Then **look at `comparison.png` and the reference with your own vision** and score the seven
layers and the scorecard in `grimoire/feedback/render_capture.md`. The scripts package evidence;
they never produce the score.

Write `gap-analysis.md` — observed vs. reference, per layer, worst first — and `plan.md`.

**Focus narrows what is actionable**, so a loop cannot wander into whatever happens to catch the
eye:

| focus | layers in scope | the plan must target |
| --- | --- | --- |
| `shape` | 1 silhouette/proportions, 2 component structure | bbox proportions, profile curves, part placement |
| `part` | 2, 3 — for the named part only | one name from `parts.json` |
| `texture` | 4 surface response, 5 local features | materials, maps, projection — **never** geometry |
| `detail` | 3 form detail, 5 local features | one identity-defining detail |
| `none` | all 7, ranked | the single highest-severity gap |

Gaps outside the focus still get recorded in `gap-analysis.md`. They just do not get fixed this
loop — writing them down is how the next run knows where to go.

`plan.md` must contain:
- the **file and symbol** to edit (e.g. `src/demos/<model>/create<Name>Model.ts` → `buildSlide()`)
- the change as **before → after values**
- a **falsifiable acceptance check** — "the trigger guard's lower edge sits at y = -0.31, currently
  -0.24". A plan without a measurable check is not a plan; step 4 would have nothing to judge.

### 3. Implement

Edit `src/demos/<model>/create<Name>Model.ts`, or that demo's data JSON for texture work. One
plan, one focused edit set — not "while I'm here". Then:

```bash
npm run typecheck
```

### 4. Verify

Re-capture at the same pose and rebuild the sheet as `verify.png`:

```bash
npm run capture -- --model <model> --label loop-NN
python3 forge/stage4_review/make_comparison_sheet.py \
  --reference public/references/<model>.png \
  --render workbench/<model>/loop-NN/render.png \
  --out workbench/<model>/loop-NN/verify.png --json
```

Judge the **new** render against `plan.md`'s acceptance check — not against your general
impression of whether it looks better. Write `verdict.md` with exactly one action from
`SKILL.md`'s Self-Correction vocabulary:

- `continue` — the check passed. Next loop takes the next-worst gap in the same focus.
- `refine-code` — sound plan, wrong result. One bounded retry inside this same loop number.
- `refine-spec` — the plan itself was wrong about what the model should be.
- `request-input` — the reference cannot answer the question (hidden side, ambiguous material).
- `stop` — further loops will not help.

Then append one line to `workbench/<model>/history.jsonl`:

```json
{"loop":1,"focus":"shape","target":null,"viewSource":"saved","aiVisionScore":0.62,
 "layerScores":{"silhouetteProportion":0.55},"action":"continue",
 "change":"slide length 1.82 -> 1.94","artifacts":"workbench/glock-ghost-protocol/loop-01"}
```

## Termination

Stop early — do not spend the remaining budget — when any of these hold. They mirror the signals
`forge/stage4_review/correction_loop.py` already defines:

- **repeated defect** — the same gap survives two consecutive loops
- **oscillation** — a value moves back and forth across loops without converging
- **plateau** — the score moves less than 0.02 across two loops
- **hard ceiling** — `stop` or `request-input`

Report the remaining budget as unspent, with the reason. Burning ten loops to look thorough is
worse than stopping at three and saying why.

## Final report

Obey `SKILL.md`'s transparency rule:

- list what changed, with concrete **before → after** values, per loop
- name **what still does not match** — explicitly, not as a hedge
- never report "fixed" for "improved"
- if any render used `viewSource: fallback`, say so and say what it means

The user needs to be able to debug the process, not just the output.
