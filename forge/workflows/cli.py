#!/usr/bin/env python3
"""Local inspection and control commands for refinement workflow jobs."""

from __future__ import annotations

import argparse
import json
import sys

from .store import TERMINAL, list_jobs, load_job, save_job


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage img2threejs refinement workflow jobs")
    sub = parser.add_subparsers(dest="command", required=True)
    listing = sub.add_parser("list")
    listing.add_argument("--model")
    listing.add_argument("--json", action="store_true")
    status = sub.add_parser("status")
    status.add_argument("job_id")
    status.add_argument("--json", action="store_true")
    cancel = sub.add_parser("cancel")
    cancel.add_argument("job_id")
    return parser


def print_job(job: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(job, indent=2, sort_keys=True))
        return
    print(
        f"{job['id']}  {job['status']}  {job['model']}  "
        f"{job['completedIterations']}/{job['iterationBudget']}  "
        f"{job['focus']}"
    )


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "list":
        jobs = list_jobs(args.model)
        if args.json:
            print(json.dumps(jobs, indent=2, sort_keys=True))
        else:
            for job in jobs:
                print_job(job, False)
        return 0
    try:
        job = load_job(args.job_id)
    except FileNotFoundError:
        print(f"unknown job: {args.job_id}", file=sys.stderr)
        return 2
    if args.command == "status":
        print_job(job, args.json)
        return 0
    if job["status"] in TERMINAL:
        print_job(job, False)
        return 0
    job["cancelRequested"] = True
    if job["status"] == "queued":
        job["status"] = "cancelled"
    else:
        job["status"] = "cancelling"
    save_job(job, "cancel-requested", source="cli")
    print_job(job, False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

