// Browser coverage for the Vue P2 workflows, using the current Vue fixture.
const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path = require('node:path');
const skip = '__ocw_skip__';
const unsupported = { thinking:{support:'not_supported'}, reasoning:{support:'not_supported'} };
const reasoning = { thinking:{support:'not_supported'}, reasoning:{support:'supported',levels:['low','medium','high'],default:'medium'} };
const thinking = { thinking:{support:'supported',default:true}, reasoning:{support:'not_supported'} };
function setup(s) {
  s.settings.onboarded=true; s.settings.model_ready=true; s.history=[]; s.inbox=[];
  s.providers=[{name:'test',title:'Test',needs_key:true,configured:true,kind:'api_key',fields:[],suggested_models:['one','two']},
    {name:'ollama',title:'Ollama',kind:'local',configured:true,needs_key:false,fields:[],suggested_models:['nemotron:30b']},
    {name:'openrouter-account',title:'OpenRouter account',kind:'subscription',auth:'oauth',signed_in:false,fields:[]}];
  s.settings.models.push('ollama:nemotron:30b'); s.settings.model_groups={'test:one':'cloud','test:two':'cloud','ollama:nemotron:30b':'local'};
  s.records={}; s.sessionSettings={}; s.localAlive=false; s.localRows=[]; s.login={connected:false,authorizing:false};
  const controls=model=>model==='test:one'?reasoning:model.startsWith('ollama:')?thinking:unsupported;
  const config=model=>{
    const record=s.records[model] || {}, result={model,controls:controls(model),price:null};
    for(const key of ['context_size','max_output_tokens','temperature','top_p','compaction_threshold_pct','thinking','reasoning_effort','default'])
      result[key]={value:record[key] ?? (key==='default'?false:null),from:key in record?'user':'provider'};
    return result;
  };
  s.extraRoute=(url,body,req)=>{
    const p=url.pathname;
    if(p.endsWith('/messages'))return {messages:s.history};
    if(p==='/v1/providers')return s.providers;
    if(p==='/v1/inbox')return {items:s.inbox.filter(item=>!url.searchParams.get('session_id') || item.session_id===url.searchParams.get('session_id'))};
    if(p.match(/^\/v1\/inbox\/[^/]+\/resolve$/)) {
      if(s.rejectAnswer)return {ok:false,error:'回答提交失败'};
      s.resolutions??=[]; s.resolutions.push(body.resolution); s.inbox=s.inbox.filter(item=>item.id!==p.split('/')[3]); return {ok:true};
    }
    if(p==='/v1/settings/model-config') {
      if(req.method()==='GET')return config(url.searchParams.get('model'));
      if(s.rejectConfig)return {ok:false,error:'模型设置保存失败'};
      const record=s.records[body.model]??={};
      for(const [key,value] of Object.entries(body.values))if(value==null)delete record[key];else record[key]=value;
      s.settings.model_config={...s.records}; return {ok:true,...config(body.model)};
    }
    if(p==='/v1/settings/model-config/remove') {delete s.records[body.model];s.settings.model_config={...s.records};return {ok:true};}
    if(p.endsWith('/model-settings')) {
      const model=req.method()==='GET' ? url.searchParams.get('model') : s.activeModel || 'test:one';
      if(req.method()!=='GET')s.sessionSettings={...s.sessionSettings,...body};
      return {ok:true,model,controls:controls(model),thinking:null,reasoning_effort:null,...s.sessionSettings};
    }
    if(p==='/v1/system/facts')return {processor:'Test CPU',graphics:'Test GPU',memory_bytes:32*1024**3,gpu_memory_bytes:8*1024**3};
    if(p.endsWith('/local-models'))return {provider:'ollama',alive:s.localAlive,models:s.localRows};
    if(p.startsWith('/v1/providers/openrouter-account/')) {
      if(p.endsWith('/signin'))s.login={connected:false,authorizing:true,attempt_id:'attempt',authorize_url:'https://openrouter.ai/auth?test=1'};
      if(p.endsWith('/cancel'))s.login={connected:false,authorizing:false};
      if(p.endsWith('/complete')) {if(body.code==='bad')return {...s.login,error:'授权码无效'};s.login={connected:true,authorizing:false};s.providers[2].signed_in=true;}
      if(p.endsWith('/disconnect')){s.login={connected:false,authorizing:false};s.providers[2].signed_in=false;}
      return s.login;
    }
  };
}
async function settings(page) {await page.locator('.surface-nav').getByRole('button',{name:'设置'}).click();await page.locator('.subnav').getByRole('button',{name:'模型',exact:true}).click();}
const input=page=>page.locator('.composer textarea');
function question(id='q') {return {id,session_id:'s1',kind:'question',state:'pending',title:'选择地区',options:['上海','北京'],allow_text:true};}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.P0_BROWSER_CHANNEL || 'msedge',headless:true});
  const base='http://127.0.0.1:'+server.address().port; let count=0;
  async function check(name,fn,configure=()=>{}) {
    const f=await fixture(browser,base,s=>{setup(s);configure(s);});
    await f.page.context().route('https://openrouter.ai/**',route=>route.fulfill({contentType:'text/html',body:'Mock authorization page'}));
    try {await fn(f);await f.close();console.log('PASS '+(++count)+': '+name);}
    catch(error){await f.page.screenshot({path:path.join(__dirname,'../dist/p2-failure.png'),fullPage:true});throw error;}
  }
  try {
    await check('single live question skip is explicit and sends no extra turn',async({page,state})=>{
      state.emit('s1','turn_start',{input:'任务'});state.emit('s1','question_requested',{question:'选择地区',options:['上海','北京']});
      await page.getByRole('button',{name:'跳过此题',exact:true}).click();
      await expect.poll(()=>state.sent.find(row=>row.type==='question_response')?.answer).toBe(skip);
      assert.equal(state.sent.filter(row=>row.type==='user_message').length,0);
    });
    await check('grouped main-input answers and skip remaining preserve submitted content',async({page,state})=>{
      state.emit('s1','turn_start',{input:'任务'});state.emit('s1','question_requested',{questions:[{header:'A',question:'第一题'},{header:'B',question:'第二题'},{header:'C',question:'第三题'}]});
      await expect(page.locator('.question-prompt h3')).toHaveText('第一题');
      await input(page).fill('已回答内容');await input(page).press('Enter');
      await expect(page.locator('.question-prompt h3')).toHaveText('第二题');
      await page.getByRole('button',{name:'跳过剩余问题',exact:true}).click();
      await expect.poll(()=>state.sent.filter(row=>row.type==='question_response').length).toBe(1);
      assert.deepEqual(JSON.parse(state.sent.find(row=>row.type==='question_response').answer),{A:'已回答内容',B:skip,C:skip});
      assert.equal(state.sent.filter(row=>row.type==='user_message').length,0);
    });
    await check('Inbox grouped answer via main input and individual skips keep step state',async({page,state})=>{
      state.emit('s1','turn_start');
      const card=page.locator('.inbox-card');await expect(card.locator('h3')).toHaveText('第一题');
      await input(page).fill('保留答案');await input(page).press('Enter');
      await expect(card.locator('h3')).toHaveText('第二题');
      await card.getByRole('button',{name:'跳过此题',exact:true}).click();
      await expect.poll(()=>state.resolutions?.length).toBe(1);
      assert.deepEqual(JSON.parse(state.resolutions[0]),{A:'保留答案',B:skip});
      assert.equal(state.sent.filter(row=>row.type==='user_message').length,0);
    },s=>{s.inbox=[{...question(),questions:[{header:'A',question:'第一题'},{header:'B',question:'第二题'}]}];});
    await check('main input resolves a single Inbox question while the task is running',async({page,state})=>{
      state.emit('s1','turn_start');await expect(page.locator('.inbox-card')).toBeVisible();
      await input(page).fill('广州');await input(page).press('Enter');
      await expect.poll(()=>state.resolutions?.[0]).toBe('广州');assert.equal(state.sent.filter(row=>row.type==='user_message').length,0);
    },s=>{s.inbox=[question()];});
    await check('team and item proposal feedback from the main input releases waits',async({page,state})=>{
      state.emit('s1','turn_start');state.emit('s1','team_proposed',{members:[{name:'成员'}]});
      await expect(page.locator('.approval-prompt')).toContainText('允许创建智能体团队');
      await input(page).fill('缩减到两名成员');await input(page).press('Enter');
      await expect.poll(()=>state.sent.find(row=>row.type==='team_response')?.feedback).toBe('缩减到两名成员');
      state.emit('s1','items_proposed',{items:[{title:'任务'}]});await expect(page.locator('.approval-prompt')).toContainText('允许创建这些看板任务');
      await input(page).fill('补充验收标准');await input(page).press('Enter');
      await expect.poll(()=>state.sent.find(row=>row.type==='items_response')?.feedback).toBe('补充验收标准');
      assert.equal(state.sent.find(row=>row.type==='team_response').approved,false);assert.equal(state.sent.filter(row=>row.type==='user_message').length,0);
    });
    await check('Inbox proposal feedback retains input on rejection and retries once',async({page,state})=>{
      state.emit('s1','turn_start');await expect(page.locator('.inbox-card')).toBeVisible();state.rejectAnswer=true;
      await input(page).fill('调整任务顺序');await input(page).press('Enter');await expect(page.getByRole('alert')).toContainText('回答提交失败');await expect(input(page)).toHaveValue('调整任务顺序');
      state.rejectAnswer=false;await input(page).press('Enter');await expect.poll(()=>state.resolutions?.length).toBe(1);
      assert.deepEqual(JSON.parse(state.resolutions[0]),{approved:false,feedback:'调整任务顺序'});
    },s=>{s.inbox=[{id:'p',session_id:'s1',kind:'plan',state:'pending',title:'计划',body:'待审核计划',data:{plan:'待审核计划'}}];});
    await check('persistent model settings show sources, reject failures and reset',async({page,state})=>{
      await settings(page);await page.getByRole('button',{name:'模型设置 test:one',exact:true}).click();const dialog=page.getByRole('dialog',{name:'模型设置'});
      await expect(dialog.getByLabel('输出上限')).toBeVisible();await dialog.getByLabel('输出上限').fill('8192');await dialog.getByLabel('压缩阈值（0.10–0.95）').fill('0.6');
      state.rejectConfig=true;await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('模型设置保存失败');await expect(dialog.getByLabel('输出上限')).toHaveValue('8192');
      state.rejectConfig=false;await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).toHaveCount(0);
      assert.deepEqual(state.records['test:one'],{max_output_tokens:8192,compaction_threshold_pct:0.6});
      await page.getByRole('button',{name:'模型设置 test:one',exact:true}).click();await expect(dialog.getByLabel('输出上限')).toHaveValue('8192');await expect(dialog).toContainText('用户设置');
      await dialog.getByRole('button',{name:'重置模型设置',exact:true}).click();assert.equal(state.records['test:one'],undefined);
    });
    await check('model groups and per-session controls follow model capabilities and reset',async({page,state})=>{
      const control=page.getByLabel('会话推理强度');await expect(control).toBeVisible();await control.selectOption('high');await expect.poll(()=>state.sessionSettings.reasoning_effort).toBe('high');await control.selectOption('');await expect.poll(()=>state.sessionSettings.reasoning_effort).toBe(null);
      await page.getByRole('button',{name:'选择模型',exact:true}).click();const picker=page.locator('.model-selector .select-popover');await expect(picker).toContainText('本地模型');await expect(picker).toContainText('云端模型');await picker.getByRole('option',{name:/test:two/}).click();
      await expect(control).toHaveCount(0);await expect(page.getByLabel('会话思考开关')).toHaveCount(0);
      await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.locator('.model-selector').getByRole('option',{name:/nemotron:30b/}).click();state.activeModel='ollama:nemotron:30b';
      await expect(page.getByLabel('会话思考开关')).toBeVisible();await page.getByLabel('会话思考开关').selectOption('false');await expect.poll(()=>state.sessionSettings.thinking).toBe(false);
      state.emit('s1','turn_start');await expect(page.getByLabel('会话思考开关')).toBeDisabled();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toBeDisabled();
    });
    await check('local model status retries and distinguishes missing tools and inference',async({page,state})=>{
      await settings(page);await page.getByTestId('provider-ollama').click();const local=page.getByTestId('local-models');await expect(local).toContainText('Test CPU');await expect(local).toContainText('32.0 GiB');await expect(local.getByRole('alert')).toContainText('不可达');
      state.localAlive=true;state.localRows=[{model:'ollama:bad',name:'bad',size_bytes:4*1024**3,context:32768,tools:false,thinking:false,inference_ready:false}];await local.getByRole('button',{name:'刷新模型状态'}).click();await expect(local).toContainText('推理路由不可用');await expect(local.getByRole('button',{name:'添加到模型选择器'})).toBeDisabled();
      state.localRows=[{model:'ollama:good',name:'good',size_bytes:4*1024**3,context:32768,context_max:131072,tools:true,thinking:true,fit:'runs_well'}];await local.getByRole('button',{name:'刷新模型状态'}).click();await expect(local).toContainText('32768 / 131072');await expect(local.getByRole('button',{name:'添加到模型选择器'})).toBeEnabled();
      await page.setViewportSize({width:430,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    });
    await check('OpenRouter code login, cancellation, retry and signout are separate from API keys',async({page,state})=>{
      await settings(page);await page.getByTestId('provider-openrouter-account').click();const account=page.getByTestId('openrouter-account');
      await account.getByRole('button',{name:'使用手动授权码'}).click();await expect(account.getByLabel('OpenRouter 授权码')).toBeVisible();await account.getByRole('button',{name:'取消登录'}).click();await expect(account.getByRole('button',{name:'使用 OpenRouter 登录'})).toBeVisible();
      await account.getByRole('button',{name:'使用手动授权码'}).click();await account.getByLabel('OpenRouter 授权码').fill('bad');await account.getByRole('button',{name:'完成登录'}).click();await expect(account.getByRole('alert')).toContainText('授权码无效');
      await account.getByLabel('OpenRouter 授权码').fill('valid');await account.getByRole('button',{name:'完成登录'}).click();await expect(account.getByRole('button',{name:'退出 OpenRouter 账号'})).toBeVisible();await account.getByRole('button',{name:'退出 OpenRouter 账号'}).click();await expect(account.getByRole('button',{name:'使用 OpenRouter 登录'})).toBeVisible();
      assert.equal(state.requests.some(row=>row.path.includes('/openai-codex/')),false);
    });
    console.log(count+' P2 browser scenarios passed.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
