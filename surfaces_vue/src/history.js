import { historyAttachments } from './attachments.js';
export function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content ? JSON.stringify(content, null, 2) : "";
  return content.filter((part) => part?.type === "text").map((part) => part.text).join("\n\n");
}

export function approvalMeta(data = {}) {
  return {
    approvalOrigin: data.approval_origin || "",
    approvalNote: data.approval_note || data.reviewer_reason || "",
    approvalGrant: data.approval_grant || data.standing_rule || "",
    standingRule: data.standing_rule || "",
    reviewerReason: data.reviewer_reason || "",
    allowAnyway: data.allow_anyway,
    hidden: Math.max(0, Number(data.display?.hidden_by_filters ?? data.hidden_by_filters) || 0),
  };
}

export function historyItems(rows) {
  const tools = new Map(rows.filter((row) => row.role === "tool" && row.tool_call_id).map((row) => [row.tool_call_id, row]));
  const result = [];
  for (const row of rows) {
    if (row.role === "user") result.push(row.source?.connector ? { kind:'connector', source:row.source, text:row.source.text || contentText(row.content), ts:row.source.ts || row.ts } : { kind: "user", text: typeof row._display === "string" ? row._display : contentText(row.content), attachments: historyAttachments(row.content), ts: row.ts });
    if (row.role === "assistant") {
      if (row.content || row.reasoning) result.push({ kind: "assistant", text: contentText(row.content), reasoning: row.reasoning, ts: row.ts });
      for (const call of row.tool_calls || []) {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}
        const tool = tools.get(call.id);
        const meta = approvalMeta(tool?._display);
        const denied = meta.approvalOrigin === "reviewer_denied" || meta.approvalOrigin === "user_denied" || meta.approvalGrant === "deny";
        result.push({ kind: "tool", id: call.id, name: call.function?.name, args,
          status: denied ? "denied" : tool ? "ok" : "unknown", preview: contentText(tool?.content), ...meta });
      }
    }
    if (row.role === "notice") result.push({ kind: "notice", text: row.text || row.content || "系统提示" });
  }
  return result.filter((item) => item.text || item.kind === "connector" || item.kind === "tool" || item.reasoning || item.attachments?.length);
}

export const approvalLabels = { user: "用户审批", reviewer: "自动审查", reviewer_denied: "自动审查拒绝", user_denied: "用户拒绝", bypass: "绕过审批" };
