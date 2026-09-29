<script setup>
import { t } from '../i18n';
import { onMounted, ref } from "vue";
import { getAudit } from "../api";
const events = ref([]);
const filters = ref({ session_id: "", connector: "", tool: "" });
const loading = ref(false), error = ref('');
let version=0;
async function refresh() {
  const current=++version; loading.value = true; error.value='';
  try { const rows=await getAudit({ limit: 150, ...filters.value }); if(current===version)events.value=rows; } catch(e) { if(current===version)error.value=e.message; } finally { if(current===version)loading.value=false; }
}
onMounted(refresh);
</script>

<template>
  <section class="page-view wide-page">
    <div class="page-head"><div><h1>{{ t("活动审计") }}</h1><p>{{ t("查看连接器、浏览器与工具的调用历史。") }}</p></div><button class="btn" @click="refresh">{{ loading ? t("刷新中…") : t("刷新") }}</button></div>
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><form class="filter-bar" @submit.prevent="refresh"><input v-model="filters.session_id" :placeholder="t(&quot;会话 ID&quot;)" /><input v-model="filters.connector" :placeholder="t(&quot;连接器&quot;)" /><input v-model="filters.tool" :placeholder="t(&quot;工具&quot;)" /><button class="btn primary">{{ t("筛选") }}</button></form>
    <div v-if="events.length" class="card-list"><article v-for="event in events" :key="event.id" class="card audit-row"><div class="audit-head"><strong>{{ event.tool || t("事件") }}</strong><span :class="['status-pill', event.status]">{{ event.status || event.stage }}</span></div><small>{{ event.connector || t("工具") }} · {{ event.timestamp }}{{ t(" · 会话 ") }}{{ event.session_id || '-' }}</small><p v-if="event.approval">{{ t("审批：") }}{{ event.approval }}</p><p v-if="event.stage">{{ t("阶段：") }}{{ event.stage }}</p><p v-if="event.resource">{{ t("资源：") }}{{ event.resource }}</p><pre v-if="event.args && Object.keys(event.args).length">{{ JSON.stringify(event.args, null, 2) }}</pre><p v-if="event.reason || event.result_preview">{{ event.reason || event.result_preview }}</p></article></div>
    <div v-else class="empty-card">{{ t("没有匹配的活动记录。") }}</div>
  </section>
</template>
