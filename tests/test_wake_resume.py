"""Phase 3 wiring — self-wake tools registered, scheduler resume hook, wake messages."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from coworker.agent import build_engine
from coworker.agents.code import code_agent
from coworker.agents.cowork import cowork_agent
from coworker.automation.scheduler import Scheduler
from coworker.compaction import render_transcript
from coworker.selfwake import Wake, WakeStore
from coworker.server.manager import SessionManager

from session_fixtures import ScriptedProvider, make_session_manager


class _FakeStore:
    def due(self):
        return []


def test_scheduler_runs_extra_tick():
    async def run():
        hits = {"n": 0}

        async def extra():
            hits["n"] += 1

        sched = Scheduler(_FakeStore(), runner=None, extra_tick=extra)
        await sched._tick(trigger="schedule")
        assert hits["n"] == 1

    asyncio.run(run())


def test_wake_messages_by_kind():
    timer = Wake("1", "s1", "timer", note="poll")
    completion = Wake("2", "s1", "completion", job_id="job-9")
    event = Wake("3", "s1", "event", event_key="pr-opened")
    assert "timer" in SessionManager._wake_message(timer)
    assert "poll" in SessionManager._wake_message(timer)
    assert "job-9" in SessionManager._wake_message(completion)
    assert "pr-opened" in SessionManager._wake_message(event)


def test_selfwake_tools_registered_for_knowledge(tmp_path):
    engine = build_engine(
        agent=cowork_agent(),
        workspace=tmp_path,
        wake_store=WakeStore(tmp_path / "wakes.json"),
        session_id="s1",
    )
    names = set(engine.registry.names())
    assert {"sleep_for", "sleep_until", "wake_on", "wake_on_event"} <= names


def test_selfwake_tools_absent_for_code(tmp_path):
    engine = build_engine(
        agent=code_agent(),
        workspace=tmp_path,
        wake_store=WakeStore(tmp_path / "wakes.json"),
        session_id="s1",
    )
    assert "sleep_until" not in set(engine.registry.names())


def test_stop_survives_restart_and_cancels_a_racing_sleep(tmp_path, monkeypatch):
    manager = make_session_manager(tmp_path, monkeypatch)
    old = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="old reminder")
    manager.stop_session("s")
    race = manager.wakes.add_timer("s", datetime.now(timezone.utc) - timedelta(seconds=1), note="late tool")
    manager.mark_idle("s")
    assert race.state == old.state == "cancelled"
    restarted = make_session_manager(tmp_path, monkeypatch)
    assert "s" in restarted.wakes.stopped_sessions
    assert asyncio.run(restarted.resume_due_wakes()) == 0
    receipt = restarted.prepare_activity("s", "user activity")
    assert "s" not in restarted.wakes.stopped_sessions
    assert set(receipt["wake_ids"]) == {old.id, race.id}


def test_cancelled_reminder_receipt_survives_crash_without_reinjecting(tmp_path, monkeypatch):
    provider = ScriptedProvider()
    manager = make_session_manager(tmp_path, monkeypatch, provider)
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
    restarted = make_session_manager(tmp_path, monkeypatch, provider)
    assert restarted.wakes.cancelled_context("s")
    rebuilt = restarted.get_engine("s")
    assert not restarted.wakes.cancelled_context("s")
    assert rebuilt.messages[-1]["content"] == "New exact request"
    assert "publish only after review" in rebuilt._outbound_messages()[-2]["content"]
    fresh = restarted.prepare_activity("s", "user activity")
    assert not fresh["wake_ids"] and not fresh["text"]
    assert "publish only after review" in render_transcript(rebuilt.messages, len(rebuilt.messages))


def test_due_wake_is_not_consumed_while_busy_and_receipted_on_delivery(tmp_path, monkeypatch):
    manager = make_session_manager(tmp_path, monkeypatch)
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
    manager = make_session_manager(tmp_path, monkeypatch)
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


def test_board_tick_precedes_due_timer_dispatch(tmp_path, monkeypatch):
    manager = make_session_manager(tmp_path, monkeypatch)
    calls = []

    async def boards():
        calls.append("board")

    async def timers():
        calls.append("timer")

    monkeypatch.setattr(manager, "team_tick", boards)
    monkeypatch.setattr(manager, "resume_due_wakes", timers)
    asyncio.run(manager._scheduler_tick())
    assert calls == ["board", "timer"]
