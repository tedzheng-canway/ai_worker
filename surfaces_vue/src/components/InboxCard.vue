<script setup>
import { t } from '../i18n';
import { computed, ref } from 'vue';
import QuestionPrompt from './QuestionPrompt.vue';
import ApprovalPrompt from './ApprovalPrompt.vue';
import MarkdownView from './MarkdownView.vue';
import { checked } from '../api-result.js';
import { resolveInboxItem } from '../inbox-api.js';
import { parkedPrompt, parkedResolution } from '../inbox-prompts.js';
import { resolutionLabel } from '../question-answers.js';
const props=defineProps({item:Object,inline:Boolean,liveItem:Object,autoApprove:Boolean});const emit=defineEmits(['resolved','open-session']);
const busy=ref(false),error=ref(''),resolved=ref(false);const prompt=computed(()=>parkedPrompt(props.item,props.liveItem));
const question = ref(null), localResolution = ref('');
defineExpose({ answerText(value) { return !busy.value && !resolved.value && question.value?.answerText(value); } });
async function resolve(value){if(busy.value||resolved.value)return;busy.value=true;error.value='';try{checked(await resolveInboxItem(props.item.id,value));resolved.value=true;localResolution.value=value;emit('resolved',{...props.item,resolution:value});}catch(e){error.value=e.message;emit('resolved',null);}finally{busy.value=false;}}
</script>
<template><article class="card inbox-card"><header><strong>{{ item.title }}</strong><small>{{ item.kind }} · {{ item.session_title || item.session_id }} · {{ item.created_at }}</small><button v-if="!inline && item.session_exists!==false" class="btn" @click="emit('open-session',{session_id:item.session_id,workspace:item.session_workspace,agent:item.session_agent})">{{ t("打开所属会话") }}</button></header><p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><template v-if="item.state==='resolved'||resolved"><MarkdownView :text="item.body" /><p class="muted">{{ t("已处理：") }}{{ resolutionLabel(localResolution || item.resolution,t) }}</p></template><fieldset v-else :disabled="busy"><QuestionPrompt ref="question" v-if="item.kind==='question'" :item="prompt" @answer="resolve(String($event))" /><ApprovalPrompt v-else-if="['directory','plan','tool'].includes(item.kind) || (inline && item.kind==='approval' && (item.data?.tool || liveItem?.name))" :item="prompt" :run-task="!!item.data?.task_id" :auto-approve="autoApprove" @resolve="resolve(parkedResolution(item,$event,prompt.kind))" /><template v-else><MarkdownView :text="item.body" /><details v-if="item.data?.arguments"><summary>{{ t("操作详情") }}</summary><pre>{{ JSON.stringify(item.data.arguments,null,2) }}</pre></details><div class="actions"><template v-if="item.kind==='approval'"><button class="btn primary" @click="resolve('allow')">{{ t("允许一次") }}</button><button v-if="item.data?.task_id && item.data?.standing_target" class="btn" @click="resolve('always_task')">{{ t("此自动化每次允许 ") }}{{ item.data.standing_target }}</button><button class="btn" @click="resolve('deny')">{{ t("拒绝") }}</button></template><button v-else class="btn" @click="resolve('seen')">{{ t("标为已读") }}</button></div></template></fieldset></article></template>
