#!/usr/bin/env python3
"""Contract tests for the durable SKILL.md invocation harness."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from forge.workflows import store, worker


def sample_job(job_id="20260727120000-deadbeef"):
    return {
        "schemaVersion": 1,
        "revision": 0,
        "id": job_id,
        "workflow": "skill-refinement",
        "model": "medical-clinic",
        "iterationBudget": 3,
        "completedIterations": 0,
        "currentIteration": None,
        "focus": "shape",
        "target": None,
        "status": "queued",
        "cancelRequested": False,
    }


class WorkflowStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.jobs = Path(self.temp.name) / "jobs"
        self.patch_jobs = patch.object(store, "JOBS_ROOT", self.jobs)
        self.patch_jobs.start()

    def tearDown(self):
        self.patch_jobs.stop()
        self.temp.cleanup()

    def test_atomic_save_load_and_revision(self):
        job = sample_job()
        store.save_job(job, "queued")
        loaded = store.load_job(job["id"])
        self.assertEqual(loaded["revision"], 1)
        self.assertEqual(loaded["status"], "queued")
        events = (self.jobs / job["id"] / "events.jsonl").read_text()
        self.assertEqual(json.loads(events)["event"], "queued")

    def test_list_filters_by_model(self):
        first = sample_job()
        second = sample_job("20260727120001-feedface")
        second["model"] = "classic-fade"
        store.save_job(first)
        store.save_job(second)
        self.assertEqual([j["id"] for j in store.list_jobs("medical-clinic")], [first["id"]])

    def test_next_job_is_oldest_queued(self):
        first = sample_job()
        first["createdAt"] = "2026-07-27T12:00:00Z"
        second = sample_job("20260727120001-feedface")
        second["createdAt"] = "2026-07-27T12:00:01Z"
        store.save_job(second)
        store.save_job(first)
        self.assertEqual(store.next_queued_job()["id"], first["id"])


class SkillInvocationPromptTest(unittest.TestCase):
    def test_harness_delegates_the_whole_fix_to_skill(self):
        job = sample_job()
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(worker, "job_dir", return_value=Path(temp)):
                prompt = worker.prompt_for(job, 1, Path(temp) / "result.json")
        self.assertIn("Read AGENTS.md and SKILL.md completely", prompt)
        self.assertIn("let SKILL.md do the heavy lifting", prompt)
        self.assertIn("until this one skill invocation reaches a terminal action", prompt)
        self.assertIn("Do not start invocation 2", prompt)
        self.assertIn("--capture-view", prompt)


if __name__ == "__main__":
    unittest.main(verbosity=2)
