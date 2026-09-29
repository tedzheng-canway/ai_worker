export function personaConnections(detail) {
  const rows = (detail.recommends || []).map(r => ({ ...r, default: (detail.default_connections || []).find(c => r.kind === 'connector' && c.connector === r.ref) }));
  for (const c of detail.default_connections || []) if (!rows.some(r => r.kind === 'connector' && r.ref === c.connector)) rows.push({ kind: 'connector', ref: c.connector, connected: c.connected, default: c });
  return rows;
}
