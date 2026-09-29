import { requireSuccess } from "./settings.js";

// Existing backend finalize only supports success. Failed/interrupted turns must
// never call it; their local notes explicitly say the server remains unsettled.
export class ManualRuns {
  constructor({ finalize, storage, onChange = () => {} }) {
    this.finalize = finalize;
    this.storage = storage;
    this.onChange = onChange;
    this.entries = new Map();
    this.inflight = new Set();
    try {
      for (const entry of JSON.parse(storage?.getItem("vue-manual-runs") || "[]")) {
        if (entry.session_id && entry.run_id && entry.task_id) {
          if (entry.state === "pending") entry.state = "running"; // Recover via ready; never resend a possibly delivered prompt.
          this.entries.set(entry.session_id, entry);
        }
      }
    } catch {}
  }

  changed() {
    const entries = [...this.entries.values()];
    try { this.storage?.setItem("vue-manual-runs", JSON.stringify(entries)); } catch {}
    this.onChange(entries.map((entry) => ({ ...entry })));
  }

  track(prepared) {
    this.entries.set(prepared.session_id, {
      task_id: prepared.task_id, run_id: prepared.run_id, session_id: prepared.session_id,
      workspace: prepared.workspace, agent: prepared.agent, state: "pending", note: "",
    });
    this.changed();
  }

  watching(id) { return ["pending", "running", "completed"].includes(this.entries.get(id)?.state); }

  async event(id, event) {
    const entry = this.entries.get(id);
    if (!entry || entry.state === "done") return;
    const data = event.data || {};
    if (event.type === "turn_start" && !this.inflight.has(id)) {
      entry.state = "running";
      entry.note = "";
    } else if (event.type === "turn_end") {
      if (data.status === "completed" && entry.state === "running") entry.state = "completed";
      else if (data.status !== "completed") {
        entry.state = "failed";
        entry.note = "运行未完成，未上报成功；后端记录暂未结算。";
      }
    } else if (["error", "interrupted"].includes(event.type)) {
      entry.state = "failed";
      entry.note = `${event.type === "interrupted" ? "已停止" : data.error || "运行失败"}。未上报成功；后端记录暂未结算。`;
    } else if (event.type === "input_rejected" && entry.state === "pending") {
      entry.state = "failed";
      entry.note = `${data.error || "任务未能提交"}。后端记录暂未结算。`;
    } else if (event.type === "turn_done" && entry.state === "completed") {
      return this.finish(id);
    } else return;
    this.changed();
  }

  async finish(id) {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== "completed" || this.inflight.has(id)) return;
    this.inflight.add(id);
    try {
      requireSuccess(await this.finalize(entry.task_id, entry.run_id));
      entry.state = "done";
      entry.note = "";
    } catch (error) {
      entry.note = `完成状态回写失败：${error.message}。可重试回写。`;
    } finally {
      this.inflight.delete(id);
      this.changed();
    }
  }

  // A reconnected socket may have missed turn_done. Only finalize an observed
  // successful turn; transcript text alone can also be an interrupted partial.
  disconnected(id) {
    const entry = this.entries.get(id);
    if (entry && this.watching(id)) {
      entry.note = "运行监听已断开，正在重新连接…";
      this.changed();
    }
  }

  async ready(id, running) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (running) {
      if (entry.state !== "completed") entry.state = "running";
      entry.note = "";
      this.changed();
    } else if (entry.state === "completed") await this.finish(id);
    else if (entry.state === "running") {
      entry.state = "unknown";
      entry.note = "任务已停止运行，但未收到完整结束事件。请查看会话核对结果；未自动上报成功。";
      this.changed();
    }
  }
}
