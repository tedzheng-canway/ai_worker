<script setup>
import { t } from '../i18n';
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getRecentWorkspaces, openWorkspace, pickFolderViaServer } from "../api";

const props = defineProps({ personaName: String, externalError: String, externalBusy: Boolean });
const emit = defineEmits(["pick", "temp", "cancel"]);
const recents = ref([]);
const path = ref("");
const error = ref("");
const loading = ref(false);
const busy = computed(() => loading.value || props.externalBusy);
let active = true;
const baseName = (value) => value.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || value;

async function validate(value) {
  const selected = value.trim();
  if (!selected || !active) return;
  error.value = "";
  loading.value = true;
  try {
    const result = await openWorkspace(selected);
    if (result.ok && result.path && active) emit("pick", result.path);
    else error.value = result.error || "无法打开该工作目录";
  } catch (reason) {
    error.value = reason?.message || "工作目录校验失败";
  } finally { loading.value = false; }
}
async function browse() {
  error.value = "";
  loading.value = true;
  try {
    const selected = await pickFolderViaServer();
    if (selected) await validate(selected);
  } catch (reason) {
    error.value = reason?.message || "无法打开目录选择器";
  } finally { loading.value = false; }
}
function cancel() { if (!busy.value) emit("cancel"); }
function useTemp() { if (!busy.value) { error.value = ""; emit("temp"); } }
function keydown(event) { if (event.key === "Escape") { event.stopImmediatePropagation(); cancel(); } }
onMounted(async () => {
  window.addEventListener("keydown", keydown);
  try { recents.value = (await getRecentWorkspaces()).filter((item) => item.exists).slice(0, 4); } catch {}
});
onUnmounted(() => { active = false; window.removeEventListener("keydown", keydown); });
</script>

<template>
  <div class="folder-overlay" @click="cancel">
    <section class="folder-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-picker-title" @click.stop>
      <h2 id="workspace-picker-title">{{ personaName || t("该智能体") }}{{ t(" 要在哪里工作？") }}</h2>
      <p>{{ t("先选择工作目录，再描述并发送任务。") }}</p>
      <button v-for="item in recents" :key="item.path" class="recent-folder" :title="item.path" :disabled="busy" @click="validate(item.path)"><span>▰</span><strong>{{ item.name || baseName(item.path) }}</strong><small>{{ item.path }}</small></button>
      <div class="folder-actions"><button class="btn" :disabled="busy" @click="browse">{{ t("选择文件夹") }}</button><button class="btn primary" :disabled="busy" @click="useTemp">{{ t("使用临时文件夹") }}</button></div>
      <form class="manual-path" @submit.prevent="!busy && validate(path)"><input v-model="path" :disabled="busy" :placeholder="t(&quot;也可以输入绝对路径&quot;)" autofocus /><button class="btn" :disabled="busy || !path.trim()">{{ t("打开") }}</button></form>
      <div v-if="error || externalError" class="folder-error" role="alert">{{ error || externalError }}</div>
      <small class="folder-note">{{ t("临时文件夹适合一次性任务；需要保留成果时请选择项目目录。") }}</small>
      <button class="btn folder-cancel" :disabled="busy" @click="cancel">{{ t("取消") }}</button>
    </section>
  </div>
</template>
