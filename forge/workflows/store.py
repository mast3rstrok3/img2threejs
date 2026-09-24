#!/usr/bin/env python3
"""Atomic JSON job storage shared by the API-facing CLI and worker."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_ROOT = ROOT / "workbench" / "workflows"
JOBS_ROOT = WORKFLOW_ROOT / "jobs"
TERMINAL = {"cancelled", "completed", "stopped-early", "needs-input", "failed"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)


def job_dir(job_id: str) -> Path:
    return JOBS_ROOT / job_id


def job_path(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def load_job(job_id: str) -> dict[str, Any]:
    with job_path(job_id).open(encoding="utf-8") as handle:
        return json.load(handle)


def save_job(job: dict[str, Any], event: str | None = None, **detail: Any) -> dict[str, Any]:
    job["revision"] = int(job.get("revision", 0)) + 1
    job["updatedAt"] = now()
    atomic_json(job_path(job["id"]), job)
    if event:
        append_event(job["id"], event, **detail)
    return job


def append_event(job_id: str, event: str, **detail: Any) -> None:
    path = job_dir(job_id) / "events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"at": now(), "event": event, **detail}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")


def list_jobs(model: str | None = None) -> list[dict[str, Any]]:
    ensure_dirs()
    jobs: list[dict[str, Any]] = []
    for path in JOBS_ROOT.glob("*/job.json"):
        try:
            with path.open(encoding="utf-8") as handle:
                job = json.load(handle)
            if model is None or job.get("model") == model:
                jobs.append(job)
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(jobs, key=lambda job: job.get("createdAt", ""), reverse=True)


def next_queued_job() -> dict[str, Any] | None:
    queued = [job for job in list_jobs() if job.get("status") == "queued"]
    return sorted(queued, key=lambda job: job.get("createdAt", ""))[0] if queued else None

