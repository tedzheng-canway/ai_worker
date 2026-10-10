"""Interrupted tool calls and queued user requests keep a consistent session history."""

import asyncio

from coworker.compaction import CompactionState
from coworker.engine import TurnEngine
from coworker.permissions import PermissionEngine
from coworker.tools import ToolRegistry

from session_fixtures import ScriptedProvider


async def collect(events):
    return [event async for event in events]


def test_dangling_calls_repaired_once_before_a_new_request(tmp_path):
    provider = ScriptedProvider()
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


def test_stopped_queued_input_stays_before_newer_user_request(tmp_path):
    provider = ScriptedProvider()
    engine = TurnEngine(provider=provider, registry=ToolRegistry(), permissions=PermissionEngine(workspace_root=tmp_path), model="m")
    engine.queue_steering("Earlier incoming request")
    engine.request_interrupt()
    asyncio.run(collect(engine.run("Newer correction")))
    assert [m["content"] for m in provider.calls[-1]["messages"] if m["role"] == "user"] == ["Earlier incoming request", "Newer correction"]
