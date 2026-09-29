<script setup>
import { t } from '../i18n';
import { ref,watch,onBeforeUnmount } from 'vue';
import { boardAttachment } from '../board-attachments-api.js';
const props=defineProps({sessionId:String,reference:String});const url=ref(''),error=ref(''),isImage=ref(false);let version=0;
watch(()=>[props.sessionId,props.reference],async()=>{const id=++version;if(url.value)URL.revokeObjectURL(url.value);url.value='';error.value='';try{const name=props.reference.slice('attachment://'.length).split('#')[0];const blob=await boardAttachment(props.sessionId,name);if(id!==version)return;url.value=URL.createObjectURL(blob);isImage.value=blob.type.startsWith('image/');}catch(e){if(id===version)error.value=e.message;}},{immediate:true});onBeforeUnmount(()=>{version++;if(url.value)URL.revokeObjectURL(url.value);});
</script>
<template><div class="board-attachment"><img v-if="url && isImage" :src="url" alt="任务附件" /><a v-if="url" :href="url" :download="reference.split('#')[1] || reference.split('/').at(-1)">{{ t("下载 ") }}{{ reference.split('#')[1] || t("附件") }}</a><p v-if="error" class="error-text">{{ t(error) }}</p></div></template>
