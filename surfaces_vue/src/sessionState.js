export const emptyUsage = () => ({});
export function addUsage(previous, raw) {
  if (!raw || typeof raw !== 'object') return previous;
  const key = raw.model || 'unknown', totals = { ...previous[key] };
  for (const field of ['input', 'output', 'cache_read', 'cache_write']) totals[field] = (totals[field] || 0) + (Number.isFinite(Number(raw[field])) ? Math.max(0, Number(raw[field])) : 0);
  return { ...previous, [key]: totals };
}
export const usageTotals = (rows) => rows.filter(r => r.role === 'assistant').reduce((sum, row) => addUsage(sum, row.usage), {});
// The backend todo_write schema uses "done"; the progress UI uses "completed".
// Normalize both live tool arguments and restored history at this boundary.
export const normalizeTodos = (items) => (Array.isArray(items) ? items : []).map((item) => typeof item === 'string' ? { content: item, status: 'pending' } : { content: item.content || item.title || '', status: item.status === 'done' ? 'completed' : item.status || 'pending' });
export function transcriptGroups(items) {
  const groups = [];
  for (const item of items) {
    if (item.kind === 'tool' && groups.at(-1)?.kind === 'steps') groups.at(-1).items.push(item);
    else groups.push(item.kind === 'tool' ? { kind: 'steps', items: [item] } : item);
  }
  return groups;
}
