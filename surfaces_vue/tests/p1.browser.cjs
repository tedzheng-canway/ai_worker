const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path = require('node:path');
const XLSX = require('xlsx');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=', 'base64');
function pdfFile() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
  let data = '%PDF-1.4\n', offsets = [0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(data)); data += `${i+1} 0 obj\n${obj}\nendobj\n`;});
  const offset = Buffer.byteLength(data);
  data += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  return Buffer.from(data);
}
function setup(state) {
  state.ready = { workspace:'D:/work', temp_workspace:true };
  state.skills = [{name:'report',description:'生成报告',instructions:'# Report\nWrite a report',scope:'global',enabled:true},{name:'muted',description:'不启用',instructions:'Skip',scope:'global',enabled:false}];
  state.sessionMutes = new Set(); state.roots = [{path:'D:/work',writable:true,primary:true,exists:true}]; state.trusted=[];
  state.binding={memory:null,board:null}; state.named={memory:[{name:'知识库',key:'memory-key'}],board:[{name:'运营',key:'board-key'}]};
  state.pdfPages=1; state.failRoot=false;
  const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Name','Amount'],['Sample',42]]),'Report');
  state.files = {
    'report.md':{kind:'markdown',content:'# Report\n\n[网页](artifact:report.html)'},
    'report.html':{kind:'html',content:'<h1>Isolated report</h1><script>try { parent.document.body.dataset.leaked="yes" } catch { document.body.dataset.blocked="yes" }</script><img src="https://invalid.example/leak">'},
    'data.csv':{kind:'csv',content:'name,value\n"a,b",42'},
    'book.xlsx':{kind:'sheet',data_url:'data:application/octet-stream;base64,'+XLSX.write(book,{type:'base64',bookType:'xlsx'})},
    'doc.pdf':{kind:'pdf',data_url:'data:application/pdf;base64,'+pdfFile().toString('base64')},
    'image.png':{kind:'image',data_url:'data:image/png;base64,'+png.toString('base64')},
    'notes.txt':{kind:'text',content:'plain notes'},
    'D:/work':{kind:'folder',entries:[{name:'notes.txt',dir:false}]},
    'D:/work/notes.txt':{kind:'text',content:'folder notes'},
  };
  state.extraRoute = (url, body, req) => {
    const p=url.pathname, method=req.method();
    if(p==='/v1/skills/upload') return {ok:true,token:'upload-token',name:'imported',description:'Uploaded skill',instructions:'# Uploaded',files:['SKILL.md','scripts/run.py']};
    if(p==='/v1/skills/upload/confirm') {state.skills.push({name:'imported',description:'Uploaded skill',instructions:'# Uploaded',enabled:true,scope:'global'}); return {ok:true};}
    if(p==='/v1/skills') {if(method==='POST') state.skills.push({...body,enabled:true}); return {ok:true,skills:state.skills};}
    if(p.startsWith('/v1/skills/')) { const name=decodeURIComponent(p.split('/')[3]); if(method==='PATCH') Object.assign(state.skills.find(s=>s.name===name),body); if(method==='DELETE') state.skills=state.skills.filter(s=>s.name!==name); return {ok:true}; }
    if(p.endsWith('/skills')) {if(method==='POST') body.enabled ? state.sessionMutes.delete(body.skill) : state.sessionMutes.add(body.skill);return {ok:true,skills:state.skills.filter(s=>s.enabled).map(s=>({...s,enabled:!state.sessionMutes.has(s.name)}))};}
    if(p.endsWith('/artifacts/read')) return {ok:true,...state.files[url.searchParams.get('path')]};
    if(p.endsWith('/artifacts')) return {artifacts:Object.entries(state.files).filter(([name])=>!name.includes('/')).map(([name,info])=>({name,path:name,kind:info.kind,size:20}))};
    if(p==='/v1/attachments/inspect-pdf') return {ok:true,pages:state.pdfPages,bytes:10};
    if(p.endsWith('/roots')) {if(method==='POST') {if(state.failRoot)return {ok:false,error:'目录不可访问'};const found=state.roots.find(r=>r.path===body.path);if(found)found.writable=body.writable;else state.roots.push({...body,primary:false,exists:true});} if(method==='DELETE')state.roots=state.roots.filter(r=>r.path!==url.searchParams.get('path'));return {ok:true,roots:state.roots};}
    if(p==='/v1/workspaces/trusted')return {workspaces:state.trusted};
    if(p==='/v1/workspaces/trust'){state.trusted=state.trusted.filter(r=>r.workspace!==body.path);if(body.trusted)state.trusted.push({workspace:body.path,requested_commands:['npm test'],trusted:true});return {ok:true};}
    if(p==='/v1/workspaces/temp')return {ok:true,path:'D:/scratch'};
    if(p.endsWith('/save-as-project')){state.ready.workspace=body.path;state.ready.temp_workspace=false;return {ok:true,path:body.path};}
    if(p.endsWith('/project-menu')){const kind=url.searchParams.get('kind');return {kind,bound:state.binding[kind],derived:{key:'derived',label:'work',kind:'folder'},named:state.named[kind]};}
    if(p.endsWith('/bindings')){state.binding[body.kind]=body.name;return {ok:true};}
    if(p.endsWith('/project-name')){state.named[body.kind].push({name:body.name,key:'derived'});return {ok:true};}
    if(p.endsWith('/board'))return {name:state.binding.board || '默认',items:[{id:1,title:state.binding.board === '运营' ? '运营项目任务' : '默认项目任务',state:'open'}]};
    if(/^\/v1\/sessions\/[^/]+$/.test(p)&&method==='PATCH'){Object.assign(state.sessions.find(s=>s.session_id===p.split('/').at(-1)),body);return {ok:true};}
    if(/^\/v1\/sessions\/[^/]+$/.test(p)&&method==='DELETE'){state.sessions=state.sessions.filter(s=>s.session_id!==p.split('/').at(-1));return {ok:true};}
  };
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:process.env.P0_BROWSER_CHANNEL || 'msedge',headless:true});
 const base=`http://127.0.0.1:${server.address().port}`; let count=0;
 async function check(name,fn,configure=()=>{}) {const f=await fixture(browser,base,state=>{setup(state);configure(state);});try{await fn(f);await f.close();console.log(`PASS ${++count}: ${name}`);}catch(error){await f.page.screenshot({path:path.join(__dirname,'../dist/p1-failure.png'),fullPage:true});throw error;}}
 const end=(state)=>{state.emit('s1','turn_end',{status:'completed'});state.emit('s1','turn_done');};
 try {
  await check('Markdown links, authenticated artifacts, isolated HTML and file previews',async({page,state})=>{
   state.emit('s1','assistant_message',{text:'# Office\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[打开报告](artifact:report.md)'});
   await expect(page.locator('.markdown-body h1')).toHaveText('Office'); await expect(page.locator('.markdown-body table td')).toHaveCount(2);
   await page.getByRole('link',{name:'打开报告'}).click(); await expect(page.locator('.artifact-panel h1')).toHaveText('Report');
   await page.locator('.artifact-panel').getByRole('link',{name:'网页'}).click(); await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts');
   await expect(page.frameLocator('iframe').locator('h1')).toHaveText('Isolated report'); assert.equal(await page.locator('body').getAttribute('data-leaked'),null);
   for(const [name,locator,text] of [['data.csv','.table-scroll','a,b'],['book.xlsx','.table-scroll','Sample'],['notes.txt','.file-text','plain notes']]) {await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:name}).click();await expect(page.locator(locator)).toContainText(text);}
   await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:'doc.pdf'}).click();await expect(page.locator('.pdf-preview canvas')).toHaveAttribute('width','200');
   await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:'image.png'}).click();await expect(page.locator('.artifact-image')).toBeVisible();
   await page.getByRole('button',{name:'系统打开',exact:true}).click();assert(state.requests.some(r=>r.path.endsWith('/reveal')&&r.body.mode==='open'));
   await page.getByRole('button',{name:'返回列表'}).click();await page.getByRole('button',{name:'浏览工作目录'}).click();await page.locator('.file-row').filter({hasText:'notes.txt'}).click();await expect(page.locator('.file-text')).toHaveText('folder notes');
   assert(state.requests.filter(r=>r.path.includes('/artifacts')).every(r=>r.headers['x-openworker-token']==='test-token'));
   await page.screenshot({path:path.join(__dirname,'../dist/p1-files.png')});
  });
  await check('attachments: validation, removal, image paste/drop, PDF checks and attachment-only send',async({page,state})=>{
   const input=page.locator('.composer input[type=file]');
   await input.setInputFiles({name:'bad.exe',mimeType:'application/octet-stream',buffer:Buffer.from('x')});await expect(page.getByRole('alert')).toContainText('不支持');
   state.pdfPages=21;await input.setInputFiles({name:'many.pdf',mimeType:'application/pdf',buffer:pdfFile()});await expect(page.getByRole('alert')).toContainText('超过 20 页');
   state.pdfPages=1;await input.setInputFiles([{name:'ok.pdf',mimeType:'application/pdf',buffer:pdfFile()},{name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('notes')}]);await expect(page.locator('.composer .attachment')).toHaveCount(2);
   await page.getByRole('button',{name:'移除附件 note.txt'}).click();
   await page.locator('.composer textarea').evaluate((el,b64)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'paste.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},png.toString('base64'));
   await page.locator('.composer').evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File(['drop'],'drop.txt',{type:'text/plain'}));el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
   await expect(page.locator('.composer .attachment')).toHaveCount(3);await page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='user_message').length).toBe(1);
   const sent=state.sent.find(r=>r.type==='user_message');assert.equal(sent.text,'');assert.deepEqual(sent.attachments.map(a=>a.kind),['pdf','image','text']);await expect(page.locator('.message.user img')).toBeVisible();end(state);
  });
  await check('skill edit/import, session muting and explicit skill-only invocation',async({page,state})=>{
   await page.locator('.surface-nav').getByRole('button',{name:'设置'}).click();await page.locator('.subnav').getByRole('button',{name:'技能',exact:true}).click();
   const card=page.locator('.skills-manager .list-card').filter({hasText:'/report'});await card.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('说明',{exact:true}).fill('新版说明');await page.getByLabel('指令',{exact:true}).fill('New instructions');await page.getByRole('button',{name:'保存技能'}).click();await expect.poll(()=>state.skills[0].instructions).toBe('New instructions');
   await page.locator('.skills-manager input[type=file]').setInputFiles({name:'skill.zip',mimeType:'application/zip',buffer:Buffer.from('zip fixture')});await expect(page.locator('.upload-preview')).toContainText('scripts/run.py');assert(!state.requests.some(r=>r.path.endsWith('/upload/confirm')));await page.getByRole('button',{name:'确认安装'}).click();await expect.poll(()=>state.skills.some(s=>s.name==='imported')).toBe(true);
   await page.locator('.session-row').first().click();await page.getByRole('button',{name:'权限与项目',exact:true}).click();const mute=page.locator('.access-row').filter({hasText:'/report'}).locator('input');await mute.uncheck();await expect.poll(()=>state.sessionMutes.has('report')).toBe(true);await page.getByRole('button',{name:'关闭权限面板'}).click();
   await page.locator('.composer textarea').fill('/');await expect(page.locator('.slash-menu')).not.toContainText('/report');await expect(page.locator('.slash-menu')).not.toContainText('/muted');await page.locator('.slash-menu').getByRole('option').filter({hasText:'/imported'}).click();await page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>state.sent.some(r=>r.type==='user_message'&&r.skill==='imported'&&r.text==='')).toBe(true);
  });
  await check('rename/pin, search keyboard selection, grouped limits and persistence',async({page,state})=>{
   await page.locator('.session-row-wrap').first().getByTitle('对话操作').click();await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByLabel('对话标题').fill('预算分析');await page.getByRole('button',{name:'保存名称'}).click();await expect(page.locator('.session-row').first()).toContainText('预算分析');
   await page.locator('.session-row-wrap').first().getByTitle('对话操作').click();await page.getByRole('button',{name:'置顶',exact:true}).click();await expect.poll(()=>state.sessions[0].pinned).toBe(true);await expect(page.locator('.session-group').first()).toContainText('置顶');
   await page.keyboard.press('Control+k');await page.getByPlaceholder('搜索标题、智能体或项目').fill('会话 3');await page.keyboard.press('Enter');await expect(page.locator('.title-block strong')).toHaveText('会话 3');
   await page.getByLabel('导航布局').selectOption('grouped');await expect.poll(()=>state.settings.nav_layout).toBe('grouped');await page.reload();await expect(page.getByLabel('导航布局')).toHaveValue('grouped');
   await page.locator('.session-row-wrap').first().getByTitle('对话操作').click();await page.getByRole('button',{name:'归档',exact:false}).click();await expect.poll(()=>state.sessions[0].archived).toBe(true);assert.equal(state.sessions[0].pinned,true);await expect(page.locator('.session-group').filter({hasText:'置顶'})).toHaveCount(0);
  });
  await check('partial reasoning/output survives errors, retry, totals, todos and scroll position',async({page,state})=>{
   state.emit('s1','turn_start');state.emit('s1','reasoning_delta',{text:'thinking partial'});state.emit('s1','assistant_delta',{text:'partial answer'});state.emit('s1','error',{error:'provider failed'});await expect(page.locator('.assistant-copy')).toContainText('partial answer');await expect(page.locator('.reasoning')).toContainText('thinking partial');await page.getByRole('button',{name:'重试',exact:true}).click();await expect.poll(()=>state.sent.some(r=>r.type==='retry')).toBe(true);
   state.emit('s1','turn_start');state.emit('s1','compacting');await expect(page.locator('.thinking-row')).toContainText('压缩上下文');state.emit('s1','compacted',{text:'compacted'});
   state.emit('s1','tool_proposed',{name:'todo_write',arguments:{todos:[{content:'finished',status:'completed'},'pending']}});await expect(page.locator('.todo-progress summary')).toHaveText('任务进度 1 / 2');
   state.emit('s1','assistant_message',{text:'# Long\n\n'+Array.from({length:80},(_,i)=>`Paragraph ${i}\n`).join('\n'),usage:{model:'test:two',input:40,output:12,cache_read:3}});await expect(page.locator('.usage-totals')).toContainText('test:two');await expect(page.locator('.tool-group')).toHaveCount(2);
   await page.locator('.conversation').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await expect(page.getByRole('button',{name:'↓ 回到底部'})).toBeVisible();state.emit('s1','assistant_delta',{text:'stream below'});await expect(page.locator('.transcript')).toContainText('stream below');assert.equal(await page.locator('.conversation').evaluate(el=>el.scrollTop),0);await page.getByRole('button',{name:'↓ 回到底部'}).click();await expect(page.getByRole('button',{name:'↓ 回到底部'})).toHaveCount(0);
   state.emit('s1','turn_end',{status:'max_iterations_exceeded'});await expect(page.locator('.transcript')).toContainText('最大执行步数');state.emit('s1','interrupted');await expect(page.locator('.assistant-copy').last()).toHaveText('stream below');
  });
  await check('approval scopes, reviewer override, plans, teams, items and directory replies',async({page,state})=>{
   await page.locator('.tool-card summary').click();await page.getByRole('button',{name:'仍然允许一次'}).click();await expect.poll(()=>state.sent.some(r=>r.type==='allow_anyway')).toBe(true);end(state);
   for(const [name,args,extra,label,decision] of [['run_shell',{command:'ls'},{readonly_ok:true},'本会话允许只读命令','readonly_session'],['run_shell',{command:'npm test'},{},'本会话允许此命令','always_command'],['web_fetch',{url:'https://www.example.com/report'},{},'本会话允许域名 example.com','always_domain'],['mcp__docs__read',{}, {},'始终信任此 MCP 工具','always_trust']]) {state.emit('s1','permission_required',{name,arguments:args,...extra});await page.getByRole('button',{name:label,exact:true}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='approval').at(-1)?.decision).toBe(decision);}
   state.emit('s1','plan_proposed',{plan:'# Plan\nDo work'});await page.getByLabel('执行模式').selectOption('auto');await page.getByRole('button',{name:'批准',exact:true}).click();await expect.poll(()=>state.sent.find(r=>r.type==='plan_response')?.mode).toBe('auto');
   state.emit('s1','plan_proposed',{plan:'Second plan'});await page.getByLabel('修改意见').fill('先检查输入');await page.getByRole('button',{name:'提交修改意见'}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='plan_response').at(-1)?.feedback).toBe('先检查输入');
   state.emit('s1','team_proposed',{members:[{name:'Analyst',persona:'analyst',model:'test:two',reason:'analyze'}]});await expect(page.locator('.approval-detail')).toContainText('test:two');await page.getByLabel('启用团队聊天').check();await page.getByRole('button',{name:'批准',exact:true}).click();await expect.poll(()=>state.sent.find(r=>r.type==='team_response')?.enable_chat).toBe(true);
   state.emit('s1','items_proposed',{items:[{title:'Report',criteria:'Must contain totals'}]});await expect(page.locator('.approval-detail')).toContainText('Must contain totals');await page.getByRole('button',{name:'批准',exact:true}).click();
   state.emit('s1','directory_requested',{path:'D:/other',writable:true});await page.getByRole('button',{name:'仅允许读取'}).click();await expect.poll(()=>state.sent.find(r=>r.type==='directory_response')?.writable).toBe(false);
  });
  await check('workspace trust, root errors/permissions, project binding and save/reconnect',async({page,state})=>{
   state.emit('s1','ready',{...state.ready,command_trust:{required:true,workspace:'D:/work',requested_commands:['npm test']}});await page.getByRole('button',{name:'信任此工作区',exact:true}).click();await expect.poll(()=>state.trusted.length).toBe(1);
   await page.getByRole('button',{name:'权限与项目',exact:true}).click();state.failRoot=true;await page.getByLabel('额外目录').fill('D:/extra');await page.getByRole('button',{name:'添加目录'}).click();await expect(page.locator('.access-panel [role=alert]')).toContainText('目录不可访问');await expect(page.getByLabel('额外目录')).toHaveValue('D:/extra');
   state.failRoot=false;await page.getByRole('button',{name:'添加目录'}).click();const root=page.locator('.access-row').filter({hasText:'D:/extra'});await root.locator('input').check();await expect.poll(()=>state.roots.find(r=>r.path==='D:/extra')?.writable).toBe(true);await root.getByRole('button',{name:'移除目录'}).click();await expect(root).toHaveCount(0);
   await page.getByRole('button',{name:'撤销信任'}).click();await expect.poll(()=>state.trusted.length).toBe(0);
   const board=page.locator('.project-binding').filter({hasText:'项目看板'});await board.locator('select').selectOption('运营');await expect.poll(()=>state.binding.board).toBe('运营');await board.getByRole('button',{name:'查看当前项目看板'}).click();await expect(page.locator('.board-item')).toContainText('运营项目任务');
   await page.locator('.session-row').first().click();await page.getByRole('button',{name:'权限与项目',exact:true}).click();await page.getByLabel('项目保存路径').fill('D:/saved');await page.getByRole('button',{name:'保存为项目',exact:true}).click();await expect(page.locator('.title-block')).toContainText('D:/saved');await expect.poll(()=>state.requests.some(r=>r.path.endsWith('/save-as-project')&&r.body.path==='D:/saved')).toBe(true);await expect(page.getByRole('button',{name:'保存为项目',exact:true})).toHaveCount(0);
  });
  await check('folder gate preserves attachments/skill on cancel and sends once after provisioning', async({page,state})=>{
   await page.getByRole('button',{name:'选择智能体'}).click();await page.getByRole('option').filter({hasText:'Code'}).click();
   await page.locator('.composer input[type=file]').setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('keep me')});
   await page.locator('.composer textarea').fill('/rep');await page.locator('.slash-menu').getByRole('option').filter({hasText:'/report'}).click();await page.locator('.composer textarea').fill('process attachment');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('.folder-dialog')).toBeVisible();await page.keyboard.press('Escape');
   await expect(page.locator('.composer textarea')).toHaveValue('process attachment');await expect(page.locator('.skill-chip')).toContainText('report');await expect(page.locator('.composer .attachment')).toContainText('draft.txt');assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'使用临时文件夹'}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='user_message').length).toBe(1);const sent=state.sent.find(r=>r.type==='user_message');assert.equal(sent.skill,'report');assert.equal(sent.attachments[0].text,'keep me');assert.equal(sent.text,'process attachment');await expect(page.locator('.message.user')).toHaveCount(1);
  }, state=>{state.personas.push({id:'code',name:'Code',enabled:true,requires_folder:true});});
  await check('auto-approve withholds persistent grants; narrow preview remains usable', async({page,state})=>{
   state.emit('s1','ready',{...state.ready,mode:'auto-approve'});state.emit('s1','permission_required',{name:'mcp__docs__read',arguments:{path:'report'},reason:'needs owner'});await expect(page.locator('.approval-actions button')).toHaveCount(2);await expect(page.getByRole('button',{name:'始终信任此 MCP 工具'})).toHaveCount(0);await page.getByRole('button',{name:'拒绝',exact:true}).click();
   await page.setViewportSize({width:900,height:760});await page.getByRole('button',{name:'文件',exact:true}).click();await page.locator('.file-row').filter({hasText:'report.md'}).click();await expect(page.locator('.artifact-panel h1')).toHaveText('Report');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'../dist/p1-narrow.png')});await page.getByRole('button',{name:'关闭文件面板'}).click();await expect(page.locator('.composer textarea')).toBeVisible();
  });
  console.log(`${count} P1 browser regression scenarios passed.`);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
