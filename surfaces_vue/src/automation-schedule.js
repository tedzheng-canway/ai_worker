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
