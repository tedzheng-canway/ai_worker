import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleForm, schedulePayload } from '../src/automation-schedule.js';
import { mcpImports, objectJson, splitAddress } from '../src/config-input.js';
import { parkedPrompt, parkedResolution, inboxMatches } from '../src/inbox-prompts.js';
import {automationTemplates,templateInstructions} from '../src/automationTemplates.js';
import {historyItems} from '../src/history.js';

test('schedules round-trip midnight, weekly, arbitrary cron and legacy missing metadata',()=>{
  for(const cron of ['0 0 * * *','30 17 * * 5','*/15 1-8 * * 1,3,5','5 6 1 * *']) assert.equal(schedulePayload(scheduleForm({kind:'cron',cron,timezone:'Asia/Shanghai'})).cron,cron);
  assert.deepEqual(schedulePayload(scheduleForm()),{});
  assert.throws(()=>schedulePayload({kind:'cron',time:'24:00'}),/有效时间/);
  assert.throws(()=>schedulePayload({kind:'custom',cron:'bad'}),/五个字段/);
  assert.throws(()=>schedulePayload({kind:'once',fire_at:'bad'}),/有效的单次/);
  assert.equal(schedulePayload(scheduleForm({kind:'once',fire_at:'2026-10-01T09:00:00+08:00'})).fire_at,'2026-10-01T09:00:00+08:00');
});
test('MCP import validates every entry before mutation and preserves structured configuration',()=>{
  const input={mcpServers:{local:{command:'D:/Program Files/tool.exe',args:['a b'],env:{KEY:'value'},cwd:'D:/work'},remote:{url:'https://example.test/mcp',headers:{Authorization:'Bearer test'},auth:'oauth',include_tools:[]}}};
  assert.deepEqual(mcpImports(JSON.stringify(input)),Object.entries(input.mcpServers));
  for(const invalid of ['[]','null','{}','{"a":{"url":"https://x"},"b":{}}']) assert.throws(()=>mcpImports(invalid));
  assert.throws(()=>objectJson('[]','环境变量'),/环境变量/);
});
test('parked prompts preserve rich questions and structured plan/directory replies',()=>{
  const question={kind:'question',body:'选择方案',questions:[{header:'A',question:'方案',options:['甲','乙']}],allow_text:false,multi:true};
  assert.deepEqual(parkedPrompt(question).questions,question.questions);assert.equal(parkedPrompt(question).allowText,false);
  assert.equal(parkedResolution(question,'{"A":"甲"}'),'{"A":"甲"}');
  assert.deepEqual(JSON.parse(parkedResolution({kind:'directory',data:{path:'D:/work',primary:true}},{approved:true,writable:false})),{granted:true,path:'D:/work',writable:true});
  assert.deepEqual(JSON.parse(parkedResolution({kind:'directory'},{approved:false})),{granted:false});
  assert.deepEqual(JSON.parse(parkedResolution({kind:'plan'},{approved:false,feedback:'先补测试'})),{approved:false,feedback:'先补测试'});
  assert.equal(parkedResolution({kind:'approval'},{decision:'once'}),'allow');
  assert.equal(parkedPrompt({kind:'tool',body:'需要 PDF 工具',data:{tool:'pdftotext',installable:true}}).kind,'toolreq');
  assert.equal(parkedResolution({kind:'tool'},{approved:true}),'{"approved":true}');
  assert.equal(inboxMatches({kind:'teamreq'},{kind:'plan'}),true);
  assert.deepEqual(JSON.parse(parkedResolution({kind:'plan'},{approved:true,enableChat:true},'teamreq')),{approved:true,enable_chat:true});
  assert.equal(parkedPrompt({kind:'approval',data:{standing_target:'slack:T/C'}},{kind:'approval',name:'send_message'}).standingTarget,'slack:T/C');
});
test('external history keeps structured sender/channel metadata, even for empty content',()=>{
  const source={connector:'slack',sender_id:'U1',channel_id:'T1/C1',sender_name:'Ada',text:''};
  assert.deepEqual(historyItems([{role:'user',content:'',source}])[0].source,source);
  assert.equal(historyItems([{role:'user',source,content:'消息'}])[0].kind,'connector');
  assert.deepEqual(splitAddress('slack:T1/C1'),['slack','T1/C1']);
  assert.deepEqual(splitAddress('email:a:b'),['email','a:b']);
});
test('automation recipes require destinations and retain actual calendar connector name',()=>{
  const github=automationTemplates.find(t=>t.id==='github');
  assert.throws(()=>templateInstructions(github,'','slack:T/C'),/仓库/);
  assert.throws(()=>templateInstructions(github,'org/repo',''),/投递频道/);
  assert.match(templateInstructions(github,'org/repo','slack:T/C'),/org\/repo[\s\S]*slack:T\/C/);
  assert.ok(automationTemplates.find(t=>t.id==='brief').needs.includes('google_calendar'));
});
