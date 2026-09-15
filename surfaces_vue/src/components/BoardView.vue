<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { boardComment, boardTransition, getBoard, getBoardItem } from "../api";
const props = defineProps({ sessionId: { type: String, required: true } });
const board = ref(null);
const detail = ref(null);
const note = ref("");
const states = ["open", "in_progress", "blocked", "review", "done", "canceled"];
const labels = { open: "待处理", in_progress: "进行中", blocked: "受阻", review: "待审核", done: "已完成", canceled: "已取消" };
const groups = computed(() => states.map((state) => ({ state, items: board.value?.items?.filter((item) => item.state === state) || [] })).filter((group) => group.items.length));
async function refresh() { try { board.value = await getBoard(props.sessionId); } catch { board.value = { items: [] }; } }
async function openItem(id) { detail.value = await getBoardItem(props.sessionId, id); }
async function move(to) { await boardTransition(props.sessionId, detail.value.id, to); await refresh(); await openItem(detail.value.id); }
async function addNote() { if (!note.value.trim()) return; await boardComment(props.sessionId, detail.value.id, note.value.trim()); note.value = ""; await openItem(detail.value.id); }
watch(() => props.sessionId, () => { detail.value = null; refresh(); });
onMounted(refresh);
</script>

<template>
  <section class="page-view wide-page">
    <div class="page-head"><div><h1>任务看板</h1><p>{{ board?.name || '当前会话的团队任务与进度' }}</p></div><button class="btn" @click="refresh">刷新</button></div>
    <div class="board-layout">
      <div class="board-list">
        <section v-for="group in groups" :key="group.state" class="board-group"><h3><span :class="['state-dot', group.state]"></span>{{ labels[group.state] }} <small>{{ group.items.length }}</small></h3><button v-for="item in group.items" :key="item.id" :class="['board-item', { active: detail?.id === item.id }]" @click="openItem(item.id)"><span>#{{ item.id }}</span><strong>{{ item.title }}</strong><small>{{ item.assignee || '未分配' }}</small></button></section>
        <div v-if="!groups.length" class="empty-card">当前会话没有看板任务。</div>
      </div>
      <aside v-if="detail" class="card board-detail"><span class="eyebrow">#{{ detail.id }} · {{ labels[detail.state] || detail.state }}</span><h2>{{ detail.title }}</h2><p>{{ detail.description || '没有任务说明。' }}</p><div v-if="detail.criteria"><strong>验收标准</strong><p>{{ detail.criteria }}</p></div><div class="state-actions"><button v-for="state in states" :key="state" class="btn" :class="{ primary: detail.state === state }" @click="move(state)">{{ labels[state] }}</button></div><h3>时间线</h3><div class="timeline"><div v-for="(event, index) in detail.timeline || []" :key="index"><strong>{{ event.actor || event.kind }}</strong><small>{{ event.ts || '' }}</small><p>{{ event.body || event.note || event.to || event.kind }}</p></div></div><form class="note-form" @submit.prevent="addNote"><textarea v-model="note" rows="3" placeholder="添加评论或交接说明"></textarea><button class="btn primary">发送评论</button></form></aside>
    </div>
  </section>
</template>
