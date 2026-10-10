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
const pendingKinds = new Set(['approval', 'question', 'dirreq', 'toolreq', 'planreq', 'teamreq', 'itemsreq']);

// Match the reference transcript: narration, tools and resolved approvals form a turn.
// Its final answer leaves the group only once the turn is no longer live.
export function transcriptGroups(items, running = false) {
  const groups = [];
  let turn = [], start = 0;
  function flush(live = false) {
    if (!turn.length) return;
    const entries = [...turn], answers = [];
    if (!(live && entries.some(item => item.kind !== 'assistant'))) {
      while (entries.at(-1)?.kind === 'assistant') answers.unshift(entries.pop());
    }
    if (entries.some(item => item.kind !== 'assistant')) groups.push({ kind: 'steps', key: `turn-${start}`, items: entries, live });
    else groups.push(...entries);
    groups.push(...answers);
    turn = [];
  }
  items.forEach((item, index) => {
    if (item.kind === 'tool' || item.kind === 'assistant' || (item.kind === 'approval' && item.resolved)) {
      if (!turn.length) start = index;
      turn.push(item);
    } else if (!(pendingKinds.has(item.kind) && !item.resolved)) {
      flush();
      groups.push(item);
    }
  });
  flush(running);
  return groups;
}

export const isToolRunning = status => status === 'running' || status === '…';
export const isDeclined = value => value === 'deny' || value === 'denied';

// Pair a resolved approval with the closest matching call, keeping declined or
// unexecuted requests as their own intent rows, just as the reference frontend does.
export function turnRows(items) {
  const rows = items.filter(item => item.kind !== 'approval' && (item.kind !== 'assistant' || item.text || item.reasoning))
    .map(item => item.kind === 'assistant' ? { kind: 'narration', item } : { kind: 'step', item });
  for (const approval of items.filter(item => item.kind === 'approval')) {
    const position = items.indexOf(approval);
    const match = rows.filter(row => row.kind === 'step' && row.item.name === approval.name && !row.approval)
      .sort((a, b) => Math.abs(items.indexOf(a.item) - position) - Math.abs(items.indexOf(b.item) - position))[0];
    if (match && !isDeclined(approval.resolved)) match.approval = approval;
    else {
      const after = items.slice(0, position).filter(item => item.kind !== 'approval' && (item.kind !== 'assistant' || item.text || item.reasoning));
      const before = [...after].reverse().find(item => rows.some(row => row.item === item));
      let at = before ? rows.findIndex(row => row.item === before) + 1 : 0;
      while (rows[at]?.kind === 'ask') at++;
      rows.splice(at, 0, { kind: 'ask', item: approval });
    }
  }
  return rows;
}
