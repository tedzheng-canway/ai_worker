import test from "node:test";
import assert from "node:assert/strict";
import { compactionPayload, contextUsage, historyUsage, mcpConfig, pdfPayload, requireSuccess, sessionLimit, settingsWithDefaults } from "../src/settings.js";
import { historyItems } from "../src/history.js";
import { ManualRuns } from "../src/manualRuns.js";

test("compression: 80% becomes 0.8 and backend values round-trip", () => {
  const settings = settingsWithDefaults({ compaction_model: " test:model " });
  const payload = compactionPayload(80, settings);
  assert.deepEqual(payload, { compaction_threshold_pct: 0.8, compaction_cap_tokens: 250000, compaction_model: "test:model", compaction_summary_max_tokens: 16000 });
  assert.equal(payload.compaction_threshold_pct * 100, 80);
  for (const invalid of ["", null, NaN, 9, 96, 100]) assert.throws(() => compactionPayload(invalid, settings));
  assert.throws(() => compactionPayload(80, { ...settings, compaction_cap_tokens: 9999 }));
  assert.throws(() => compactionPayload(80, { ...settings, compaction_summary_max_tokens: 0 }));
  assert.equal(compactionPayload(80, { ...settings, compaction_summary_max_tokens: 24000 }).compaction_summary_max_tokens, 24000);
});

test("PDF: correct enums, numeric bounds and integer validation", () => {
  assert.deepEqual(pdfPayload(settingsWithDefaults({ pdf_fallback: "images" })), { pdf_fallback: "images", pdf_max_pages: 20, pdf_max_mb: 10 });
  for (const patch of [{ pdf_fallback: "attach" }, { pdf_max_pages: 101 }, { pdf_max_pages: 1.5 }, { pdf_max_mb: 11 }, { pdf_max_mb: "" }]) {
    assert.throws(() => pdfPayload(settingsWithDefaults(patch)));
  }
});

test("business rejection is not a successful save", () => {
  assert.throws(() => requireSuccess({ ok: false, error: "backend rejected" }), /backend rejected/);
  assert.equal(requireSuccess({ ok: true, pdf_max_mb: 8 }).pdf_max_mb, 8);
});

test("MCP keeps executable, arguments, spaces and Windows paths separate", () => {
  assert.deepEqual(mcpConfig({ name: "test", transport: "stdio", command: "npx", args: "-y\r\npackage-name\r\nD:\\My Project" }), {
    transport: "stdio", command: "npx", args: ["-y", "package-name", "D:\\My Project"],
  });
  assert.deepEqual(mcpConfig({ name: "local", command: "C:\\Program Files\\Python\\python.exe", args: "  argument with spaces  " }), {
    transport: "stdio", command: "C:\\Program Files\\Python\\python.exe", args: ["  argument with spaces  "],
  });
  assert.throws(() => mcpConfig({ name: "  ", command: "npx" }));
  assert.throws(() => mcpConfig({ name: "remote", transport: "http", url: "file:///bad" }));
});

test("tool replay preserves user/reviewer denials and approval provenance", () => {
  const rows = [{ role: "assistant", tool_calls: ["u", "r", "ok", "missing"].map((id) => ({ id, function: { name: "run_shell", arguments: '{"command":"test"}' } })) },
    { role: "tool", tool_call_id: "u", content: "denied", _display: { approval_origin: "user", approval_grant: "deny", approval_note: "用户拒绝" } },
    { role: "tool", tool_call_id: "r", content: "denied", _display: { approval_origin: "reviewer_denied", approval_note: "risk" } },
    { role: "tool", tool_call_id: "ok", content: "done", _display: { approval_origin: "reviewer", approval_note: "safe" } }];
  const items = historyItems(rows);
  assert.deepEqual(items.map((item) => item.status), ["denied", "denied", "ok", "unknown"]);
  assert.equal(items[0].approvalOrigin, "user");
  assert.equal(items[1].approvalNote, "risk");
  assert.equal(items[2].preview, "done");
});

