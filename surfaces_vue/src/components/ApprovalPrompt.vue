<script setup>
import { t } from '../i18n';
import { computed, ref } from "vue";
import MarkdownView from './MarkdownView.vue';

const props = defineProps({ item: { type: Object, required: true }, autoApprove: Boolean, runTask: Boolean });
const emit = defineEmits(["resolve"]);
const feedback = ref(''), executionMode = ref('interactive'), enableChat = ref(!!props.item.enable_chat), directory = ref(props.item.path || '');
const grants = computed(() => {
  const item = props.item, rows = [], standing = props.runTask && item.standingTarget;
  const connector = item.category === 'connector', mcp = item.name?.startsWith('mcp__') && !connector;
  if (standing) rows.push(['always_task', t('此自动化每次允许：')+item.standingTarget]);
  if (!props.autoApprove) {
    if (!standing && (connector || mcp || ['send_message','send_file'].includes(item.name))) rows.push(['this_run', '本轮运行允许此操作']);
    if (!standing && !connector && !mcp && !['run_shell','save_skill','web_fetch','web_search'].includes(item.name)) rows.push(['always_tool', '本会话允许此工具']);
    if (!standing && mcp) rows.push(['always_trust', '始终信任此 MCP 工具']);
    if (!standing && item.name === 'web_fetch') { try { const url = new URL(item.args.url); if (['http:','https:'].includes(url.protocol)) rows.push(['always_domain', t('本会话允许域名')+' '+url.hostname.replace(/^www\./, '')]); } catch {} }
    if (!standing && item.name === 'web_search') rows.push(['always_tool','本会话允许搜索']);
    if (item.name === 'run_shell') rows.push(['always_command','本会话允许此命令']);
  }
  if (item.name === 'run_shell' && item.readonlyOk) rows.push(['readonly_session','本会话允许只读命令']);
  return rows;
});
function resolve(approved) { emit('resolve', { approved, feedback: feedback.value.trim(), mode: props.item.kind === 'planreq' && approved ? executionMode.value : undefined, enableChat: enableChat.value }); }
const fileTools = new Set(["write_file", "replace_in_file", "apply_patch", "apply_unified_diff"]);
const isFile = computed(() => props.item.kind === "approval" && fileTools.has(props.item.name));
const title = computed(() => {
  const item = props.item;
  if (item.kind === "dirreq") return item.writable ? "允许写入这个目录？" : "允许读取这个目录？";
  if (item.kind === "toolreq") return t('安装工具')+' '+(item.tool || '')+'?';
  if (item.kind === "planreq") return "批准这个执行计划？";
  if (item.kind === "teamreq") return "允许创建智能体团队？";
  if (item.kind === "itemsreq") return "允许创建这些看板任务？";
  if (item.name === "write_file") return t('创建文件')+' '+baseName(item.args?.path)+'?';
  if (["replace_in_file", "apply_patch", "apply_unified_diff"].includes(item.name)) return t('修改文件')+' '+baseName(item.args?.path)+'?';
  if (item.name === "run_shell") return "允许运行这条命令？";
  return t('允许执行')+' '+(item.name || t('此操作'))+'?';
});
const detail = computed(() => {
  const item = props.item;
  if (item.kind === "dirreq") return item.path || item.reason;
  if (item.kind === "toolreq") return item.summary || item.reason;
  if (item.kind === "planreq") return t('请查看计划并选择执行模式，或提供修改意见。');
  if (item.kind === "teamreq") return item.members?.map((member) => member.name || member.persona).join("、") || item.note;
  if (item.kind === "itemsreq") return item.items?.map((entry) => entry.title || entry).join("\n") || item.note;
  return item.reason || scopeText(item);
});
const preview = computed(() => {
  const args = props.item.args || {};
  if (props.item.name === "run_shell") return args.command || "";
  if (isFile.value) return args.content || args.text || args.patch || args.diff || "";
  return Object.keys(args).length ? JSON.stringify(args, null, 2) : "";
});
function baseName(path) { return String(path || "文件").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "文件"; }
function scopeText(item) { return item.args?.path ? t('目标位置：')+item.args.path : t("此操作需要你的确认。"); }
</script>

