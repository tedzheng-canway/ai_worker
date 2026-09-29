export function memoryNotice(data) {
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  // The server sends previous: '' for additions, not just for a missing field.
  return { kind: 'memory', id, text: String(data.summary || data.content || ''), ...(typeof data.previous === 'string' && data.previous ? { previous: data.previous } : {}) };
}
export function undoMemory(notice, api) {
  return typeof notice.previous === 'string' ? api.updateMemory(notice.id, notice.previous) : api.deleteMemory(notice.id);
}
