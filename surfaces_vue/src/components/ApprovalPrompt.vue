<script setup>
import { computed } from "vue";

const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(["resolve"]);
const fileTools = new Set(["write_file", "replace_in_file", "apply_patch", "apply_unified_diff"]);
const isFile = computed(() => props.item.kind === "approval" && fileTools.has(props.item.name));
const title = computed(() => {
  const item = props.item;
  if (item.kind === "dirreq") return item.writable ? "允许写入这个目录？" : "允许读取这个目录？";
  if (item.kind === "toolreq") return `安装工具 ${item.tool || ""}？`;
  if (item.kind === "planreq") return "批准这个执行计划？";
  if (item.kind === "teamreq") return "允许创建智能体团队？";
  if (item.kind === "itemsreq") return "允许创建这些看板任务？";
  if (item.name === "write_file") return `创建文件 ${baseName(item.args?.path)}？`;
  if (["replace_in_file", "apply_patch", "apply_unified_diff"].includes(item.name)) return `修改文件 ${baseName(item.args?.path)}？`;
  if (item.name === "run_shell") return "允许运行这条命令？";
  return `允许执行 ${item.name || "此操作"}？`;
});
const detail = computed(() => {
  const item = props.item;
  if (item.kind === "dirreq") return item.path || item.reason;
  if (item.kind === "toolreq") return item.summary || item.reason;
  if (item.kind === "planreq") return item.plan;
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
function scopeText(item) { return item.args?.path ? `目标位置：${item.args.path}` : "此操作需要你的确认。"; }
</script>

<template>
  <section class="approval-prompt">
    <div class="approval-heading"><span class="approval-mark">!</span><div><strong>{{ title }}</strong><small>{{ detail }}</small></div></div>
    <div v-if="item.kind === 'approval' && item.args?.path" class="approval-path">{{ item.args.path }}</div>
    <pre v-if="preview" class="approval-preview">{{ preview }}</pre>
    <div class="approval-actions">
      <template v-if="item.kind === 'approval'">
        <button class="btn primary" @click="emit('resolve', { decision: 'once' })">允许一次</button>
        <button v-if="isFile" class="btn" @click="emit('resolve', { decision: 'always_tool' })">本会话始终允许</button>
        <button class="btn quiet-danger" @click="emit('resolve', { decision: 'deny' })">拒绝</button>
      </template>
      <template v-else-if="item.kind === 'dirreq'">
        <button class="btn primary" @click="emit('resolve', { approved: true, writable: item.writable })">{{ item.writable ? '允许读写' : '允许读取' }}</button>
        <button class="btn quiet-danger" @click="emit('resolve', { approved: false })">拒绝</button>
      </template>
      <template v-else-if="item.kind === 'toolreq'">
        <button v-if="item.installable" class="btn primary" @click="emit('resolve', { approved: true })">安装</button>
        <button class="btn quiet-danger" @click="emit('resolve', { approved: false })">跳过</button>
      </template>
      <template v-else>
        <button class="btn primary" @click="emit('resolve', { approved: true })">批准</button>
        <button class="btn quiet-danger" @click="emit('resolve', { approved: false })">拒绝</button>
      </template>
    </div>
  </section>
</template>
