const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path=require('node:path');
function setup(s){
  const connector=(name,extra={})=>({name,title:name,connected:true,available:true,fields:[],tools:[],accounts:[],...extra});
  s.connectors=[
    connector('slack',{two_way:true,managed:true,mode:'relay',account:'Workspace',workspaces:[{team_id:'T1',account:'Workspace',allowed_users:['U1'],approval_owner_ids:['U1']}]}),
    connector('github',{managed:true,installations:[{installation_id:'42',account_login:'org',allowed_users:['ada'],repo_selection:'selected'}]}),
    connector('gmail',{managed:true,accounts:[{email:'one@test',default:true},{email:'two@test',default:false}],filters:{senders:['old@test'],labels:[]}}),
    connector('google_calendar',{managed:true}),
    connector('hubspot',{managed:true,portals:[{hub_id:'99',name:'Sales',access:'read',default:true}],hidden_fields:['salary']}),
    connector('notion',{managed:true,connected:false}),
    connector('vendor',{mcp:true,connected:false}),
    connector('manual',{connected:false,fields:[{key:'token',label:'访问令牌',secret:true,required:true}]})
  ];
  s.cloud={signed_in:false,account:'tester'};s.inbox=[];s.unattended=false;s.enabled=true;s.subs=[];s.bindings=[];s.dm='';s.unrouted=[{source:'slack',sender:'U2',text:'未分配消息',reason:'no route',ts:1}];
  s.mcp=[{name:'remote',auth:'oauth',enabled:true,status:'connected',transport:'http',config:{include_tools:['read']},tool_count:2}];s.trust={ok:true,tools:['read'],legacy_dont_ask:true};
  s.task.schedule_raw={kind:'cron',cron:'*/15 1-8 * * 1,3,5',timezone:'Asia/Shanghai'};s.task.unseen_runs=2;s.task.always_allowed=[{entry:'send_message:slack:T1/C1',tool:'send_message',target:'slack:T1/C1'}];
  s.boardItems=[{id:1,title:'实现报告',state:'review',description:'报告说明',criteria:'可读',assignee:'worker',refs:['attachment://proof.png#证据.png'],links:[{kind:'depends_on',item:2}],timeline:[]},{id:2,title:'上游数据',state:'blocked',blocker:'缺少数据',refs:[],timeline:[]}];
  s.chat={enabled:true,team_id:'team1',members:[{name:'worker',role:'worker'}],messages:[{seq:1,author:'worker',author_role:'worker',text:'请 @worker 检查',ts:'2026-09-29'}]};
  s.extraRoute=(url,body,req)=>{
    const p=url.pathname,m=req.method();
    if(p==='/v1/cloud/status')return s.cloud;
    if(p==='/v1/cloud/login'){s.cloud.signed_in=true;return {ok:true};}
    if(p==='/v1/cloud/logout'){s.cloud.signed_in=false;return {ok:true};}
    if(p==='/v1/connectors')return {connectors:s.connectors};
    if(p.startsWith('/v1/connectors/')){
      const parts=p.split('/'),c=s.connectors.find(c=>c.name===parts[3]),action=parts[4];
      if(p.endsWith('/directory'))return {members:[{id:'U2',name:'Grace',handle:'grace'}]};
      if(p.endsWith('/channels'))return {channels:[{id:'C1',name:'general',is_member:true}]};
      if(action==='status')return {ok:true,relay:{state:'live',reconnects:0}};
      if(['connect','connect-managed','mcp-connect'].includes(action)){if(s.rejectAuth)return {ok:false,error:'授权被拒绝'};c.connected=true;c.account='Connected';return {ok:true};}
      if(action==='disconnect'){c.connected=false;return {ok:true};}
      if(action==='filters'){c.filters=body;return {ok:true};}
      if(action==='hidden-fields'){c.hidden_fields=body.hidden_fields;return {ok:true};}
      if(action==='accounts'&&p.endsWith('/default'))c.accounts.forEach(a=>a.default=a.email===decodeURIComponent(parts[5]));
      if(action==='accounts'&&p.endsWith('/disconnect'))c.accounts=c.accounts.filter(a=>a.email!==decodeURIComponent(parts[5]));
      if(action==='allow'&&c.name==='slack')c.workspaces[0].allowed_users.push(body.user_id);
      return {ok:true};
    }
    if(p.endsWith('/connections')){if(m==='POST')s.enabled=body.enabled;return {connected:[{connector:'slack',enabled:s.enabled,detail:'Workspace'}],recommended:[{connector:'notion',connected:false,reason:'知识库'}]};}
    if(p.endsWith('/unattended')){if(m==='POST')s.unattended=body.unattended;return {unattended:s.unattended};}
    if(p==='/v1/inbox')return {items:s.inbox.filter(i=>i.state===(url.searchParams.get('state')||'pending')&&(url.searchParams.get('session_id')?i.session_id===url.searchParams.get('session_id'):i.visibility!=='inline'))};
    if(/\/v1\/inbox\/[^/]+\/resolve$/.test(p)){if(s.rejectInbox)return {ok:false,error:'审批保存失败'};Object.assign(s.inbox.find(i=>i.id===p.split('/')[3]),{state:'resolved',resolution:body.resolution});return {ok:true};}
    if(p==='/v1/subscriptions'){if(m==='POST')s.subs.push({...body,session_title:'会话 1'});return {ok:true,subscriptions:s.subs};}
    if(p==='/v1/subscriptions/remove'){s.subs=s.subs.filter(row=>row.channel!==body.channel||row.session_id!==body.session_id);return {ok:true};}
    if(p==='/v1/channels/recent')return {channels:[{channel:'slack:T1/C1',name:'general'}]};
    if(p==='/v1/inbox/routing')return {bindings:s.bindings};
    if(p==='/v1/inbox/routing/binding'){s.bindings=[body];return {ok:true};}
    if(p==='/v1/messaging/dm-route'){if(m==='POST')s.dm=body.session_id;return {dm_session:s.dm};}
    if(p==='/v1/unrouted')return {items:s.unrouted};
    if(p==='/v1/mcp'){if(m==='POST'){s.mcp.push({name:body.name,config:body.config,enabled:true,status:'configured'});return {ok:true};}return {servers:s.mcp};}
    if(p.startsWith('/v1/mcp/')){
      if(p.endsWith('/tools'))return {ok:true,tools:[{name:'read',description:'Read'},{name:'write',description:'Write'}]};
      if(p.endsWith('/trust/convert')){s.trust.legacy_dont_ask=false;return {ok:true};}
      if(p.endsWith('/trust'))return s.trust;
      if(p.includes('/trust/')&&m==='DELETE'){s.trust.tools=[];return {ok:true};}
      if(m==='PATCH')Object.assign(s.mcp.find(row=>row.name===p.split('/')[3]).config,body);
      return {ok:true};
    }
    if(p==='/v1/automations'&&m==='POST'){s.created=body;return {ok:true};}
    if(p==='/v1/automations/task-1'&&m==='PATCH'){
      if(s.rejectSchedule)return {ok:false,error:'计划保存失败'};
      if(body.cron)s.task.schedule_raw.cron=body.cron;
      if(body.revoke)s.task.always_allowed=s.task.always_allowed.filter(r=>r.entry!==body.revoke);
      Object.assign(s.task,{...body,always_allowed:s.task.always_allowed});return {ok:true};
    }
    if(p.endsWith('/seen')){s.task.unseen_runs=0;return {ok:true};}
    if(p.endsWith('/board'))return {name:'协作项目',items:s.boardItems};
    if(p.endsWith('/board/item'))return s.boardItems.find(i=>i.id===Number(url.searchParams.get('id')));
    if(p.endsWith('/board/transition')){if(s.rejectBoard)return {error:'状态修改失败'};const item=s.boardItems.find(i=>i.id===body.item);item.state=body.to;item.timeline.push({seq:1,kind:'moved',body:body.comment});return {ok:true};}
    if(p.endsWith('/board/comment')){s.boardItems.find(i=>i.id===body.item).timeline.push({seq:2,kind:'comment',body:body.body});return {ok:true};}
    if(p.endsWith('/chat')){if(m==='POST'){if(s.rejectChat)return {error:'聊天发送失败'};s.chat.messages.push({seq:2,author:'user',author_role:'user',text:body.text});}return s.chat;}
  };
}
const navigate=(page,text)=>page.locator('.surface-nav').getByRole('button',{name:new RegExp(text)}).click();
const request=(state,path,method='POST')=>state.requests.filter(r=>r.path===path&&r.method===method).at(-1);
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:process.env.P0_BROWSER_CHANNEL||'msedge',headless:true});
 const base='http://127.0.0.1:'+server.address().port;let count=0;
 async function check(name,fn,configure=()=>{}){
   const f=await fixture(browser,base,s=>{setup(s);configure(s);});
   try{await fn(f);await f.close();console.log('PASS '+(++count)+': '+name);}
   catch(e){await f.page.screenshot({path:path.join(__dirname,'../dist/p2-failure.png'),fullPage:true});throw e;}
 }
 try{
  await check('cloud, managed OAuth, MCP OAuth and manual credentials remain distinct',async({page,state})=>{
    await navigate(page,'连接器');await page.getByRole('button',{name:'登录云账号',exact:true}).click();
    await expect(page.getByRole('button',{name:'退出云账号'})).toBeVisible();
    await page.locator('.connector-card').filter({hasText:'notion'}).click();
    await page.getByRole('button',{name:'授权 / 添加 notion 账号'}).click();await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();
    assert.ok(request(state,'/v1/connectors/notion/connect-managed'));
    await page.getByRole('button',{name:'断开连接',exact:true}).click();await expect(page.getByRole('button',{name:'授权 / 添加 notion 账号'})).toBeVisible();
    await page.getByRole('button',{name:'‹ 返回连接器'}).click();await page.locator('.connector-card').filter({hasText:'vendor'}).click();
    await page.getByRole('button',{name:'浏览器授权 vendor'}).click();await expect.poll(()=>request(state,'/v1/connectors/vendor/mcp-connect')).toBeTruthy();
    await page.getByRole('button',{name:'‹ 返回连接器'}).click();await page.locator('.connector-card').filter({hasText:'manual'}).click();
    state.rejectAuth=true;await page.getByLabel('访问令牌').fill('secret-test');await page.getByRole('button',{name:'连接 manual',exact:true}).click();await expect(page.getByRole('alert')).toContainText('授权被拒绝');await expect(page.getByLabel('访问令牌')).toHaveValue('secret-test');
    state.rejectAuth=false;await page.getByRole('button',{name:'连接 manual',exact:true}).click();await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();
    assert.deepEqual(request(state,'/v1/connectors/manual/connect').body,{fields:{token:'secret-test'}});
    await page.getByRole('button',{name:'退出云账号'}).click();await expect(page.getByRole('button',{name:'登录云账号',exact:true})).toBeVisible();
  });
  await check('workspace people, email defaults/filters and CRM fields',async({page,state})=>{
    await navigate(page,'连接器');await page.locator('.connector-card').filter({hasText:'slack'}).click();
    await page.getByLabel('人员 Workspace').fill('grace');await page.getByRole('button',{name:'搜索人员'}).click();await page.getByRole('button',{name:'添加 Grace（grace）'}).click();
    await expect.poll(()=>state.connectors[0].workspaces[0].allowed_users.includes('U2')).toBe(true);assert.equal(request(state,'/v1/connectors/slack/allow').body.team_id,'T1');
    await page.getByRole('button',{name:'‹ 返回连接器'}).click();await page.locator('.connector-card').filter({hasText:'gmail'}).click();
    await page.getByRole('button',{name:'设为默认'}).click();await expect(page.locator('.account-group').filter({hasText:'two@test'})).toContainText('默认账号');
    await page.getByLabel('发件人（每行一个）').fill('blocked@test\nblocked@test');await page.getByRole('button',{name:'保存邮件过滤'}).click();await expect.poll(()=>state.connectors.find(c=>c.name==='gmail').filters.senders).toEqual(['blocked@test']);
    await page.getByRole('button',{name:'‹ 返回连接器'}).click();await page.locator('.connector-card').filter({hasText:'hubspot'}).click();
    await page.getByLabel('隐藏的 CRM 字段（每行一个）').fill('salary\nprivate_note');await page.getByRole('button',{name:'保存隐藏字段'}).click();await expect.poll(()=>request(state,'/v1/connectors/hubspot/hidden-fields','PATCH')?.body.hidden_fields).toEqual(['salary','private_note']);
  });
  await check('MCP structured import, tool exclusion, trust migration and revoke',async({page,state})=>{
    await navigate(page,'连接器');await page.getByRole('button',{name:'＋ 自定义 MCP'}).click();
    await page.getByLabel('导入 JSON 配置').check();await page.getByLabel('MCP JSON').fill('{"mcpServers":{"local":{"command":"tool","args":["a b"],"env":{"KEY":"test"},"cwd":"D:/work"}}}');
    await page.getByRole('button',{name:'添加服务器',exact:true}).click();await expect(page.locator('.mcp-server').filter({hasText:'local'})).toBeVisible();
    assert.deepEqual(request(state,'/v1/mcp').body.config.env,{KEY:'test'});
    const remote=page.locator('.mcp-server').filter({has:page.getByRole('heading',{name:'remote',exact:true})});
    await remote.getByRole('button',{name:'查看工具与信任'}).click();await expect(remote.getByLabel('read')).toBeChecked();await expect(remote.getByLabel('write')).not.toBeChecked();
    await remote.getByLabel('write').check();await remote.getByRole('button',{name:'保存工具选择'}).click();await expect.poll(()=>request(state,'/v1/mcp/remote','PATCH')?.body.include_tools).toEqual(['read','write']);
    await remote.getByRole('button',{name:'迁移为逐工具信任'}).click();await expect(remote.getByRole('button',{name:'迁移为逐工具信任'})).toHaveCount(0);
    await expect(remote.getByLabel('write')).toBeVisible();await remote.getByRole('button',{name:'撤销信任'}).click();await expect(remote.getByRole('button',{name:'撤销信任'})).toHaveCount(0);
    await remote.getByRole('button',{name:'OAuth 登录 / 测试'}).click();await expect.poll(()=>request(state,'/v1/mcp/remote/connect')).toBeTruthy();
    await remote.getByRole('button',{name:'退出 OAuth'}).click();await expect.poll(()=>request(state,'/v1/mcp/remote/signout')).toBeTruthy();
  });
  await check('per-session integration switches, unattended mode and subscriptions',async({page,state})=>{
    await page.getByRole('button',{name:'权限与项目'}).click();const panel=page.locator('.session-integrations');
    await panel.getByRole('checkbox',{name:/slack/}).uncheck();await expect.poll(()=>state.enabled).toBe(false);
    await panel.getByRole('checkbox',{name:/无人值守/}).check();await expect.poll(()=>state.unattended).toBe(true);await expect(page.getByText('无人值守已开启 · 待处理事项会保存在收件箱。')).toBeVisible();
    await panel.getByLabel('频道地址').fill('slack:T1/C1');await panel.getByRole('button',{name:'订阅到本会话'}).click();await expect(panel.getByRole('button',{name:'取消订阅'})).toBeVisible();
    await panel.getByRole('button',{name:'取消订阅'}).click();await expect.poll(()=>state.subs.length).toBe(0);
    await panel.getByRole('button',{name:'连接 notion · 知识库'}).click();await expect(page.getByRole('heading',{name:'notion',exact:true})).toBeVisible();
  });
  await check('parked approval replaces live controls, failures retain action and resolution is single-shot',async({page,state})=>{
    state.inbox.push({id:'a1',session_id:'s1',kind:'approval',title:'允许发送',body:'发到频道',state:'pending',data:{task_id:'task-1',standing_target:'slack:T1/C1'}});
    state.emit('s1','permission_required',{name:'send_message',reason:'发到频道'});
    const card=page.locator('.inline-inbox .inbox-card');await expect(card).toBeVisible();await expect(page.locator('.request-bar')).toHaveCount(0);
    state.rejectInbox=true;await card.getByRole('button',{name:'允许一次'}).click();await expect(card.getByRole('alert')).toHaveText('审批保存失败');
    state.rejectInbox=false;await card.getByRole('button',{name:/此自动化每次允许/}).click();await expect(card).toHaveCount(0);await expect(page.locator('.request-bar')).toHaveCount(0);
    assert.equal(request(state,'/v1/inbox/a1/resolve').body.resolution,'always_task');assert.equal(state.sent.filter(m=>m.type==='approval').length,0);
    state.emit('s1','permission_required',{name:'write_file',reason:'下一条审批'});await expect(page.locator('.request-bar')).toBeVisible();
    await navigate(page,'收件箱');await page.getByRole('button',{name:'已处理',exact:true}).click();await expect(page.locator('.inbox-card')).toContainText('always_task');
    await page.getByRole('button',{name:'打开所属会话'}).click();await expect(page.locator('.topbar strong')).toHaveText('会话 1');
  });
  await check('inbox question, directory and plan use durable structured resolutions',async({page,state})=>{
    await navigate(page,'收件箱');
    await page.getByLabel('类型', {exact:true}).selectOption('question');await page.getByRole('button',{name:'甲',exact:true}).click();
    await expect.poll(()=>request(state,'/v1/inbox/q1/resolve')?.body.resolution).toBe('甲');
    await page.getByLabel('类型',{exact:true}).selectOption('directory');await page.locator('.inbox-card').getByRole('button',{name:'允许读写',exact:true}).click();
    await expect.poll(()=>request(state,'/v1/inbox/d1/resolve')?.body.resolution).toBeTruthy();assert.equal(JSON.parse(request(state,'/v1/inbox/d1/resolve').body.resolution).granted,true);
    await page.getByLabel('类型',{exact:true}).selectOption('plan');await page.locator('.inbox-card').getByRole('button',{name:/批准|开始执行/}).click();
    await expect.poll(()=>request(state,'/v1/inbox/p1/resolve')?.body.resolution).toBeTruthy();assert.equal(JSON.parse(request(state,'/v1/inbox/p1/resolve').body.resolution).approved,true);
  },s=>s.inbox=[{id:'q1',session_id:'s2',kind:'question',title:'选择方案',body:'选一个',state:'pending',options:['甲','乙']},{id:'d1',session_id:'s2',kind:'directory',title:'目录访问',state:'pending',data:{path:'D:/work',writable:true}},{id:'p1',session_id:'s2',kind:'plan',title:'执行计划',state:'pending',data:{plan:'生成报告'}}]);
  await check('routing, DM, recent channels and external source cards',async({page,state})=>{
    state.emit('s1','turn_start',{input:'raw',source:{connector:'slack',sender_name:'Ada',sender_id:'U1',channel_name:'general',channel_id:'T1/C1',text:'请生成报告'}});
    await expect(page.locator('.connector-message')).toContainText('Ada');await expect(page.locator('.connector-message')).toContainText('general');
    await navigate(page,'收件箱');await page.getByRole('button',{name:'路由配置'}).click();
    await page.getByLabel('审批投递频道').fill('#gen');await page.locator('.channel-options').getByRole('button',{name:/general/}).first().click();
    await page.getByRole('button',{name:'保存投递频道'}).click();await expect.poll(()=>state.bindings[0]?.target).toBe('T1/C1');
    await page.getByLabel('接收私信的会话').selectOption('s2');await expect.poll(()=>state.dm).toBe('s2');
    await page.getByLabel('目标会话').selectOption('s1');await page.getByLabel('频道地址',{exact:true}).fill('slack:T1/C1');await page.getByRole('button',{name:'订阅频道',exact:true}).click();await expect(page.getByRole('button',{name:'取消订阅'})).toBeVisible();
    await expect(page.getByText('未分配消息')).toBeVisible();await page.getByRole('button',{name:'仅应用内',exact:true}).click();await expect.poll(()=>state.bindings[0]?.channel).toBe(null);
  });
  await check('automation cron edits, failed saves, standing grant revoke and unread state',async({page,state})=>{
    await navigate(page,'自动化');await expect(page.locator('.list-card .badge')).toContainText('2');await page.locator('.list-card').filter({hasText:'日报'}).click();
    await expect(page.getByLabel('Cron 表达式')).toHaveValue('*/15 1-8 * * 1,3,5');assert.equal(state.task.unseen_runs,0);
    await page.getByLabel('计划类型').selectOption('cron');await page.getByLabel('时间',{exact:true}).fill('00:30');await page.getByLabel('重复',{exact:true}).selectOption('fri');
    state.rejectSchedule=true;await page.getByRole('button',{name:'保存更改'}).click();await expect(page.getByRole('alert')).toContainText('计划保存失败');await expect(page.getByLabel('时间',{exact:true})).toHaveValue('00:30');
    state.rejectSchedule=false;await page.getByRole('button',{name:'保存更改'}).click();await expect.poll(()=>state.task.schedule_raw.cron).toBe('30 0 * * 5');assert.equal(request(state,'/v1/automations/task-1','PATCH').body.timezone,undefined);
    await page.getByRole('button',{name:'撤销授权'}).click();await expect(page.getByRole('button',{name:'撤销授权'})).toHaveCount(0);
  });
  await check('template dependencies, explicit scoped consent and scheduled-run return path',async({page,state})=>{
    await navigate(page,'自动化');await page.getByRole('button',{name:'GitHub 每周摘要',exact:true}).click();
    await page.getByLabel('GitHub 仓库').fill('org/repo');await page.getByLabel('摘要投递频道').fill('slack:T1/C1');
    await page.getByRole('checkbox',{name:/允许此任务每次/}).check();await page.getByLabel('摘要投递频道').fill('slack:T1/C2');await expect(page.getByRole('checkbox',{name:/允许此任务每次/})).not.toBeChecked();
    await page.getByRole('checkbox',{name:/允许此任务每次/}).check();await page.getByRole('button',{name:'创建',exact:true}).click();
    await expect.poll(()=>state.created).toBeTruthy();assert.deepEqual(state.created.permissions,[{tool:'send_message',target:'slack:T1/C2',access:'write'}]);
    state.emit('events','automation_run_started',{task_id:'task-1',task_title:'日报',session_id:'__run__scheduled',agent:'cowork'});
    await page.locator('.run-toast').getByRole('button',{name:'查看运行'}).click();await expect(page.locator('.automation-context')).toContainText('日报');
    await page.getByRole('button',{name:'返回自动化详情'}).click();await expect(page.getByRole('button',{name:'立即运行',exact:true})).toBeVisible();
  });
  await check('team roster/chat, linked board tasks, authenticated attachments and change-request errors',async({page,state})=>{
    await page.route('**/board/attachment?*',route=>{state.attachmentHeaders=route.request().headers();return route.fulfill({status:200,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=','base64')});});
    await page.getByRole('button',{name:/团队聊天/}).click();await expect(page.locator('.team-chat mark')).toHaveText('@worker');
    state.rejectChat=true;await page.getByLabel('团队聊天消息').fill('请继续');await page.getByRole('button',{name:'发送到团队'}).click();await expect(page.getByRole('alert')).toContainText('聊天发送失败');await expect(page.getByLabel('团队聊天消息')).toHaveValue('请继续');
    state.rejectChat=false;await page.getByRole('button',{name:'发送到团队'}).click();await expect(page.locator('.team-chat-scroll')).toContainText('请继续');
    await page.getByRole('button',{name:'返回会话'}).click();await page.getByRole('button',{name:'团队看板'}).click();
    await page.locator('.board-item').filter({hasText:'实现报告'}).click();await expect(page.locator('.board-detail img')).toBeVisible();assert.equal(state.attachmentHeaders['x-openworker-token'],'test-token');
    state.rejectBoard=true;await page.getByLabel('请求修改意见').fill('请补充统计');await page.getByRole('button',{name:'请求修改',exact:true}).click();await expect(page.getByRole('alert')).toContainText('状态修改失败');await expect(page.getByLabel('请求修改意见')).toHaveValue('请补充统计');
    state.rejectBoard=false;await page.getByRole('button',{name:'请求修改',exact:true}).click();await expect(page.locator('.timeline-event')).toContainText('请补充统计');
    await page.getByRole('button',{name:'depends_on → #2'}).click();await expect(page.locator('.board-detail')).toContainText('阻塞原因：缺少数据');
    await page.locator('.team-roster').getByRole('button',{name:/worker/}).click();await expect(page.locator('.topbar strong')).toHaveText('成员会话');
  },s=>{s.sessions[0].team={role:'lead',team_id:'team1',chat_enabled:true};s.sessions.push({session_id:'worker1',title:'成员会话',agent:'cowork',team:{role:'worker',lead_session:'s1',team_id:'team1',actor:'worker',status:'working'}});});
  await check('restored attended prompts include scoped MCP controls and external resolution does not leak across sessions',async({page,state})=>{
    const card=page.locator('.inline-inbox .inbox-card');await expect(card).toContainText('mcp__remote__read');
    await expect(page.locator('.surface-nav').getByRole('button',{name:/收件箱/}).locator('.badge')).toHaveCount(0);
    await card.getByRole('button',{name:'始终信任此 MCP 工具'}).click();await expect(card).toHaveCount(0);
    assert.equal(request(state,'/v1/inbox/inline1/resolve').body.resolution,'always_trust');
    state.inbox.push({id:'inline2',session_id:'s1',kind:'question',title:'恢复提问',body:'是否继续',state:'pending',visibility:'inline',options:['继续']});
    await expect(card).toContainText('是否继续',{timeout:6500});
    await page.locator('.session-row').filter({hasText:'会话 2'}).click();await expect(card).toHaveCount(0);
    state.inbox.find(i=>i.id==='inline2').state='resolved';
    await page.locator('.session-row').filter({hasText:'会话 1'}).click();await expect(card).toHaveCount(0);
  },s=>s.inbox=[{id:'inline1',session_id:'s1',kind:'approval',title:'恢复审批',body:'读取文件',state:'pending',visibility:'inline',data:{tool:'mcp__remote__read',arguments:{path:'x'}}}]);
  await check('missing template connectors gate creation; legacy and once schedules keep unsupported fields untouched',async({page,state})=>{
    await navigate(page,'自动化');await page.getByRole('button',{name:'GitHub 每周摘要',exact:true}).click();
    await expect(page.getByRole('button',{name:'创建',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'登录云账号以连接 github'}).click();await expect(page.getByRole('button',{name:'授权 / 添加 github 账号'})).toBeVisible({timeout:7000});
    await page.getByRole('button',{name:'授权 / 添加 github 账号'}).click();await expect(page.getByRole('button',{name:'创建',exact:true})).toBeEnabled();assert.equal(state.created,undefined);
    await page.getByRole('button',{name:'取消',exact:true}).click();delete state.task.schedule_raw;
    await page.locator('.list-card').filter({hasText:'日报'}).click();await page.getByLabel('名称',{exact:true}).fill('只改名称');await page.getByRole('button',{name:'保存更改'}).click();
    await expect.poll(()=>request(state,'/v1/automations/task-1','PATCH')?.body.title).toBe('只改名称');assert.equal(request(state,'/v1/automations/task-1','PATCH').body.cron,undefined);
    await page.getByRole('button',{name:'‹ 返回自动化列表'}).click();state.task.schedule_raw={kind:'once',fire_at:'2026-10-01T09:00:00+08:00',timezone:'Asia/Shanghai'};
    await page.locator('.list-card').filter({hasText:'只改名称'}).click();await expect(page.getByPlaceholder('2026-10-01T09:00:00+08:00')).toBeDisabled();await page.getByRole('button',{name:'保存更改'}).click();assert.equal(request(state,'/v1/automations/task-1','PATCH').body.fire_at,undefined);
  },s=>s.connectors.find(c=>c.name==='github').connected=false);
  await check('unattended tool installation is actionable; compact dark routing has no horizontal overflow',async({page,state})=>{
    const card=page.locator('.inline-inbox .inbox-card');await expect(card.getByRole('button',{name:'安装',exact:true})).toBeVisible();
    await card.getByRole('button',{name:'安装',exact:true}).click();await expect(card).toHaveCount(0);assert.deepEqual(JSON.parse(request(state,'/v1/inbox/tool1/resolve').body.resolution),{approved:true});
    await navigate(page,'收件箱');await page.getByRole('button',{name:'路由配置'}).click();await expect(page.getByLabel('审批投递频道')).toBeVisible();
    await page.screenshot({path:path.join(__dirname,'../dist/p2-routing.png'),fullPage:true});
    await page.getByRole('button',{name:/深色模式/}).click();await page.getByTitle('收起侧边栏').click();await page.setViewportSize({width:430,height:820});
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:path.join(__dirname,'../dist/p2-narrow.png'),fullPage:true});
    await page.getByTitle('展开侧边栏').click();await expect(page.locator('.sidebar')).toBeVisible();
  },s=>{s.unattended=true;s.inbox=[{id:'tool1',session_id:'s1',kind:'tool',title:'安装工具',body:'读取 PDF',state:'pending',data:{tool:'pdftotext',installable:true,version:'1.0'}}];});
  console.log(count+' P2 browser regression scenarios passed.');
 } finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
