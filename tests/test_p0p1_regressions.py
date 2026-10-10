"""Integration regressions for the Vue/Electron P0/P1 migration (no live services)."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from coworker.agent import build_engine
from coworker.automation import Schedule, ScheduledTask
from coworker.agents.cowork import cowork_agent
from coworker.compaction import CompactionState, render_transcript, summarize_span, SUMMARY_SECTION_MARKERS
from coworker.config import load_config
from coworker.engine import TurnEngine
from coworker.permissions import PermissionEngine
from coworker.providers.base import AssistantTurn, ModelCapabilities, ProviderClient
from coworker.providers.errors import friendly_model_error
from coworker.runtime_context import capture
from coworker.server.manager import SessionManager
from coworker.toolresult import bound_tool_result, serialize_result
from coworker.tools import ToolRegistry
from coworker.tools.files import file_tools


class Scripted(ProviderClient):
    def __init__(self, turns=()):
        self.turns = list(turns)
        self.calls = []

    def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self.turns.pop(0) if self.turns else AssistantTurn(text="done", finish_reason="stop")

    def capabilities(self, model):
        return ModelCapabilities()


def manager_at(tmp_path, monkeypatch, provider=None):
    monkeypatch.setattr(SessionManager, "_emit_session_created", lambda *args: None)
    monkeypatch.setattr(SessionManager, "_maybe_autotitle", lambda *args: None)
    return SessionManager(data_dir=tmp_path / "state", provider=provider or Scripted())


def test_local_permission_error_is_never_a_model_access_error():
    assert friendly_model_error("m", PermissionError("permission_error: local cache")) is None


def test_runtime_discovery_never_opens_config_or_follows_project_symlinks(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("TOP_SECRET=private-value", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text("private-value", encoding="utf-8")
    (tmp_path / "surfaces_vue").mkdir()
    (tmp_path / "surfaces_vue" / "package.json").write_text("private-value", encoding="utf-8")
    monkeypatch.setattr(Path, "read_text", lambda *args, **kwargs: pytest.fail("discovery read file content"))
    facts = capture(tmp_path, [(tmp_path, True)])
    assert facts["project_entries"]["pyproject.toml"]
    assert facts["project_entries"]["surfaces_vue/package.json"]
    assert "private-value" not in json.dumps(facts) and ".env" not in json.dumps(facts)
    assert all(isinstance(value, bool) for value in facts["tools_available"].values())
    original = Path.is_symlink
    monkeypatch.setattr(Path, "is_symlink", lambda self: self.name == "surfaces_vue" or original(self))
    assert not capture(tmp_path, [])["project_entries"]["surfaces_vue/package.json"]


def test_dangling_calls_repaired_once_before_a_new_request(tmp_path):
    provider = Scripted()
    messages = [
        {"role": "system", "content": "rules"},
        {"role": "assistant", "tool_calls": [
            {"id": "missing", "function": {"name": "write_file", "arguments": "{}"}},
            {"id": "answered", "function": {"name": "read_file", "arguments": "{}"}},
        ]},
        {"role": "tool", "tool_call_id": "answered", "content": "already read"},
        {"role": "user", "content": "old request"},
    ]
    engine = TurnEngine(provider=provider, registry=ToolRegistry(), permissions=PermissionEngine(workspace_root=tmp_path), model="m", messages=messages)
    engine.compaction_state = CompactionState(3, "summary", "state")
    engine._repair_dangling_tool_calls()
    assert engine.compaction_state.boundary_index == 4
    engine._repair_dangling_tool_calls()
    results = [m for m in engine.messages if m.get("tool_call_id") == "missing"]
    assert len(results) == 1 and "interrupt" in results[0]["content"].lower()
    asyncio.run(collect(engine.run("new request")))
    assert not any(e.get("tool_calls") for e in provider.calls[-1]["messages"] if e.get("role") == "user")


async def collect(events):
    return [event async for event in events]


@pytest.mark.parametrize("budget", [2000, 10000])
@pytest.mark.parametrize("structured", [False, True])
def test_chinese_nested_results_fit_and_full_json_can_be_recovered(tmp_path, budget, structured):
    text = "首行\n" + "中文日志与字段 " * 8000 + "\n尾行"
    result = {"ok": True, "items": [{"text": text}]} if structured else text
    bounded = bound_tool_result(result, max_bytes=budget, spill_dir=tmp_path, step=1, tool_name="large_log")
    assert len(serialize_result(bounded).encode("utf-8")) <= budget
    if structured:
        assert isinstance(json.loads(serialize_result(bounded)), dict)
        assert json.loads(Path(bounded["full_result_path"]).read_text(encoding="utf-8")) == result
    else:
        assert bounded.startswith("首行") and bounded.endswith("尾行")
        assert next(tmp_path.glob("*.txt")).read_text(encoding="utf-8") == text


def test_spilled_tool_result_is_readable_from_session_roots(tmp_path):
    engine = build_engine(agent=cowork_agent(), workspace=tmp_path, provider=Scripted(), session_id="readback")
    path = engine._tool_result_spill_dir / "log.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(f"中文行{i}" for i in range(5000)), encoding="utf-8")
    read = file_tools(str(tmp_path), engine.roots)[0]
    page = read(str(path), start_line=3456, max_lines=2)
    assert "中文行3455" in page["content"] and page["end_line"] == 3457


def test_a_structured_but_truncated_summary_is_refused():
    text = "\n".join(f"## {heading}\n" + "details " * 20 for heading in SUMMARY_SECTION_MARKERS)
    provider = Scripted([AssistantTurn(text=text, finish_reason="length")])
    with pytest.raises(RuntimeError, match="output limit"):
        summarize_span(provider, "m", [], max_tokens=24000)
    assert provider.calls[0]["max_tokens"] == 24000


def test_compaction_settings_are_validated_before_mutation(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
    before = manager.compaction_settings()
    assert not manager.set_compaction_settings(threshold_pct=.5, summary_max_tokens=0)["ok"]
    assert manager.compaction_settings() == before
    assert manager.set_compaction_settings(summary_max_tokens=24000)["ok"]
    assert manager.compaction_settings_payload()["compaction_summary_max_tokens"] == 24000
    assert manager_at(tmp_path, monkeypatch).compaction_settings()["summary_max_tokens"] == 24000


def test_environment_output_budgets_reach_engine(tmp_path, monkeypatch):
    for key, value in {"MAX_OUTPUT_TOKENS": "23000", "TOOL_RESULT_MAX_BYTES": "12000", "COMPACTION_SUMMARY_MAX_TOKENS": "24000", "REASONING_EFFORT": "none"}.items():
        monkeypatch.setenv("COWORKER_" + key, value)
    engine = build_engine(agent=cowork_agent(), workspace=tmp_path, provider=Scripted())
    assert engine.model_settings["max_tokens"] == 23000
    assert engine.model_settings["reasoning_effort"] == "none"
    assert engine._tool_result_max_bytes == 12000
    assert engine._compaction_config()["summary_max_tokens"] == 24000
    monkeypatch.setenv("COWORKER_MAX_OUTPUT_TOKENS", "0")
    with pytest.raises(ValueError):
        load_config()


def test_stop_survives_restart_and_cancels_a_racing_sleep(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
    old = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="old reminder")
    manager.stop_session("s")
    race = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="late tool")
    manager.mark_idle("s")
    assert race.state == old.state == "cancelled"
    restarted = manager_at(tmp_path, monkeypatch)
    assert "s" in restarted.wakes.stopped_sessions
    assert asyncio.run(restarted.resume_due_wakes()) == 0
    receipt = restarted.prepare_activity("s", "user activity")
    assert "s" not in restarted.wakes.stopped_sessions
    assert set(receipt["wake_ids"]) == {old.id, race.id}


def test_cancelled_reminder_receipt_survives_crash_without_reinjecting(tmp_path, monkeypatch):
    provider = Scripted()
    manager = manager_at(tmp_path, monkeypatch, provider)
    wake = manager.wakes.add_timer("s", datetime.now(timezone.utc) + timedelta(hours=1), note="publish only after review")
    original_ack = manager.wakes.acknowledge
    monkeypatch.setattr(manager.wakes, "acknowledge", lambda ids: (_ for _ in ()).throw(RuntimeError("crash before cursor update")))
    engine = manager.get_engine("s", agent="cowork", workspace=str(tmp_path))
    receipt = manager.prepare_activity("s", "user activity")
    events = engine.run("New exact request", activity=receipt)

    async def start():
        await anext(events)
        with pytest.raises(RuntimeError, match="crash"):
            manager.save("s", engine)
        await events.aclose()

    asyncio.run(start())
    monkeypatch.setattr(manager.wakes, "acknowledge", original_ack)
    restarted = manager_at(tmp_path, monkeypatch, provider)
    assert restarted.wakes.cancelled_context("s")
    rebuilt = restarted.get_engine("s")
    assert not restarted.wakes.cancelled_context("s")
    assert rebuilt.messages[-1]["content"] == "New exact request"
    assert "publish only after review" in rebuilt._outbound_messages()[-2]["content"]
    fresh = restarted.prepare_activity("s", "user activity")
    assert not fresh["wake_ids"] and not fresh["text"]
    assert "publish only after review" in render_transcript(rebuilt.messages, len(rebuilt.messages))


def test_due_wake_is_not_consumed_while_busy_and_receipted_on_delivery(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
    manager.get_engine("s", agent="cowork", workspace=str(tmp_path))
    wake = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="check once")

    async def go():
        manager.mark_running("s")
        assert await manager.resume_due_wakes() == 0
        manager.mark_idle("s")
        assert await manager.resume_due_wakes() == 1
        assert await manager.resume_due_wakes() == 0
        for _ in range(100):
            if not manager._team_inflight:
                break
            await asyncio.sleep(.01)
        assert wake.state == "fired"
        assert await manager.resume_due_wakes() == 0

    asyncio.run(go())
    users = [m for m in manager.session_store.load("s").messages if m.get("role") == "user"]
    assert len(users) == 1 and "Actual wake time:" in users[0]["content"]


def test_board_receipt_cancels_sleep_and_consumes_only_after_session_commit(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
    manager.get_engine("s", agent="cowork", workspace=str(tmp_path))
    wake = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="prior plan")
    consumed = []

    def consume(*args):
        saved = manager.session_store.load("s")
        assert saved and saved.messages[-1].get("_activity")
        consumed.append(args)

    monkeypatch.setattr(manager.team_store, "consume_feed", consume)
    monkeypatch.setattr(manager.team_store, "consume_subscription", consume)
    receipt = {"space": "board", "actor": "lead", "direct_seq": 7, "subscription_seq": 7}
    assert asyncio.run(manager.deliver_to_session("s", "Board changed", source={"connector": "board"}, board_receipt=receipt))
    assert wake.state == "cancelled" and wake.context_delivered
    assert consumed == [("board", "lead", 7), ("board", "lead", 7)]
    manager.reconcile_activity_receipts("s")
    assert len(consumed) == 2
    assert asyncio.run(manager.resume_due_wakes()) == 0


def test_environment_key_source_and_removal_are_consistent(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-private")
    manager = manager_at(tmp_path, monkeypatch)
    row = next(p for p in manager.get_providers() if p["name"] == "openai")
    assert row["configured"] and row["key_source"] == "env" and row["env_key"] == "OPENAI_API_KEY"
    assert "env-private" not in json.dumps(row)
    assert not manager.remove_provider("openai")["ok"]
    manager.secrets.put("provider:openai", {"api_key": "stored-private"})
    assert next(p for p in manager.get_providers() if p["name"] == "openai")["key_source"] == "store"
    assert manager.remove_provider("openai")["key_source"] == "env"


@pytest.mark.parametrize("finish, expected", [("length", "truncated"), ("stop", "ok")])
def test_scheduled_task_records_truncation_instead_of_success(tmp_path, monkeypatch, finish, expected):
    provider = Scripted([AssistantTurn(text="output", finish_reason=finish)] * 3)
    manager = manager_at(tmp_path, monkeypatch, provider)
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


def test_stopped_queued_input_stays_before_newer_user_request(tmp_path):
    provider = Scripted()
    engine = TurnEngine(provider=provider, registry=ToolRegistry(), permissions=PermissionEngine(workspace_root=tmp_path), model="m")
    engine.queue_steering("Earlier incoming request")
    engine.request_interrupt()
    asyncio.run(collect(engine.run("Newer correction")))
    assert [m["content"] for m in provider.calls[-1]["messages"] if m["role"] == "user"] == ["Earlier incoming request", "Newer correction"]


def test_board_tick_precedes_due_timer_dispatch(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
    calls = []

    async def boards():
        calls.append("board")

    async def timers():
        calls.append("timer")

    monkeypatch.setattr(manager, "team_tick", boards)
    monkeypatch.setattr(manager, "resume_due_wakes", timers)
    asyncio.run(manager._scheduler_tick())
    assert calls == ["board", "timer"]


def test_manual_finalize_refuses_a_truncated_transcript(tmp_path, monkeypatch):
    manager = manager_at(tmp_path, monkeypatch)
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
