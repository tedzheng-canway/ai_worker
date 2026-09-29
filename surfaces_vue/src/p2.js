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
export const frequencies = {daily:'*',weekdays:'1-5',weekends:'0,6',mon:'1',tue:'2',wed:'3',thu:'4',fri:'5',sat:'6',sun:'0'};
export function scheduleForm(raw) {
  const base={kind:'cron',frequency:'daily',time:'09:00',cron:'',fire_at:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  if(!raw) return {...base,kind:'unchanged'};
  if(raw.kind==='once') return {...base,kind:'once',fire_at:raw.fire_at || '',timezone:raw.timezone || base.timezone};
  const parts=(raw.cron || '').trim().split(/\s+/);
  const freq=Object.keys(frequencies).find(k=>frequencies[k]===parts[4]);
  if(parts.length===5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && Number(parts[0])<60 && Number(parts[1])<24 && parts[2]==='*' && parts[3]==='*' && freq) return {...base,frequency:freq,time:`${parts[1].padStart(2,'0')}:${parts[0].padStart(2,'0')}`,timezone:raw.timezone || base.timezone};
  return {...base,kind:'custom',cron:raw.cron || '',timezone:raw.timezone || base.timezone};
}
export function schedulePayload(form) {
  if(form.kind==='unchanged') return {};
  if(form.kind==='once') { if(!form.fire_at || Number.isNaN(Date.parse(form.fire_at))) throw new Error('请输入有效的单次执行时间'); return {fire_at:form.fire_at,timezone:form.timezone}; }
  if(form.kind==='custom') { if(form.cron.trim().split(/\s+/).length!==5) throw new Error('Cron 需要五个字段'); return {cron:form.cron.trim(),timezone:form.timezone}; }
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) throw new Error('请选择有效时间');
  const [h,m]=form.time.split(':').map(Number);
  return {cron:`${m} ${h} * * ${frequencies[form.frequency] || '*'}`,timezone:form.timezone};
}
export function inboxMatches(live,item) {
  const kinds={approval:['approval'],question:['question'],directory:['dirreq'],tool:['toolreq'],plan:['planreq','teamreq','itemsreq']};
  return kinds[item.kind]?.includes(live.kind) || false;
}
export function parkedPrompt(item,live) {
  if(live && inboxMatches(live,item) && item.kind!=='approval')return live;
  const d=item.data || {};
  if(item.kind==='question') return {kind:'question',text:item.body || item.title,options:item.options || [],questions:item.questions || [],header:item.header,allowText:item.allow_text!==false,multi:!!item.multi};
  if(item.kind==='directory') return {kind:'dirreq',...d};
  if(item.kind==='tool') return {kind:'toolreq',tool:d.tool,reason:item.body,installable:d.installable===true,version:d.version,summary:d.summary};
  if(item.kind==='plan') return {kind:'planreq',plan:d.plan || item.body};
  return {kind:'approval',name:d.tool,args:d.arguments || {},reason:d.reason || item.body,category:d.category,readonlyOk:!!d.readonly_ok,...(live||{}),standingTarget:live?.standingTarget || d.standing_target};
}
export function parkedResolution(item,result,promptKind) {
  if(item.kind==='question') return String(result);
  if(item.kind==='directory') return JSON.stringify({granted:!!result.approved,...result.approved?{path:result.path || item.data?.path || '',writable:item.data?.primary ? true : !!result.writable}:{}});
  if(item.kind==='tool')return JSON.stringify({approved:!!result.approved});
  if(item.kind==='plan') return JSON.stringify({approved:!!result.approved,...result.mode?{mode:result.mode}:{},...result.feedback?{feedback:result.feedback}:{},...(promptKind==='teamreq'?{enable_chat:!!result.enableChat}:{})});
  return result.decision==='once' ? 'allow' : result.decision;
}
