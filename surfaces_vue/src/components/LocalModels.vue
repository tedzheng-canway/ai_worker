<script setup>
import { ref, watch } from 'vue';
import { t } from '../i18n';
import { checked } from '../api-result.js';
import { addModel } from '../api.js';
import { getLocalModels, getSystemFacts } from '../providers-api.js';
const props = defineProps({ provider: String });
const emit = defineEmits(['change']);
const facts = ref(null), rows = ref([]), busy = ref(false), error = ref(''), alive = ref(null);
let version = 0;
const size = value => value ? (value / 1024 ** 3).toFixed(1) + ' GiB' : t('未知');
const capability = value => value === true ? t('支持') : value === false ? t('不支持') : t('未知');
const fitLabel = fit => t(({runs_well:'可顺畅运行',tight:'内存紧张',too_large:'模型可能超出内存',cloud:'远端模型',unknown:'内存需求未知'})[fit] || '内存需求未知');
async function refresh() {
  const request = ++version; busy.value = true; error.value = '';
  try {
    const [system, listing] = await Promise.all([getSystemFacts(), getLocalModels(props.provider)]);
    if (request !== version) return;
    facts.value = checked(system); checked(listing); rows.value = listing.models || []; alive.value = listing.alive;
    if (listing.alive === false) error.value = '本地模型服务不可达，请启动服务后重试。';
  } catch (e) { if (request === version) error.value = e.message; }
  finally { if (request === version) busy.value = false; }
}
async function include(row) { try { checked(await addModel(row.model)); emit('change'); } catch (e) { error.value = e.message; } }
watch(() => props.provider, refresh, {immediate:true});
</script>
<template>
  <section class="local-models" data-testid="local-models">
    <header><h3>{{ t('本机资源与模型状态') }}</h3><button type="button" class="btn" :disabled="busy" @click="refresh">{{ busy ? t('加载中…') : t('刷新模型状态') }}</button></header>
    <p v-if="facts" class="muted">{{ facts.processor }} · {{ t('内存') }} {{ size(facts.memory_bytes) }} · {{ t('显存') }} {{ size(facts.gpu_memory_bytes) }}<br />{{ facts.graphics }}</p>
    <p v-if="provider === 'llamacpp'" class="muted">{{ t('默认地址 http://localhost:8080。使用 llama-server 启动；工具调用需要支持工具的 Jinja 模板。上下文由启动参数固定。') }}</p>
    <p v-if="provider === 'vllm'" class="muted">{{ t('默认地址 http://localhost:8000。使用 vllm serve 启动；工具调用需要 --enable-auto-tool-choice 和 --tool-call-parser。上下文由启动参数固定。') }}</p>
    <p v-if="provider === 'ollama'" class="muted">{{ t('默认地址 http://localhost:11434。已安装模型会自动出现在选择器中；上下文通过原生 num_ctx 设置。') }}</p>
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
    <p v-else-if="!busy && alive && !rows.length" class="muted">{{ t('服务已连接，尚未发现模型。') }}</p>
    <article v-for="row in rows" :key="row.model" class="local-model-row">
      <strong>{{ row.name }}</strong><small>{{ size(row.size_bytes) }} · {{ fitLabel(row.fit) }}</small>
      <small>{{ t('上下文') }} {{ row.context || t('未知') }} / {{ row.context_max || t('未知') }} · {{ t('工具调用') }}: {{ capability(row.tools) }} · {{ t('思考') }}: {{ capability(row.thinking) }}</small>
      <p v-if="row.tools === false" class="error-text">{{ t('此模型或服务未启用工具调用，无法执行智能体任务。') }}</p>
      <p v-if="row.inference_ready === false" class="error-text">{{ t('模型列表可达，但推理路由不可用。请检查服务地址和启动参数。') }}</p>
      <button type="button" class="btn" :disabled="row.tools === false || row.inference_ready === false" @click="include(row)">{{ t('添加到模型选择器') }}</button>
    </article>
  </section>
</template>
