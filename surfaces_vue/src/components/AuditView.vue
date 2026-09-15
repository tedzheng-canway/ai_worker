<script setup>
import { onMounted, ref } from "vue";
import { getAudit } from "../api";
const events = ref([]);
const filters = ref({ session_id: "", connector: "", tool: "" });
const loading = ref(false);
async function refresh() {
  loading.value = true;
  try { events.value = await getAudit({ limit: 150, ...filters.value }); } finally { loading.value = false; }
}
onMounted(refresh);
</script>

<template>
  <section class="page-view wide-page">
    <div class="page-head"><div><h1>活动审计</h1><p>查看连接器、浏览器与工具的调用历史。</p></div><button class="btn" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button></div>
    <form class="filter-bar" @submit.prevent="refresh"><input v-model="filters.session_id" placeholder="会话 ID" /><input v-model="filters.connector" placeholder="连接器" /><input v-model="filters.tool" placeholder="工具" /><button class="btn primary">筛选</button></form>
    <div v-if="events.length" class="card-list"><article v-for="event in events" :key="event.id" class="card audit-row"><div class="audit-head"><strong>{{ event.tool || '事件' }}</strong><span :class="['status-pill', event.status]">{{ event.status || event.stage }}</span></div><small>{{ event.connector || '工具' }} · {{ event.timestamp }} · 会话 {{ event.session_id || '-' }}</small><p v-if="event.resource">资源：{{ event.resource }}</p><pre v-if="event.args && Object.keys(event.args).length">{{ JSON.stringify(event.args, null, 2) }}</pre><p v-if="event.reason || event.result_preview">{{ event.reason || event.result_preview }}</p></article></div>
    <div v-else class="empty-card">没有匹配的活动记录。</div>
  </section>
</template>
