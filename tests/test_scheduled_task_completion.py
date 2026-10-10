"""Scheduled and manual task runs distinguish complete output from truncation."""

import asyncio

import pytest

from coworker.automation import Schedule, ScheduledTask
from coworker.providers.base import AssistantTurn

from session_fixtures import ScriptedProvider, make_session_manager


@pytest.mark.parametrize("finish, expected", [("length", "truncated"), ("stop", "ok")])
def test_scheduled_task_records_truncation_instead_of_success(tmp_path, monkeypatch, finish, expected):
    provider = ScriptedProvider([AssistantTurn(text="output", finish_reason=finish)] * 3)
    manager = make_session_manager(tmp_path, monkeypatch, provider)
    task = ScheduledTask("Scheduled task", "Complete the report", Schedule("cron", cron="0 * * * *"), str(tmp_path))
    manager.task_store.save(task)
    run = asyncio.run(manager._run_scheduled_task(task, "schedule"))
    assert run.status == expected
    assert not manager.is_running(run.session_id)
    assert manager.task_store.runs(task.id)[0].status == expected
    if finish == "length":
        assert manager.session_store.load(run.session_id).messages[-1].get("kind") == "truncated"
    else:
        assert run.result_text == "output"


def test_manual_finalize_refuses_a_truncated_transcript(tmp_path, monkeypatch):
    manager = make_session_manager(tmp_path, monkeypatch)
    task = ScheduledTask("Manual", "Finish the report", Schedule("cron", cron="0 * * * *"), str(tmp_path))
    manager.task_store.save(task)
    prepared = manager.prepare_manual_run(task.id)
    engine = manager.get_engine(prepared["session_id"], agent="cowork", workspace=str(tmp_path))
    engine.messages.extend([
        {"role": "assistant", "content": "partial", "finish_reason": "length"},
        {"role": "notice", "kind": "truncated", "text": "output limit"},
    ])
    manager.save(prepared["session_id"], engine)
    assert not manager.finalize_manual_run(task.id, prepared["run_id"])["ok"]
    assert manager.task_store.runs(task.id)[0].status == "running"
    engine.messages.append({"role": "assistant", "content": "done", "finish_reason": "stop"})
    manager.save(prepared["session_id"], engine)
    assert manager.finalize_manual_run(task.id, prepared["run_id"])["ok"]
    assert manager.task_store.runs(task.id)[0].status == "ok"
