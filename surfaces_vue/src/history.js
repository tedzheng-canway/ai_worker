import { historyAttachments } from './attachments.js';
export const truncatedText = '输出多次达到上限，任务尚未完成。可提高输出上限、降低推理强度后重试。';
export function assistantMeta(row = {}) {
  return { finishReason: row.finish_reason, maxOutputTokens: row.max_output_tokens, reasoningEffort: row.reasoning_effort };
}
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
    if (row.role === "user") {
      if (row._display?.kind === 'continuation') result.push({ kind: 'continuation', attempt: row._display.attempt, ts: row.ts });
      else result.push(row.source?.connector ? { kind:'connector', source:row.source, text:row.source.text || contentText(row.content), ts:row.source.ts || row.ts } : { kind: "user", text: typeof row._display === "string" ? row._display : contentText(row.content), attachments: historyAttachments(row.content), ts: row.ts });
    }
    if (row.role === "assistant") {
      if (row.content || row.reasoning || row.finish_reason === 'length') result.push({ kind: "assistant", text: contentText(row.content), reasoning: row.reasoning, ts: row.ts, ...assistantMeta(row) });
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
    if (row.role === "notice") {
      if (row.kind === 'compacted') result.push({ kind: 'compaction', record: row.compaction || {}, text: row.text });
      else result.push({ kind: 'notice', text: row.kind === 'truncated' ? truncatedText : row.kind === 'interrupted' ? '已停止生成' : row.text || row.content || '系统提示', retriable: ['error', 'truncated'].includes(row.kind) });
    }
  }
  return result.filter((item) => item.text || ['connector', 'tool', 'continuation', 'compaction'].includes(item.kind) || item.finishReason === 'length' || item.reasoning || item.attachments?.length);
}

export const approvalLabels = { user: "用户审批", reviewer: "自动审查", reviewer_denied: "自动审查拒绝", user_denied: "用户拒绝", bypass: "绕过审批" };
