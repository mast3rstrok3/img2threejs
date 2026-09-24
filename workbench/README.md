# workbench/

Working evidence for the refinement loop (`grimoire/feedback/refine_loop.md`). **Write loop
artifacts here** — renders, comparison sheets, gap analyses, plans, verdicts.

Everything except this README is gitignored. That is deliberate: the committed artifact of a loop
is the code change it produced, not the hundred PNGs it took to get there. The evidence stays on
disk so the run can be debugged and re-read; it does not enter the repo's history.

## Durable workflow jobs

The self-hosted demo's **Refinement runs** UI stores its local queue under
`workbench/workflows/jobs/<job-id>/`. Each requested loop is a complete invocation of `SKILL.md`,
not one internal capture/fix step. A job contains `job.json`, an immutable `capture-view.json`,
`events.jsonl`, worker logs, and one `invocation-NN/` evidence directory per completed skill run.
The PM2 process `image2threejs-workflow-worker` owns repetition; the skill owns all analysis and
model changes.

## Layout

```
workbench/<demo-id>/
  loop-01/
    render.png        evaluation frame, taken from the model's saved capture view
    orbit-+25.png     extra angles (only with `--orbit`), for the multi-angle gate
    parts.json        window.__IMG2THREEJS_PARTS__ — feeds check_part_coverage.py --manifest
    capture.json      what was captured and how, incl. `viewSource: saved | fallback`
    comparison.png    reference | render sheet from make_comparison_sheet.py
    gap-analysis.md   observed vs. reference, per layer, worst first
    plan.md           the one change this loop makes, with a falsifiable acceptance check
    verify.png        comparison sheet built from the post-fix render
    verdict.md        continue | refine-spec | refine-code | request-input | stop
  loop-02/ ...
  history.jsonl       one line per loop: focus, target, scores, action, artifact paths
```

## Producing a render

```bash
npm run capture -- --model <demo-id> --label loop-01
```

Reads `public/capture-views/<demo-id>.json` for the review angle and viewport. If that file does
not exist the page falls back to bbox auto-framing and records `viewSource: fallback` — a render
framed by arithmetic rather than aligned to the reference photo, and **not comparable across
loops**. Set the angle in the viewer first (`npm run dev` → open the demo → "Set capture view").
