<script setup>
import { t } from '../i18n';
import { onMounted, onUnmounted, ref } from "vue";
import { getRecentWorkspaces, openWorkspace, pickFolderViaServer } from "../api";

const props = defineProps({ personaName: String, externalError: String });
const emit = defineEmits(["pick", "temp", "cancel"]);
const recents = ref([]);
const path = ref("");
const error = ref("");
const busy = ref(false);
const baseName = (value) => value.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || value;

async function validate(value) {
  const selected = value.trim();
  if (!selected) return;
  error.value = "";
  busy.value = true;
  try {
    const result = await openWorkspace(selected);
    if (result.ok) emit("pick", result.path);
    else error.value = result.error || "无法打开该工作目录";
  } catch (reason) {
    error.value = reason?.message || "工作目录校验失败";
  } finally { busy.value = false; }
}
async function browse() {
  error.value = "";
  busy.value = true;
  try {
    const selected = await pickFolderViaServer();
    if (selected) await validate(selected);
  } catch (reason) {
    error.value = reason?.message || "无法打开目录选择器";
  } finally { busy.value = false; }
}
function keydown(event) { if (event.key === "Escape") emit("cancel"); }
onMounted(async () => {
  window.addEventListener("keydown", keydown);
  try { recents.value = (await getRecentWorkspaces()).filter((item) => item.exists).slice(0, 4); } catch {}
});
onUnmounted(() => window.removeEventListener("keydown", keydown));
</script>

<template>
  <div class="folder-overlay" @click="emit('cancel')">
    <section class="folder-dialog" @click.stop>
      <h2>{{ personaName || t("该智能体") }}{{ t(" 要在哪里工作？") }}</h2>
      <p>{{ t("选择一个项目目录后，将自动发送刚才的任务。") }}</p>
      <button v-for="item in recents" :key="item.path" class="recent-folder" :title="item.path" :disabled="busy" @click="validate(item.path)"><span>▰</span><strong>{{ item.name || baseName(item.path) }}</strong><small>{{ item.path }}</small></button>
      <div class="folder-actions"><button class="btn" :disabled="busy" @click="browse">{{ t("选择文件夹") }}</button><button class="btn primary" :disabled="busy" @click="emit('temp')">{{ t("使用临时文件夹") }}</button></div>
      <form class="manual-path" @submit.prevent="validate(path)"><input v-model="path" :placeholder="t(&quot;也可以输入绝对路径&quot;)" /><button class="btn" :disabled="busy || !path.trim()">{{ t("打开") }}</button></form>
      <div v-if="error || externalError" class="folder-error">{{ error || externalError }}</div>
      <small class="folder-note">{{ t("临时文件夹适合一次性任务；需要保留成果时请选择项目目录。") }}</small>
    </section>
  </div>
</template>
