#!/usr/bin/env python3
"""PM2-managed worker: repeat one complete SKILL.md invocation per requested loop."""

from __future__ import annotations

import fcntl
import json
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

from .store import (
    ROOT,
    TERMINAL,
    WORKFLOW_ROOT,
    append_event,
    job_dir,
    load_job,
    next_queued_job,
    now,
    save_job,
)


POLL_SECONDS = max(0.25, float(os.environ.get("IMG2THREEJS_WORKFLOW_POLL_SECONDS", "2")))
CODEX_BIN = os.environ.get("IMG2THREEJS_CODEX_BIN", "codex")
STOP = False
ACTIVE: subprocess.Popen[str] | None = None


def stop_worker(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True
    if ACTIVE and ACTIVE.poll() is None:
        ACTIVE.terminate()


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command, cwd=ROOT, text=True, capture_output=True, check=check, timeout=300
    )


def git_clean() -> bool:
    return not run(["git", "status", "--porcelain", "--untracked-files=no"]).stdout.strip()


def preflight(job: dict[str, Any]) -> bool:
    job["status"] = "preflight"
    save_job(job, "preflight-started")
    capture = job_dir(job["id"]) / "capture-view.json"
    if not capture.exists():
        fail(job, "locked capture view is missing")
        return False
    if not git_clean():
        fail(job, "tracked working tree is not clean; commit or stash existing work")
        return False
    result = run(["npm", "run", "typecheck"], check=False)
    if result.returncode:
        fail(job, f"baseline typecheck failed: {result.stderr[-2000:]}")
        return False
    baseline = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    branch = f"refine/{job['model']}/{job['id']}"
    made = run(["git", "switch", "-c", branch], check=False)
    if made.returncode:
        fail(job, f"could not create branch {branch}: {made.stderr.strip()}")
        return False
    job["baselineCommit"] = baseline
    job["branch"] = branch
    job["startedAt"] = now()
    job["status"] = "running"
    save_job(job, "preflight-passed", branch=branch)
    return True


def fail(job: dict[str, Any], reason: str) -> None:
    job["status"] = "failed"
    job["stopReason"] = reason
    job["finishedAt"] = now()
    save_job(job, "failed", reason=reason)


def prompt_for(job: dict[str, Any], invocation: int, result_path: Path) -> str:
    target = job.get("target")
    return f"""Run the img2threejs repository skill exactly once, all the way to its own terminal
outcome, for the existing demo `{job['model']}`.

This is complete skill invocation {invocation} of a harness budget of {job['iterationBudget']}.
The harness counts complete SKILL.md invocations; it does not perform or prescribe the fix.

Mandatory:
1. Read AGENTS.md and SKILL.md completely, then follow SKILL.md as the authority.
2. Use grimoire/feedback/refine_loop.md where it applies to this existing model.
3. Begin from the current model and prior workbench evidence.
4. The locked user-authored review angle is {job_dir(job['id']) / 'capture-view.json'}.
   Pass it to every capture with `--capture-view` so the angle cannot drift.
5. Focus is `{job['focus']}` and target is {json.dumps(target)}.
6. Perform the gap analysis, then let SKILL.md do the heavy lifting: choose and implement the
   evidence-backed fix, run every applicable gate, capture, inspect with vision, self-correct,
   and continue until this one skill invocation reaches a terminal action.
7. Do not start invocation {invocation + 1}; the harness owns repetition.
8. Preserve unrelated user changes and never reset or discard work.
9. Write JSON to {result_path} with keys:
   schemaVersion=1, jobId, invocation, model, action, aiVisionScore, change,
   remainingMismatch (array), summary. `action` must be one of continue, refine-spec,
   refine-code, request-input, stop.

Be transparent about before/after values and remaining mismatch. A script never scores visuals."""