<template>
  <section class="approval-prompt">
    <div class="approval-heading"><span class="approval-mark">!</span><div><strong>{{ t(title) }}</strong><small>{{ detail }}</small></div></div>
    <div v-if="item.kind === 'approval' && item.args?.path" class="approval-path">{{ item.args.path }}</div>
    <pre v-if="preview" class="approval-preview">{{ preview }}</pre>
    <p v-if="item.approvalOrigin">{{ t("来源：") }}{{ item.approvalOrigin }}</p><p v-if="item.approvalNote">{{ t("审查说明：") }}{{ item.approvalNote }}</p><p v-if="item.args?.url">{{ t("目标：") }}{{ item.args.url }}</p>
    <MarkdownView v-if="item.kind === 'planreq'" :text="item.plan" />
    <template v-if="item.kind === 'teamreq'"><article v-for="(member,i) in item.members" :key="i" class="approval-detail"><strong>{{ member.name || member.persona }}</strong><p>{{ member.task || member.instructions || member.role || member.reason }}</p><small>{{ t("智能体：") }}{{ member.persona || t("默认") }}{{ t(" · 模型：") }}{{ member.model || t("默认") }}{{ t(" · 推理：") }}{{ member.reasoning_effort || member.reasoning || t("默认") }}</small></article><label><input v-model="enableChat" type="checkbox" />{{ t("启用团队聊天") }}</label></template>
    <article v-for="(entry,i) in item.kind === 'itemsreq' ? item.items : []" :key="i" class="approval-detail"><strong>{{ entry.title || entry }}</strong><p v-if="entry.description">{{ entry.description }}</p><p v-if="entry.criteria">{{ t("验收标准：") }}{{ entry.criteria }}</p><small v-if="entry.assignee">{{ t("负责人：") }}{{ entry.assignee }}</small></article>
    <label v-if="item.kind === 'dirreq'">{{ t("目录路径") }}<input v-model="directory" :placeholder="t(&quot;目录绝对路径&quot;)" /></label>
    <label v-if="['planreq','teamreq','itemsreq'].includes(item.kind)">{{ t("修改意见") }}<textarea v-model="feedback" rows="2" :placeholder="t(&quot;拒绝时可说明需要修改的内容&quot;)"></textarea></label>
    <label v-if="item.kind === 'planreq'">{{ t("执行模式") }}<select v-model="executionMode"><option value="interactive">{{ t("逐次确认") }}</option><option value="auto">{{ t("绕过审批执行") }}</option></select></label>
    <div class="approval-actions">
      <template v-if="item.kind === 'approval'">
        <button class="btn primary" @click="emit('resolve', { decision: 'once' })">{{ t("允许一次") }}</button>
        <button v-for="grant in grants" :key="grant[0]" class="btn" @click="emit('resolve', { decision: grant[0] })">{{ t(grant[1]) }}</button>
        <button class="btn quiet-danger" @click="emit('resolve', { decision: 'deny' })">{{ t("拒绝") }}</button>
      </template>
      <template v-else-if="item.kind === 'dirreq'">
        <button class="btn primary" :disabled="!directory.trim()" @click="emit('resolve', { approved: true, path: directory.trim(), writable: item.writable })">{{ item.writable ? t("允许读写") : t("允许读取") }}</button>
        <button v-if="item.writable && !item.primary" class="btn" :disabled="!directory.trim()" @click="emit('resolve', { approved: true, path: directory.trim(), writable: false })">{{ t("仅允许读取") }}</button>
        <button class="btn quiet-danger" @click="emit('resolve', { approved: false })">{{ t("拒绝") }}</button>
      </template>
      <template v-else-if="item.kind === 'toolreq'">
        <button v-if="item.installable" class="btn primary" @click="emit('resolve', { approved: true })">{{ t("安装") }}</button>
        <button class="btn quiet-danger" @click="emit('resolve', { approved: false })">{{ t("跳过") }}</button>
      </template>
      <template v-else>
        <button class="btn primary" @click="resolve(true)">{{ t("批准") }}</button>
        <button class="btn quiet-danger" @click="resolve(false)">{{ feedback.trim() ? t("提交修改意见") : t("拒绝") }}</button>
      </template>
    </div>
  </section>
</template>
