<script setup>
import { t } from '../i18n';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createAutomation, deleteAutomation, getAutomation, getAutomations, markAutomationSeen, runAutomation, updateAutomation, getConnectors } from '../api';
import { checked } from '../p2api';
import { scheduleForm, schedulePayload } from '../p2';
import { automationTemplates, templateInstructions } from '../automationTemplates';
import ScheduleEditor from './ScheduleEditor.vue';
import ChannelPicker from './ChannelPicker.vue';
import ConnectorAuth from './ConnectorAuth.vue';
const props=defineProps({manualRuns:{type:Array,default:()=>[]},initialTask:String});
const emit=defineEmits(['run','open-session','change','open-connectors']);
const tasks=ref([]),detail=ref(null),runs=ref([]),showForm=ref(false),busy=ref(false),runBusy=ref(false),error=ref('');
const form=ref({title:'',instructions:''}),schedule=ref(scheduleForm({cron:'0 9 * * *'})),editSchedule=ref(scheduleForm());
const template=ref(null),repository=ref(''),channel=ref(''),consent=ref(false),delivery=ref('app'),connectors=ref([]);
const deliveryTemplate=computed(()=>template.value ? {...template.value,delivery:template.value.delivery || (template.value.id==='brief' && delivery.value==='slack')} : null);
const missing=computed(()=>(template.value ? [...template.value.needs,...(template.value.id==='brief'&&delivery.value==='slack'?['slack']:[])] : []).filter(name=>!connectors.value.some(c=>c.name===name&&c.connected)) || []);
let timer,disposed=false,version=0;
const fmt=value=>value ? new Date(value*1000).toLocaleString() : t('尚未运行');
async function refresh(){
  try {
    tasks.value=await getAutomations(); emit('change');
    if(showForm.value) connectors.value=await getConnectors();
    const id=detail.value?.id;
    if(id){const data=checked(await getAutomation(id));if(detail.value?.id===id&&data.task){runs.value=data.runs||[];for(const key of ['last_status','last_run','next_run','run_count','always_allowed']) detail.value[key]=data.task[key];}}
  }catch(e){error.value=e.message;}
}
async function poll(){await refresh();if(!disposed)timer=setTimeout(poll,5000);}
async function openTask(id){
  const current=++version;error.value='';
  try {const data=checked(await getAutomation(id));if(current!==version)return;if(!data.task)throw new Error('任务不存在');detail.value=data.task;runs.value=data.runs||[];editSchedule.value=scheduleForm(data.task.schedule_raw);checked(await markAutomationSeen(id));emit('change');}
  catch(e){if(current===version)error.value=e.message;}
}
async function act(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();await refresh();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function startCreate(preset=null){
  template.value=preset;form.value={title:t(preset?.title || ''),instructions:t(preset?.instructions || '')};
  schedule.value={...scheduleForm({cron:'0 9 * * *'}),frequency:preset?.frequency || 'daily',time:preset?.time || '09:00'};
  repository.value='';channel.value='';delivery.value='app';consent.value=false;showForm.value=true;refresh();
}
function create(){act(async()=>{
  if(!form.value.title.trim()||!form.value.instructions.trim())throw new Error('请填写名称和任务说明');
  if(missing.value.length)throw new Error('请先连接模板依赖的服务');
  const instructions=template.value ? templateInstructions({...deliveryTemplate.value,instructions:form.value.instructions},repository.value,channel.value) : form.value.instructions.trim();
  const payload={title:form.value.title.trim(),instructions,...schedulePayload(schedule.value)};
  if(deliveryTemplate.value?.delivery&&consent.value)payload.permissions=[{tool:'send_message',target:channel.value.trim(),access:'write'}];
  const result=checked(await createAutomation(payload));showForm.value=false;template.value=null;if(result.task)await openTask(result.task.id);
});}
function save(){act(async()=>{
  const parsed=['once','unchanged'].includes(editSchedule.value.kind) ? {} : schedulePayload(editSchedule.value);
  checked(await updateAutomation(detail.value.id,{title:detail.value.title,instructions:detail.value.instructions,...parsed.cron?{cron:parsed.cron}:{}}));
  await openTask(detail.value.id);
});}
function toggle(){act(async()=>{checked(await updateAutomation(detail.value.id,{enabled:!detail.value.enabled}));await openTask(detail.value.id);});}
function revoke(rule){act(async()=>{checked(await updateAutomation(detail.value.id,{revoke:rule.entry}));await openTask(detail.value.id);});}
function remove(id){if(!confirm('确定删除这个自动化任务？'))return;act(async()=>{checked(await deleteAutomation(id));detail.value=null;version++;});}
async function runNow(){
  if(runBusy.value)return;const task=detail.value;error.value='';runBusy.value=true;
  try{const prepared=checked(await runAutomation(task.id));if(!prepared.session_id||!prepared.run_id)throw new Error('运行信息不完整，请刷新任务后重试');emit('run',{...prepared,task_id:task.id,task_title:task.title});}
  catch(e){error.value=e.message;}finally{runBusy.value=false;}
}
function runNote(run){return props.manualRuns.find(entry=>entry.run_id===run.run_id)?.note;}
watch(()=>props.manualRuns,refresh);watch(()=>props.initialTask,id=>{if(id)openTask(id);});
watch(channel,()=>consent.value=false);
onMounted(()=>{poll();if(props.initialTask)openTask(props.initialTask);});
onUnmounted(()=>{disposed=true;version++;clearTimeout(timer);});
</script>
<template><section class="page-view">
<p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
<template v-if="!detail">
<div class="page-head"><div><h1>{{ t("自动化") }}</h1><p>{{ t("创建定时任务，并查看每次运行的结果。") }}</p></div><button class="btn primary" @click="startCreate()">{{ t("＋ 新建自动化") }}</button></div>
<div class="automation-templates"><button v-for="preset in automationTemplates" :key="preset.id" class="btn" @click="startCreate(preset)">{{ t(preset.title) }}</button></div>
<section v-if="showForm" class="card form-card"><fieldset :disabled="busy">
<h2>{{ template ? template.title+t("模板") : t("新建自动化") }}</h2>
<div v-for="name in missing" :key="name" class="dependency-card"><strong>{{ t("需要连接 ") }}{{ name }}</strong><ConnectorAuth v-if="connectors.find(c=>c.name===name)" :connector="connectors.find(c=>c.name===name)" @change="refresh" /><button v-else type="button" class="btn" @click="emit('open-connectors',name)">{{ t("打开连接器设置") }}</button></div>
<label>{{ t("名称") }}<input v-model="form.title" required :placeholder="t(&quot;例如：每日项目摘要&quot;)" /></label>
<label>{{ t("任务说明") }}<textarea v-model="form.instructions" required rows="4" :placeholder="t(&quot;描述每次运行时需要完成的任务&quot;)"></textarea></label>
<label v-if="template?.repository">{{ t("GitHub 仓库") }}<input v-model="repository" required placeholder="owner/repository" /></label>
<label v-if="template?.id==='brief'">{{ t("简报投递方式") }}<select v-model="delivery"><option value="app">{{ t("任务运行会话") }}</option><option value="slack">{{ t("Slack 频道") }}</option></select></label><template v-if="deliveryTemplate?.delivery"><ChannelPicker v-model="channel" :label="t(&quot;摘要投递频道&quot;)" /><label class="consent-row"><input v-model="consent" type="checkbox" :disabled="!channel.trim()" />{{ t("允许此任务每次使用 send_message 写入 ") }}{{ channel || t("所选频道") }}</label><small>{{ t("未授权时，发送前会进入审批流程；仅此任务与此目标适用。") }}</small></template>
<ScheduleEditor v-model="schedule" />
<div class="actions"><button type="button" class="btn primary" :disabled="busy||missing.length" @click="create">{{ busy ? t("创建中…") : t("创建") }}</button><button type="button" class="btn" @click="showForm=false">{{ t("取消") }}</button></div>
</fieldset></section>
<div v-if="tasks.length" class="card-list"><button v-for="task in tasks" :key="task.id" class="card list-card" @click="openTask(task.id)"><div><strong>{{ task.title }} <span v-if="task.unseen_runs" class="badge">{{ task.unseen_failed ? t("有未读失败") : t("未读") }} {{ task.unseen_runs }}</span></strong><small>{{ task.enabled ? task.schedule : t("已暂停") }} · {{ task.run_count }}{{ t(" 次运行") }}</small></div><span :class="['status-pill',task.last_status]">{{ task.last_status || t("未运行") }}</span></button></div><div v-else class="empty-card">{{ t("还没有自动化任务。") }}</div>
</template>
<template v-else><button class="back-link" @click="detail=null;version++">{{ t("‹ 返回自动化列表") }}</button>
<div class="page-head"><div><h1>{{ detail.title }}</h1><p>{{ detail.schedule }}{{ t(" · 下次运行：") }}{{ fmt(detail.next_run) }}</p></div><div class="actions"><button class="btn primary" :disabled="runBusy||busy" @click="runNow">{{ runBusy ? t("准备中…") : t("立即运行") }}</button><button class="btn danger" :disabled="busy" @click="remove(detail.id)">{{ t("删除") }}</button></div></div>
<form class="card form-card" @submit.prevent="save"><fieldset :disabled="busy"><label class="toggle-row"><span><strong>{{ t("启用任务") }}</strong><small>{{ t("关闭后不会再按计划运行") }}</small></span><input type="checkbox" :checked="detail.enabled" @change="toggle" /></label><label>{{ t("名称") }}<input v-model="detail.title" required /></label><label>{{ t("任务说明") }}<textarea v-model="detail.instructions" required rows="6"></textarea></label><ScheduleEditor v-model="editSchedule" editing /><button class="btn primary">{{ t("保存更改") }}</button></fieldset></form>
<section class="card form-card"><h2>{{ t("持久授权") }}</h2><p v-if="!detail.always_allowed?.length" class="muted">{{ t("暂无。可在模板创建时授权指定投递目标，或在本任务的审批中选择每次允许。") }}</p><div v-for="rule in detail.always_allowed || []" :key="rule.entry" class="access-row"><strong>{{ rule.tool }}</strong><code>{{ rule.target || rule.entry }}</code><button class="btn" :disabled="busy" @click="revoke(rule)">{{ t("撤销授权") }}</button></div></section>
<h2 class="section-title">{{ t("运行历史") }}</h2><div v-if="runs.length" class="card-list"><button v-for="run in runs" :key="run.run_id" class="card list-card" :disabled="!run.session_id" @click="emit('open-session',{id:run.session_id,workspace:detail.workspace,agent:detail.agent,task_id:detail.id,task_title:detail.title})"><div><strong>{{ fmt(run.started_at) }}</strong><small>{{ run.result_text || run.error || run.trigger }}</small><small v-if="runNote(run)" class="error-text">{{ runNote(run) }}</small></div><span :class="['status-pill',run.status]">{{ run.status }}</span></button></div><div v-else class="empty-card">{{ t("暂无运行记录。") }}</div>
</template></section></template>
