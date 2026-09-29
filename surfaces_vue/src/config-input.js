export const lines = value => [...new Set(String(value || '').split(/\r?\n/).map(v=>v.trim()).filter(Boolean))];
export function objectJson(value, label='配置') {
  let parsed;
  try { parsed=JSON.parse(value || '{}'); } catch { throw new Error(`${label}必须是有效 JSON`); }
  if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') throw new Error(`${label}必须是 JSON 对象`);
  return parsed;
}
export function mcpImports(value) {
  const parsed=objectJson(value);
  const entries=Object.entries(parsed.mcpServers || parsed);
  if (!entries.length) throw new Error('没有服务器配置');
  for (const [name, config] of entries) if (!name.trim() || !config || typeof config!=='object' || Array.isArray(config) || (!config.command && !config.url)) throw new Error(`${name} 缺少 command 或 url`);
  return entries;
}
export function splitAddress(value) { const text=value.trim(), index=text.indexOf(':'); return index<0 ? ['slack',text] : [text.slice(0,index),text.slice(index+1)]; }
