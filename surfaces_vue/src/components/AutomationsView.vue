<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";
import { createAutomation, deleteAutomation, getAutomation, getAutomations, markAutomationSeen, runAutomation, updateAutomation } from "../api";
import { requireSuccess } from "../settings";

const props = defineProps({ manualRuns: { type: Array, default: () => [] } });
const emit = defineEmits(["run", "open-session"]);
const tasks = ref([]);
const detail = ref(null);
const runs = ref([]);
const showForm = ref(false);
const busy = ref(false);
const runBusy = ref(false);
const error = ref("");
const form = ref({ title: "", instructions: "", time: "09:00", frequency: "daily" });
let timer;

const cron = () => {
  const [hour, minute] = form.value.time.split(":");
  return form.value.frequency === "weekdays" ? `${minute} ${hour} * * 1-5` : form.value.frequency === "weekends" ? `${minute} ${hour} * * 0,6` : `${minute} ${hour} * * *`;
};
const fmt = (value) => value ? new Date(value * 1000).toLocaleString() : "尚未运行";
async function refresh() {
  try {
    tasks.value = await getAutomations();
    const id = detail.value?.id;
    if (id) {
      const data = await getAutomation(id);
      if (detail.value?.id === id) {
        runs.value = data.runs || [];
        // Keep unsaved title/instructions while updating live execution facts.
        for (const key of ["last_status", "last_run", "next_run", "run_count"]) detail.value[key] = data.task[key];
      }
    }
  } catch (reason) { error.value = reason.message; }
}
async function openTask(id) {
  const data = await getAutomation(id);
  detail.value = data.task;
  runs.value = data.runs || [];
  await markAutomationSeen(id).catch(() => {});
}
async function create() {
  if (!form.value.title.trim() || !form.value.instructions.trim()) return;
  busy.value = true;
  try {
    const result = await createAutomation({ title: form.value.title.trim(), instructions: form.value.instructions.trim(), cron: cron(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    form.value = { title: "", instructions: "", time: "09:00", frequency: "daily" };
    showForm.value = false;
    await refresh();
    if (result.task) await openTask(result.task.id);
  } finally { busy.value = false; }
}
async function save() {
  await updateAutomation(detail.value.id, { title: detail.value.title, instructions: detail.value.instructions });
  await openTask(detail.value.id);
}
async function toggle() { await updateAutomation(detail.value.id, { enabled: !detail.value.enabled }); await openTask(detail.value.id); await refresh(); }
async function remove(id) { if (!confirm("确定删除这个自动化任务？")) return; await deleteAutomation(id); detail.value = null; await refresh(); }
async function runNow() {
  if (runBusy.value) return;
  const taskId = detail.value.id;
  error.value = "";
  runBusy.value = true;
  try {
    const prepared = requireSuccess(await runAutomation(taskId));
    if (!prepared.session_id || !prepared.run_id) throw new Error("运行信息不完整，请刷新任务后重试");
    emit("run", { ...prepared, task_id: taskId });
  } catch (reason) { error.value = reason.message; }
  finally { runBusy.value = false; }
}
function runNote(run) { return props.manualRuns.find((entry) => entry.run_id === run.run_id)?.note; }
watch(() => props.manualRuns, refresh);
onMounted(() => { refresh(); timer = window.setInterval(refresh, 5000); });
onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <section class="page-view">
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <template v-if="!detail">
      <div class="page-head"><div><h1>自动化</h1><p>创建定时任务，并查看每次运行的结果。</p></div><button class="btn primary" @click="showForm = !showForm">＋ 新建自动化</button></div>
      <form v-if="showForm" class="card form-card" @submit.prevent="create">
        <label>名称<input v-model="form.title" placeholder="例如：每日项目摘要" /></label>
        <label>任务说明<textarea v-model="form.instructions" rows="4" placeholder="描述每次运行时需要完成的任务"></textarea></label>
        <div class="form-grid"><label>时间<input v-model="form.time" type="time" /></label><label>重复<select v-model="form.frequency"><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekends">周末</option></select></label></div>
        <div class="actions"><button class="btn primary" :disabled="busy">{{ busy ? '创建中…' : '创建' }}</button><button type="button" class="btn" @click="showForm = false">取消</button></div>
      </form>
      <div v-if="tasks.length" class="card-list"><button v-for="task in tasks" :key="task.id" class="card list-card" @click="openTask(task.id)"><div><strong>{{ task.title }}</strong><small>{{ task.enabled ? task.schedule : '已暂停' }} · {{ task.run_count }} 次运行</small></div><span :class="['status-pill', task.last_status]">{{ task.last_status || '未运行' }}</span></button></div>
      <div v-else class="empty-card">还没有自动化任务。</div>
    </template>
    <template v-else>
      <button class="back-link" @click="detail = null">‹ 返回自动化列表</button>
      <div class="page-head"><div><h1>{{ detail.title }}</h1><p>{{ detail.schedule }} · 下次运行：{{ fmt(detail.next_run) }}</p></div><div class="actions"><button class="btn primary" :disabled="runBusy" @click="runNow">{{ runBusy ? '准备中…' : '立即运行' }}</button><button class="btn danger" @click="remove(detail.id)">删除</button></div></div>
      <div class="card form-card"><label class="toggle-row"><span><strong>启用任务</strong><small>关闭后不会再按计划运行</small></span><input type="checkbox" :checked="detail.enabled" @change="toggle" /></label><label>名称<input v-model="detail.title" /></label><label>任务说明<textarea v-model="detail.instructions" rows="6"></textarea></label><button class="btn primary" @click="save">保存更改</button></div>
      <h2 class="section-title">运行历史</h2>
      <div v-if="runs.length" class="card-list"><button v-for="run in runs" :key="run.run_id" class="card list-card" :disabled="!run.session_id" @click="emit('open-session', { id: run.session_id, workspace: detail.workspace, agent: detail.agent })"><div><strong>{{ fmt(run.started_at) }}</strong><small>{{ run.result_text || run.error || run.trigger }}</small><small v-if="runNote(run)" class="error-text">{{ runNote(run) }}</small></div><span :class="['status-pill', run.status]">{{ run.status }}</span></button></div>
      <div v-else class="empty-card">暂无运行记录。</div>
    </template>
  </section>
</template>
