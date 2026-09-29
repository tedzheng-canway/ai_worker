<script setup>
import { t } from '../i18n';
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { getInbox } from '../p2api';
import InboxCard from './InboxCard.vue';
import InboxRouting from './InboxRouting.vue';
const emit=defineEmits(['open-session','open-connectors','change']);const tab=ref('pending'),kind=ref(''),session=ref(''),items=ref([]),error=ref('');let timer,disposed=false,version=0;
const shown=computed(()=>items.value.filter(i=>(!kind.value||i.kind===kind.value)&&(!session.value||i.session_id===session.value)));
const sessions=computed(()=>[...new Map(items.value.map(i=>[i.session_id,i.session_title||i.session_id])).entries()]);
async function load(){const id=++version;try{const rows=await getInbox('',tab.value==='resolved'?'resolved':'pending');if(id===version){items.value=rows;error.value='';emit('change');}}catch(e){if(id===version)error.value=e.message;}}
async function poll(){if(tab.value!=='configure')await load();if(!disposed)timer=setTimeout(poll,4000);}
onMounted(poll);onBeforeUnmount(()=>{disposed=true;version++;clearTimeout(timer);});
</script>
<template><section class="page-view wide-page"><div class="page-head"><h1>{{ t("收件箱") }}</h1><button class="btn" @click="load">{{ t("刷新") }}</button></div><div class="p2-tabs"><button v-for="row in [['pending',t(&quot;待处理&quot;)],['resolved',t(&quot;已处理&quot;)],['configure',t(&quot;路由配置&quot;)]]" :key="row[0]" class="btn" :class="{primary:tab===row[0]}" @click="tab=row[0];load()">{{ t(row[1]) }}</button></div><p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><InboxRouting v-if="tab==='configure'" @open-connectors="emit('open-connectors',$event)" /><template v-else><div class="actions"><label>{{ t("类型") }}<select v-model="kind" :aria-label="t(&quot;类型&quot;)"><option value="">{{ t("全部") }}</option><option value="approval">{{ t("审批") }}</option><option value="question">{{ t("问题") }}</option><option value="notification">{{ t("通知") }}</option><option value="directory">{{ t("目录") }}</option><option value="plan">{{ t("计划") }}</option><option value="tool">{{ t("工具安装") }}</option></select></label><label>{{ t("会话") }}<select v-model="session" :aria-label="t(&quot;会话&quot;)"><option value="">{{ t("全部") }}</option><option v-for="[id,title] in sessions" :key="id" :value="id">{{ title }}</option></select></label></div><InboxCard v-for="item in shown" :key="item.id" :item="item" @resolved="load" @open-session="emit('open-session',$event)" /><p v-if="!shown.length" class="empty-card">{{ t("暂无") }}{{ tab==='pending'?t("待处理"):t("已处理") }}{{ t("项目") }}</p></template></section></template>
