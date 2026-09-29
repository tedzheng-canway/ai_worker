<script setup>
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
<template><section class="page-view wide-page"><div class="page-head"><h1>收件箱</h1><button class="btn" @click="load">刷新</button></div><div class="p2-tabs"><button v-for="row in [['pending','待处理'],['resolved','已处理'],['configure','路由配置']]" :key="row[0]" class="btn" :class="{primary:tab===row[0]}" @click="tab=row[0];load()">{{ row[1] }}</button></div><p v-if="error" class="error-text" role="alert">{{ error }}</p><InboxRouting v-if="tab==='configure'" @open-connectors="emit('open-connectors',$event)" /><template v-else><div class="actions"><label>类型<select v-model="kind" aria-label="类型"><option value="">全部</option><option value="approval">审批</option><option value="question">问题</option><option value="notification">通知</option><option value="directory">目录</option><option value="plan">计划</option><option value="tool">工具安装</option></select></label><label>会话<select v-model="session" aria-label="会话"><option value="">全部</option><option v-for="[id,title] in sessions" :key="id" :value="id">{{ title }}</option></select></label></div><InboxCard v-for="item in shown" :key="item.id" :item="item" @resolved="load" @open-session="emit('open-session',$event)" /><p v-if="!shown.length" class="empty-card">暂无{{ tab==='pending'?'待处理':'已处理' }}项目</p></template></section></template>
