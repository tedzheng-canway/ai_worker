export function requireSuccess(result) {
  if (result?.ok === false || result?.error) throw new Error(result.error || "保存失败，请重试");
  return result;
}

export function settingsWithDefaults(settings) {
  return {
    sessions_peek: 5, context_bar: false, auto_approve: false,
    pdf_fallback: "text", pdf_max_pages: 20, pdf_max_mb: 10,
    compaction_threshold_pct: 0.8, compaction_cap_tokens: 250000, compaction_model: "",
    ...settings,
  };
}

function boundedNumber(value, min, max, label, integer = false) {
  const n = value === "" || value == null ? NaN : Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${label}须为 ${min}～${max} 之间的${integer ? "整数" : "数值"}`);
  }
  return n;
}

export function compactionPayload(percent, settings) {
  return {
    compaction_threshold_pct: boundedNumber(percent, 10, 95, "触发阈值") / 100,
    compaction_cap_tokens: boundedNumber(settings.compaction_cap_tokens, 10000, 2000000, "令牌上限", true),
    compaction_model: settings.compaction_model?.trim() || "",
  };
}

export function pdfPayload(settings) {
  if (!["text", "images"].includes(settings.pdf_fallback)) throw new Error("请选择文本或图片回退模式");
  return {
    pdf_fallback: settings.pdf_fallback,
    pdf_max_pages: boundedNumber(settings.pdf_max_pages, 1, 100, "PDF 页数", true),
    pdf_max_mb: boundedNumber(settings.pdf_max_mb, 1, 10, "PDF 大小", true),
  };
}

export function sessionLimit(value) {
  return boundedNumber(value, 1, 50, "显示会话数", true);
}

export function mcpConfig(form) {
  if (!form.name.trim()) throw new Error("请填写服务器名称");
  if (form.transport === "http") {
    const url = form.url.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("请填写有效的 HTTP 或 HTTPS 地址");
    return { transport: "http", url };
  }
  const command = form.command.trim();
  if (!command) throw new Error("请填写可执行程序名称或完整路径");
  // One argument per line: preserve spaces and Windows backslashes verbatim.
  const args = (form.args || "").split(/\r?\n/).filter((line) => line.length > 0);
  return { transport: "stdio", command, args };
}

export function contextUsage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const count = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  return { model: raw.model || "", tokens: count(raw.input) + count(raw.cache_read) + count(raw.cache_write) };
}

export function historyUsage(rows) {
  let usage = null;
  for (const row of rows) if (row.role === "assistant" && row.usage) usage = contextUsage(row.usage);
  return usage;
}
