<script setup>
import { computed } from 'vue';
import { renderMarkdown } from '../markdown';
const props = defineProps({ text: String });
const html = computed(() => renderMarkdown(props.text));
function follow(event) {
  const link = event.target.closest('a[data-local-link]');
  if (!link) return;
  event.preventDefault();
  const value = link.dataset.localLink;
  const type = value.slice(0, value.indexOf(':')).toLowerCase();
  let path = value.slice(value.indexOf(':') + 1);
  try { path = decodeURIComponent(path); } catch {}
  window.dispatchEvent(new CustomEvent(type === 'artifact' ? 'ocw-open-artifact' : 'ocw-open-board', { detail: { path } }));
}
</script>
<template><div class="markdown-body" @click="follow" v-html="html"></div></template>
