export function providerDefaults(provider) {
  return Object.fromEntries((provider.fields || []).map(f => [f.key, provider.values?.[f.key] ?? f.default ?? '']));
}
export function visibleProviderFields(provider, fields) {
  return (provider.fields || []).filter(f => !f.show_when || Object.entries(f.show_when).every(([key, value]) => fields[key] === value));
}
export function providerPayload(provider, fields) {
  return Object.fromEntries(visibleProviderFields(provider, fields).map(f => [f.key, fields[f.key] ?? '']));
}
export function memoryNotice(data) {
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  // The server sends previous: '' for additions, not just for a missing field.
  return { kind: 'memory', id, text: String(data.summary || data.content || ''), ...(typeof data.previous === 'string' && data.previous ? { previous: data.previous } : {}) };
}
export function undoMemory(notice, api) {
  return typeof notice.previous === 'string' ? api.updateMemory(notice.id, notice.previous) : api.deleteMemory(notice.id);
}
export function personaConnections(detail) {
  const rows = (detail.recommends || []).map(r => ({ ...r, default: (detail.default_connections || []).find(c => r.kind === 'connector' && c.connector === r.ref) }));
  for (const c of detail.default_connections || []) if (!rows.some(r => r.kind === 'connector' && r.ref === c.connector)) rows.push({ kind: 'connector', ref: c.connector, connected: c.connected, default: c });
  return rows;
}