def invoke_skill(job: dict[str, Any], invocation: int) -> dict[str, Any] | None:
    global ACTIVE
    iteration_dir = job_dir(job["id"]) / f"invocation-{invocation:02d}"
    iteration_dir.mkdir(parents=True, exist_ok=True)
    result_path = iteration_dir / "result.json"
    stdout_path = iteration_dir / "agent.stdout.log"
    stderr_path = iteration_dir / "agent.stderr.log"
    command = [
        CODEX_BIN,
        "exec",
        "-C",
        str(ROOT),
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        prompt_for(job, invocation, result_path),
    ]
    append_event(job["id"], "skill-invocation-started", invocation=invocation)
    with stdout_path.open("w", encoding="utf-8") as stdout, stderr_path.open(
        "w", encoding="utf-8"
    ) as stderr:
        ACTIVE = subprocess.Popen(command, cwd=ROOT, text=True, stdout=stdout, stderr=stderr)
        while ACTIVE.poll() is None:
            time.sleep(1)
            current = load_job(job["id"])
            if current.get("cancelRequested"):
                ACTIVE.terminate()
        code = ACTIVE.returncode
        ACTIVE = None
    if code != 0:
        return None
    try:
        with result_path.open(encoding="utf-8") as handle:
            result = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    if (
        result.get("schemaVersion") != 1
        or result.get("jobId") != job["id"]
        or result.get("invocation") != invocation
        or result.get("model") != job["model"]
        or result.get("action")
        not in {"continue", "refine-spec", "refine-code", "request-input", "stop"}
    ):
        return None
    return result


def commit_invocation(job: dict[str, Any], invocation: int, result: dict[str, Any]) -> None:
    if git_clean():
        append_event(job["id"], "skill-invocation-no-change", invocation=invocation)
        return
    # The skill may legitimately add a new demo-local texture/spec artifact. The preflight clean
    # tree gives this `-A` a safe boundary: every tracked change belongs to this invocation.
    run(["git", "add", "-A"])
    message = (
        f"refine({job['model']}): skill invocation {invocation:02d}\n\n"
        f"Job: {job['id']}\nAction: {result['action']}\n"
        f"Change: {result.get('change') or 'see workbench evidence'}"
    )
    committed = run(["git", "commit", "-m", message], check=False)
    if committed.returncode:
        raise RuntimeError(committed.stderr.strip() or "git commit failed")


def process(job: dict[str, Any]) -> None:
    if not preflight(job):
        return
    while not STOP:
        job = load_job(job["id"])
        if job.get("cancelRequested"):
            job["status"] = "cancelled"
            job["finishedAt"] = now()
            save_job(job, "cancelled")
            return
        if job["completedIterations"] >= job["iterationBudget"]:
            job["status"] = "completed"
            job["finishedAt"] = now()
            save_job(job, "budget-completed")
            return
        invocation = job["completedIterations"] + 1
        job["currentIteration"] = invocation
        job["status"] = "running"
        save_job(job, "skill-invocation-claimed", invocation=invocation)
        result = invoke_skill(job, invocation)
        job = load_job(job["id"])
        if job.get("cancelRequested"):
            job["status"] = "cancelled"
            job["finishedAt"] = now()
            save_job(job, "cancelled", invocation=invocation)
            return
        if result is None:
            fail(job, f"skill invocation {invocation} failed or returned invalid result")
            return
        checked = run(["npm", "run", "typecheck"], check=False)
        if checked.returncode:
            fail(job, f"post-invocation typecheck failed: {checked.stderr[-2000:]}")
            return
        try:
            commit_invocation(job, invocation, result)
        except RuntimeError as error:
            fail(job, str(error))
            return
        job["completedIterations"] = invocation
        job["currentIteration"] = None
        job["lastAction"] = result["action"]
        job["latestScore"] = result.get("aiVisionScore")
        job["latestSummary"] = result.get("summary")
        job["remainingMismatch"] = result.get("remainingMismatch", [])
        save_job(job, "skill-invocation-completed", invocation=invocation, action=result["action"])
        if result["action"] in {"request-input", "stop"}:
            job["status"] = "needs-input" if result["action"] == "request-input" else "stopped-early"
            job["stopReason"] = result.get("summary") or result["action"]
            job["finishedAt"] = now()
            save_job(job, "skill-terminal", action=result["action"])
            return


def main() -> None:
    signal.signal(signal.SIGTERM, stop_worker)
    signal.signal(signal.SIGINT, stop_worker)
    WORKFLOW_ROOT.mkdir(parents=True, exist_ok=True)
    lock_path = WORKFLOW_ROOT / "worker.lock"
    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("another workflow worker already owns this checkout")
        while not STOP:
            job = next_queued_job()
            if job:
                process(job)
            else:
                time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