test("context meter uses latest prompt usage, not cumulative output", () => {
  const rows = [{ role: "assistant", usage: { model: "a", input: 100, output: 200 } }, { role: "assistant", usage: { model: "b", input: 10, cache_read: 20, cache_write: 30 } }];
  assert.deepEqual(historyUsage(rows), { model: "b", tokens: 60 });
  assert.deepEqual(contextUsage({ input: -5, cache_read: "20", cache_write: "bad" }), { model: "", tokens: 20 });
  assert.equal(historyUsage([]), null);
});

test("session display count accepts only supported integer values", () => {
  assert.equal(sessionLimit("5"), 5);
  for (const value of [0, 51, "", 1.5]) assert.throws(() => sessionLimit(value));
});

function tracker(finalize = async () => ({ ok: true }), storage) {
  const runs = new ManualRuns({ finalize, storage });
  runs.track({ task_id: "task", run_id: "run", session_id: "session", workspace: "D:/project", agent: "cowork" });
  return runs;
}
const event = (type, data = {}) => ({ type, data });

test("manual run finalizes only after successful turn completion, once", async () => {
  const calls = [];
  const runs = tracker(async (...args) => { calls.push(args); return { ok: true }; });
  await runs.event("session", event("turn_start"));
  await runs.event("other", event("turn_done"));
  await runs.event("session", event("assistant_message", { text: "answer" }));
  assert.equal(calls.length, 0);
  await runs.event("session", event("turn_end", { status: "completed" }));
  await Promise.all([runs.event("session", event("turn_done")), runs.event("session", event("turn_done"))]);
  await runs.event("session", event("turn_done"));
  assert.deepEqual(calls, [["task", "run"]]);
  assert.equal(runs.entries.get("session").state, "done");
});

test("errors, interruptions, rejected sends and iteration limits never report success", async () => {
  for (const failure of [event("error", { error: "bad" }), event("interrupted"), event("turn_end", { status: "max_iterations_exceeded" })]) {
    let calls = 0;
    const runs = tracker(async () => { calls++; });
    await runs.event("session", event("turn_start"));
    await runs.event("session", failure);
    await runs.event("session", event("turn_done"));
    assert.equal(calls, 0);
    assert.equal(runs.entries.get("session").state, "failed");
    assert.match(runs.entries.get("session").note, /未结算/);
  }
  const rejected = tracker();
  await rejected.event("session", event("input_rejected", { error: "unavailable" }));
  assert.equal(rejected.entries.get("session").state, "failed");
});

test("failed finalize stays retryable without duplicate concurrent requests", async () => {
  let calls = 0;
  const runs = tracker(async () => ++calls === 1 ? { ok: false, error: "temporary failure" } : { ok: true });
  await runs.event("session", event("turn_start"));
  await runs.event("session", event("turn_end", { status: "completed" }));
  await runs.event("session", event("turn_done"));
  assert.equal(runs.entries.get("session").state, "completed");
  assert.match(runs.entries.get("session").note, /temporary failure/);
  await Promise.all([runs.finish("session"), runs.finish("session")]);
  assert.equal(calls, 2);
  assert.equal(runs.entries.get("session").state, "done");
});

test("reconnect recovers observed success, never guesses from a missing end event", async () => {
  const data = new Map();
  const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) };
  const runs = tracker(undefined, storage);
  await runs.event("session", event("turn_start"));
  await runs.event("session", event("turn_end", { status: "completed" }));
  let calls = 0;
  const restored = new ManualRuns({ storage, finalize: async () => { calls++; return { ok: true }; } });
  await restored.ready("session", false);
  assert.equal(calls, 1);
  const uncertain = tracker(async () => { throw new Error("must not finalize"); });
  await uncertain.event("session", event("turn_start"));
  uncertain.disconnected("session");
  await uncertain.ready("session", false);
  assert.equal(uncertain.entries.get("session").state, "unknown");
});
