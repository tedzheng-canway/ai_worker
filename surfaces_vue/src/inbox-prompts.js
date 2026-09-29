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
