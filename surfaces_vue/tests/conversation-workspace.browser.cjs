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
  state.recentWorkspaces=[{path:'D:/project',name:'project',exists:true},{path:'D:/missing',name:'missing',exists:false}];
  state.pickedFolder='D:/chosen';state.failWorkspace=false;state.failTemp=false;
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
    if(p==='/v1/workspaces/recent')return {workspaces:state.recentWorkspaces};
    if(p==='/v1/workspaces/pick')return {ok:true,path:state.pickedFolder};
    if(p==='/v1/workspaces/open')return state.failWorkspace ? {ok:false,error:'目录不可访问'} : {ok:true,path:body.path};
    if(p==='/v1/workspaces/temp')return state.tempResult || (state.failTemp ? {ok:false,error:'临时目录创建失败'} : {ok:true,path:'D:/scratch'});
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
 async function check(name,fn,configure=()=>{}) {const f=await fixture(browser,base,state=>{setup(state);configure(state);});try{await fn(f);await f.close();console.log(`PASS ${++count}: ${name}`);}catch(error){await f.page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-failure.png'),fullPage:true});throw error;}}
 const end=(state)=>{state.emit('s1','turn_end',{status:'completed'});state.emit('s1','turn_done');};
 try {
  await check('todo progress updates live with backend done status and restores completed history',async({page,state})=>{
   const summary=page.locator('.todo-progress summary');
   const todos=[{content:'检查问题',status:'in_progress'},{content:'修复问题',status:'pending'}];
   const publish=()=>state.emit('s1','tool_proposed',{name:'todo_write',arguments:{todos}});
   state.emit('s1','turn_start',{input:'修复问题'});publish();
   await expect(summary).toHaveText('任务进度 0 / 2');
   await summary.click();await expect(page.locator('.todo-progress div').first()).toContainText('◉');
   todos[0].status='done';todos[1].status='in_progress';publish();
   await expect(summary).toHaveText('任务进度 1 / 2');
   await expect(page.locator('.todo-progress div').first()).toContainText('✓');
   await expect(page.locator('.todo-progress div').last()).toContainText('◉');
   // Ending a turn does not imply every planned step was actually completed.
   end(state);await expect(summary).toHaveText('任务进度 1 / 2');
   todos[1].status='done';publish();end(state);
   await expect(summary).toHaveText('任务进度 2 / 2');
   await expect(page.locator('.todo-progress div').last()).toContainText('✓');
   const previousRoute=state.extraRoute;
   const history=[
    {role:'user',content:'修复问题'},
    {role:'assistant',tool_calls:[{id:'todo-final',function:{name:'todo_write',arguments:JSON.stringify({todos})}}]},
    {role:'tool',tool_call_id:'todo-final',content:JSON.stringify({count:2,todos})}
   ];
   state.extraRoute=(url,body,req)=>url.pathname==='/v1/sessions/s1/messages' ? {messages:history} : previousRoute(url,body,req);
   await page.locator('.session-row').filter({hasText:'会话 2'}).click();
   await expect(summary).toHaveCount(0);
   await page.locator('.session-row').filter({hasText:'会话 1'}).click();
   await expect(summary).toHaveText('任务进度 2 / 2');
   await page.locator('.composer textarea').fill('你好');
   await page.getByRole('button',{name:'发送',exact:true}).click();
   await expect(summary).toHaveCount(0);
   state.emit('s1','assistant_message',{text:'你好！'});end(state);
   history.push({role:'user',content:'你好'},{role:'assistant',content:'你好！'});
   await page.locator('.session-row').filter({hasText:'会话 2'}).click();
   await page.locator('.session-row').filter({hasText:'会话 1'}).click();
   await expect(summary).toHaveCount(0);
   await expect.poll(()=>state.sockets.has('s1')).toBe(true);
   state.emit('s1','turn_start',{input:'新任务'});
   state.emit('s1','tool_proposed',{name:'todo_write',arguments:{todos:[{content:'新的步骤',status:'in_progress'}]}});
   await expect(summary).toHaveText('任务进度 0 / 1');
   state.emit('s1','error',{error:'暂时失败'});
   state.emit('s1','turn_start',{input:''});
   await expect(summary).toHaveText('任务进度 0 / 1');
   state.emit('s1','turn_start',{input:'(resumed)'});
   await expect(summary).toHaveText('任务进度 0 / 1');
   end(state);
   state.emit('s1','turn_start',{input:'另一个问题'});
   await expect(summary).toHaveCount(0);
  });
  await check('reference turn groups: live narration, approvals, status, raw details, final answer and mobile layout',async({page,state})=>{
   await page.locator('.session-row').nth(1).click();
   await expect.poll(()=>state.sockets.has('s2')).toBe(true);
   state.emit('s2','turn_start',{input:'检查项目配置和构建结果'});
   state.emit('s2','assistant_message',{text:'先检查配置，再安装依赖并验证构建。'});
   state.emit('s2','tool_proposed',{name:'read_file',arguments:{path:'D:\\project\\package.json'}});
   const group=page.locator('.tool-turn'),header=page.locator('.turn-summary');
   await expect(group).toHaveCount(1);await expect(group).not.toHaveAttribute('open','');
   await expect(header).toContainText('正在执行 1 步');
   await expect(page.getByTestId('turn-live-line')).toContainText('先检查配置');
   await expect(page.locator('.assistant-copy')).toHaveCount(0);
   state.emit('s2','tool_finished',{name:'read_file',status:'ok',result_preview:'{"scripts":{"build":"vite build"}}'});
   state.emit('s2','assistant_delta',{text:'准备安装项目依赖。'});
   await expect(page.getByTestId('turn-live-line')).toContainText('准备安装项目依赖');
   state.emit('s2','permission_required',{name:'run_shell',arguments:{command:'npm install'},reason:'安装本地依赖'});
   await expect(page.locator('.request-bar')).toBeVisible();await expect(group).toHaveCount(1);await expect(page.locator('.assistant-copy')).toHaveCount(0);
   await page.getByRole('button',{name:'允许一次',exact:true}).click();
   state.emit('s2','assistant_message',{text:'准备安装项目依赖。'});
   state.emit('s2','tool_proposed',{name:'run_shell',arguments:{command:'npm install',description:'安装项目依赖'}});
   state.emit('s2','tool_finished',{name:'run_shell',status:'ok',result_preview:'Dependencies ready',approval_origin:'user',approval_grant:'once'});
   state.emit('s2','assistant_message',{text:'依赖检查完成，开始验证生产构建。'});
   state.emit('s2','tool_proposed',{name:'run_shell',arguments:{command:'npm run build',description:'验证生产构建'}});
   await expect(header).toContainText('正在执行 3 步');await expect(group).not.toHaveAttribute('open','');
   await page.setViewportSize({width:1280,height:900});
   await page.screenshot({path:path.join(__dirname,'../dist/tool-turns-collapsed.png')});
   await header.click();await expect(group).toHaveAttribute('open','');
   await expect(page.getByTestId('turn-step')).toHaveCount(3);await expect(page.getByTestId('turn-ask')).toHaveCount(0);
   await expect(page.getByTestId('turn-narration')).toHaveCount(3);await expect(page.getByTestId('step-running')).toHaveCount(1);
   await expect(page.locator('.tool-step-title').first()).toHaveText('读取文件 package.json');
   await expect(page.getByTestId('turn-step').nth(1)).toContainText('用户已批准');
   await expect(page.getByTestId('turn-step').last()).not.toContainText('用户已批准');
   await page.getByTestId('turn-step').first().hover();await page.getByRole('button',{name:'查看工具详情 read_file'}).click();
   await expect(page.locator('.tool-raw')).toContainText('D:\\project\\package.json');await expect(page.locator('.tool-raw')).toContainText('vite build');
   state.emit('s2','assistant_delta',{text:'正在检查构建输出。'});await expect(page.getByTestId('turn-live-stream')).toContainText('正在检查构建输出');
   await expect(group).toHaveAttribute('open','');await expect(page.locator('.assistant-copy')).toHaveCount(0);
   state.emit('s2','tool_finished',{name:'run_shell',status:'error',result_preview:'Build failed: missing entry module'});
   await expect(page.getByTestId('step-running')).toHaveCount(0);await expect(page.getByTestId('turn-step').last()).toHaveAttribute('data-status','error');
   state.emit('s2','assistant_message',{text:'构建失败，已定位到入口模块缺失。'});
   await expect(page.locator('.assistant-copy')).toHaveCount(0);
   state.emit('s2','turn_done');
   await expect(header).toHaveText('›3 步');await expect(group).toHaveAttribute('open','');
   await expect(page.locator('.assistant-copy')).toHaveText('构建失败，已定位到入口模块缺失。');await expect(group).not.toContainText('构建失败，已定位到入口模块缺失。');
   await page.screenshot({path:path.join(__dirname,'../dist/tool-turns-desktop.png')});
   await page.getByTitle('收起侧边栏').click();await page.setViewportSize({width:390,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(__dirname,'../dist/tool-turns-mobile.png')});
   await header.click();await expect(group).not.toHaveAttribute('open','');await expect(page.locator('.assistant-copy')).toBeVisible();
  });
  await check('Markdown links, authenticated artifacts, isolated HTML and file previews',async({page,state})=>{
   state.emit('s1','assistant_message',{text:'# Office\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[打开报告](artifact:report.md)'});
   await expect(page.locator('.markdown-body h1')).toHaveText('Office'); await expect(page.locator('.markdown-body table td')).toHaveCount(2);
   await page.getByRole('link',{name:'打开报告'}).click(); await expect(page.locator('.artifact-panel h1')).toHaveText('Report');
   await page.locator('.artifact-panel').getByRole('link',{name:'网页'}).click(); await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts');
   await expect(page.frameLocator('iframe').locator('h1')).toHaveText('Isolated report'); assert.equal(await page.locator('body').getAttribute('data-leaked'),null);
   for(const [name,locator,text] of [['data.csv','.table-scroll','a,b'],['book.xlsx','.table-scroll','Sample'],['notes.txt','.file-text','plain notes']]) {await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:name}).click();await expect(page.locator(locator)).toContainText(text);}
   await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:'doc.pdf'}).click();await expect(page.locator('.pdf-preview canvas')).toHaveAttribute('width','200');
   await page.getByRole('button',{name:'返回列表'}).click();await page.locator('.file-row').filter({hasText:'image.png'}).click();await expect(page.locator('.artifact-image')).toBeVisible();
   await page.getByRole('button',{name:'系统打开',exact:true}).click();await expect.poll(()=>state.requests.some(r=>r.path.endsWith('/reveal')&&r.body.mode==='open')).toBe(true);
   await page.getByRole('button',{name:'返回列表'}).click();await page.getByRole('button',{name:'浏览工作目录'}).click();await page.locator('.file-row').filter({hasText:'notes.txt'}).click();await expect(page.locator('.file-text')).toHaveText('folder notes');
   assert(state.requests.filter(r=>r.path.includes('/artifacts')).every(r=>r.headers['x-openworker-token']==='test-token'));
   await page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-files.png')});
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
   state.emit('s1','assistant_message',{text:'# Long\n\n'+Array.from({length:80},(_,i)=>`Paragraph ${i}\n`).join('\n'),usage:{model:'test:two',input:40,output:12,cache_read:3}});await expect(page.getByTestId('usage-chip')).toContainText('43');await page.getByTestId('usage-chip').click();await page.locator('.usage-models summary').click();await expect(page.locator('.usage-models')).toContainText('test:two');await page.keyboard.press('Escape');await expect(page.locator('.tool-turn')).toHaveCount(2);await page.locator('.turn-summary').last().click();
   await page.locator('.conversation').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await expect(page.getByRole('button',{name:'↓ 回到底部'})).toBeVisible();state.emit('s1','assistant_delta',{text:'stream below'});await expect(page.locator('.transcript')).toContainText('stream below');assert.equal(await page.locator('.conversation').evaluate(el=>el.scrollTop),0);await page.getByRole('button',{name:'↓ 回到底部'}).click();await expect(page.getByRole('button',{name:'↓ 回到底部'})).toHaveCount(0);
   state.emit('s1','turn_end',{status:'max_iterations_exceeded'});await expect(page.locator('.transcript')).toContainText('最大执行步数');state.emit('s1','interrupted');await expect(page.locator('.assistant-copy').last()).toHaveText('stream below');
  });
  await check('approval scopes, reviewer override, plans, teams, items and directory replies',async({page,state})=>{
   await page.locator('.turn-summary').click();await page.getByRole('button',{name:'仍然允许一次'}).click();await expect.poll(()=>state.sent.some(r=>r.type==='allow_anyway')).toBe(true);end(state);
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
   await page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-access-desktop.png')});
   await page.setViewportSize({width:390,height:844});
   assert(await page.locator('.access-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));
   await page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-access-mobile.png')});
   await page.setViewportSize({width:1280,height:800});
   state.failRoot=false;await page.getByRole('button',{name:'添加目录'}).click();const root=page.locator('.access-row').filter({hasText:'D:/extra'});await root.locator('input').check();await expect.poll(()=>state.roots.find(r=>r.path==='D:/extra')?.writable).toBe(true);await root.getByRole('button',{name:'移除目录'}).click();await expect(root).toHaveCount(0);
   await page.getByRole('button',{name:'撤销信任'}).click();await expect.poll(()=>state.trusted.length).toBe(0);
   const board=page.locator('.project-binding').filter({hasText:'项目看板'});await board.locator('select').selectOption('运营');await expect.poll(()=>state.binding.board).toBe('运营');await board.getByRole('button',{name:'查看当前项目看板'}).click();await expect(page.locator('.board-item')).toContainText('运营项目任务');
   await page.locator('.session-row').first().click();await page.getByRole('button',{name:'权限与项目',exact:true}).click();await page.getByLabel('项目保存路径').fill('D:/saved');await page.getByRole('button',{name:'保存为项目',exact:true}).click();await expect(page.locator('.title-block')).toContainText('D:/saved');await expect.poll(()=>state.requests.some(r=>r.path.endsWith('/save-as-project')&&r.body.path==='D:/saved')).toBe(true);await expect(page.getByRole('button',{name:'保存为项目',exact:true})).toHaveCount(0);
  });
  await check('workspace setup precedes sending and preserves drafts through cancellation and temp failures', async({page,state})=>{
   await page.getByRole('button',{name:'选择智能体'}).click();await page.getByRole('option').filter({hasText:'Code'}).click();
   await expect(page.getByRole('dialog',{name:'Code 要在哪里工作？'})).toBeVisible();
   assert([...state.sockets.values()].every(ws=>new URL(ws.url()).searchParams.get('agent')!=='code'));assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   await page.keyboard.press('Escape');await expect(page.locator('.folder-dialog')).toHaveCount(0);
   await page.locator('.composer input[type=file]').setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('keep me')});
   await page.locator('.composer textarea').fill('/rep');await page.locator('.slash-menu').getByRole('option').filter({hasText:'/report'}).click();await page.locator('.composer textarea').fill('process attachment');
   await expect(page.getByRole('button',{name:'发送',exact:true})).toBeDisabled();await page.locator('.composer textarea').press('Enter');await expect(page.locator('.folder-dialog')).toHaveCount(0);
   await page.getByRole('button',{name:'选择工作目录',exact:true}).click();await page.locator('.folder-dialog').getByRole('button',{name:'取消',exact:true}).click();
   await expect(page.locator('.composer textarea')).toHaveValue('process attachment');await expect(page.locator('.skill-chip')).toContainText('report');await expect(page.locator('.composer .attachment')).toContainText('draft.txt');assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   // A slow skill response from before the folder pick must not clear the draft's skill.
   const previousRoute=state.extraRoute;let resolveOldSkills;
   state.extraRoute=(url,body,req)=>url.pathname.endsWith('/skills')&&url.pathname!=='/v1/skills'&&req.method()==='GET'&&!url.searchParams.get('workspace')&&!resolveOldSkills?new Promise(resolve=>resolveOldSkills=resolve):previousRoute(url,body,req);
   await page.getByRole('button',{name:'权限与项目',exact:true}).click();await expect.poll(()=>typeof resolveOldSkills).toBe('function');await page.getByRole('button',{name:'关闭权限面板',exact:true}).click();
   state.failTemp=true;await page.getByRole('button',{name:'选择工作目录',exact:true}).click();await page.getByRole('button',{name:'使用临时文件夹'}).click();await expect(page.locator('.folder-error')).toContainText('临时目录创建失败');
   let resolveTemp;state.tempResult=new Promise(resolve=>resolveTemp=resolve);
   await page.getByRole('button',{name:'使用临时文件夹'}).click();await expect(page.getByRole('button',{name:'使用临时文件夹'})).toBeDisabled();await page.keyboard.press('Escape');await expect(page.locator('.folder-dialog')).toBeVisible();
   resolveTemp({ok:true,path:'D:/scratch'});await expect(page.locator('.folder-dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();
   assert.equal(state.requests.filter(r=>r.path==='/v1/workspaces/temp').length,2);assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   await expect(page.locator('.workspace-chip')).toContainText('临时工作目录');await expect(page.locator('.composer textarea')).toHaveValue('process attachment');await expect(page.locator('.skill-chip')).toContainText('report');await expect(page.locator('.composer .attachment')).toContainText('draft.txt');
   const provision=state.requests.filter(r=>r.path==='/v1/workspaces/temp').at(-1),socket=state.sockets.get(provision.body.session_id);assert(socket);assert.equal(new URL(socket.url()).searchParams.get('workspace'),'D:/scratch');assert.equal(provision.body.git,true);
   const staleResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname.endsWith('/skills')&&!url.searchParams.get('workspace');});resolveOldSkills({ok:true,skills:[]});await (await staleResponse).finished();
   await page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='user_message').length).toBe(1);const sent=state.sent.find(r=>r.type==='user_message');assert.equal(sent.skill,'report');assert.equal(sent.attachments[0].text,'keep me');assert.equal(sent.text,'process attachment');await expect(page.locator('.message.user')).toHaveCount(1);await expect(page.locator('.session-setup')).toHaveCount(0);
   await page.locator('.new-button').click();await expect(page.locator('.folder-dialog')).toBeVisible();await expect(page.locator('.workspace-chip')).toContainText('选择工作目录');
  }, state=>{state.personas.push({id:'code',name:'Code',enabled:true,requires_folder:true});});
  await check('recent/manual/native folder choices preserve drafts and rebind before explicit send',async({page,state})=>{
   await page.getByRole('button',{name:'选择智能体'}).click();await page.getByRole('option').filter({hasText:'Code'}).click();await expect(page.locator('.recent-folder')).toHaveCount(1);await page.keyboard.press('Escape');
   const editor=page.locator('.composer textarea');await editor.fill('inspect project');await page.locator('.composer input[type=file]').setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('keep me')});
   await page.getByRole('button',{name:'选择工作目录',exact:true}).click();state.failWorkspace=true;
   const pathInput=page.getByPlaceholder('也可以输入绝对路径');await pathInput.fill('  D:/project  ');await pathInput.press('Enter');await expect(page.locator('.folder-error')).toContainText('目录不可访问');await expect(pathInput).toHaveValue('  D:/project  ');assert([...state.sockets.values()].every(ws=>new URL(ws.url()).searchParams.get('agent')!=='code'));
   state.failWorkspace=false;state.ready={temp_workspace:false};await page.locator('.recent-folder').click();await expect(page.locator('.folder-dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/project');
   const firstId=[...state.sockets.keys()].at(-1);assert.equal(new URL(state.sockets.get(firstId).url()).searchParams.get('workspace'),'D:/project');assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   // A connected draft cannot change the server's existing workspace in place.
   await page.getByRole('button',{name:'选择工作目录',exact:true}).click();state.pickedFolder=null;await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect(page.getByRole('button',{name:'选择文件夹',exact:true})).toBeEnabled();await expect(page.locator('.folder-dialog')).toBeVisible();
   state.pickedFolder='D:/chosen';await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/chosen');await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();
   const secondId=[...state.sockets.keys()].at(-1);assert.notEqual(secondId,firstId);assert.equal(new URL(state.sockets.get(secondId).url()).searchParams.get('workspace'),'D:/chosen');await expect(editor).toHaveValue('inspect project');await expect(page.locator('.composer .attachment')).toContainText('draft.txt');assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   await page.getByRole('button',{name:'选择工作目录',exact:true}).click();await pathInput.fill('  D:/manual  ');await pathInput.press('Enter');await expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/manual');await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();assert.equal(state.requests.filter(r=>r.path==='/v1/workspaces/open').at(-1).body.path,'D:/manual');
   await page.setViewportSize({width:560,height:760});await page.getByTitle('收起侧边栏').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-setup.png')});
   await page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='user_message').length).toBe(1);assert.equal(state.sent.find(r=>r.type==='user_message').text,'inspect project');
   await page.getByTitle('新对话',{exact:true}).click();await expect(page.locator('.folder-dialog')).toHaveCount(0);await expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/manual');
  },state=>{state.personas.push({id:'code',name:'Code',enabled:true,requires_folder:true});});
  await check('workspace gating follows persona metadata without inheriting another persona scratch',async({page,state})=>{
   await expect(page.locator('.session-setup')).toHaveCount(0);await expect(page.locator('.folder-dialog')).toHaveCount(0);
   await page.getByRole('button',{name:'选择智能体'}).click();await page.getByRole('option').filter({hasText:'Ops'}).click();await expect(page.getByRole('dialog',{name:'Ops 要在哪里工作？'})).toBeVisible();await expect(page.locator('.workspace-chip')).toContainText('选择工作目录');await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'选择智能体'}).click();await page.getByRole('option').filter({hasText:'Code'}).click();await expect(page.locator('.folder-dialog')).toHaveCount(0);await expect(page.locator('.session-setup')).toHaveCount(0);await page.locator('.composer textarea').fill('hello');await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();
   await page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>state.sent.filter(r=>r.type==='user_message').length).toBe(1);
  },state=>{state.personas.push({id:'ops',name:'Ops',enabled:true,requires_folder:true},{id:'code',name:'Code',enabled:true,requires_folder:false});});
  await check('first launch with a folder-scoped default prompts before any session connection',async({page,state})=>{
   await expect(page.getByRole('dialog',{name:'Code 要在哪里工作？'})).toBeVisible();assert([...state.sockets.values()].every(ws=>!new URL(ws.url()).pathname.startsWith('/ws/session/')));await page.keyboard.press('Escape');await page.locator('.composer textarea').fill('first task');await expect(page.getByRole('button',{name:'发送',exact:true})).toBeDisabled();
   await page.getByRole('button',{name:'选择工作目录',exact:true}).click();await page.locator('.recent-folder').click();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
  },state=>{state.sessions=[];state.personas.push({id:'code',name:'Code',default:true,enabled:true,requires_folder:true});state.ready={temp_workspace:false};state.waitForStartup=page=>expect(page.locator('.folder-dialog')).toBeVisible();});
  await check('first launch adopts the server seeded workspace for a folder-scoped default',async({page,state})=>{
   await expect(page.locator('.folder-dialog')).toHaveCount(0);await expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/seed');await page.locator('.composer textarea').fill('first task');await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();assert.equal(state.sent.filter(r=>r.type==='user_message').length,0);
   const session=[...state.sockets.values()].find(ws=>new URL(ws.url()).pathname.startsWith('/ws/session/'));assert(session);assert.equal(new URL(session.url()).searchParams.get('workspace'),'D:/seed');
  },state=>{state.sessions=[];state.personas.push({id:'code',name:'Code',default:true,enabled:true,requires_folder:true});state.ready={temp_workspace:false};const route=state.extraRoute;state.extraRoute=(url,body,req)=>url.pathname==='/v1/health'?{model:state.settings.model,default_workspace:'D:/seed'}:route(url,body,req);state.waitForStartup=page=>expect(page.locator('.workspace-chip')).toHaveAttribute('title','D:/seed');});
  await check('auto-approve withholds persistent grants; narrow preview remains usable', async({page,state})=>{
   state.emit('s1','ready',{...state.ready,mode:'auto-approve'});state.emit('s1','permission_required',{name:'mcp__docs__read',arguments:{path:'report'},reason:'needs owner'});await expect(page.locator('.approval-actions button')).toHaveCount(2);await expect(page.getByRole('button',{name:'始终信任此 MCP 工具'})).toHaveCount(0);await page.getByRole('button',{name:'拒绝',exact:true}).click();
   await page.setViewportSize({width:900,height:760});await page.getByRole('button',{name:'文件',exact:true}).click();await page.locator('.file-row').filter({hasText:'report.md'}).click();await expect(page.locator('.artifact-panel h1')).toHaveText('Report');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'../dist/conversation-workspace-narrow.png')});await page.getByRole('button',{name:'关闭文件面板'}).click();await expect(page.locator('.composer textarea')).toBeVisible();
  });
  console.log(`${count} Conversation workspace browser regression scenarios passed.`);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
