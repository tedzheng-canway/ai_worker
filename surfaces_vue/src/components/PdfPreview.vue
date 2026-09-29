<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
const props = defineProps({ dataUrl: String });
const canvas = ref(null), page = ref(1), pages = ref(0), scale = ref(1), error = ref('');
let documentTask, pdf, renderTask, generation = 0, renderGeneration = 0;
async function render() {
  if (!pdf || !canvas.value) return;
  const current = generation;
  const draw = ++renderGeneration;
  if (renderTask) { renderTask.cancel(); try { await renderTask.promise; } catch {} }
  try {
    const entry = await pdf.getPage(page.value);
    if (current !== generation || draw !== renderGeneration) return;
    const viewport = entry.getViewport({ scale: scale.value });
    canvas.value.width = viewport.width; canvas.value.height = viewport.height;
    renderTask = entry.render({ canvasContext: canvas.value.getContext('2d'), viewport });
    await renderTask.promise;
  } catch (err) { if (current === generation && draw === renderGeneration && err.name !== 'RenderingCancelledException') error.value = err.message; }
}
watch(() => props.dataUrl, async (url) => {
  const current = ++generation;
  renderTask?.cancel(); await documentTask?.destroy(); pdf = null; pages.value = 0; error.value = '';
  if (!url || current !== generation) return;
  try {
    documentTask = getDocument({ data: Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0)), isEvalSupported: false });
    const loaded = await documentTask.promise;
    if (current !== generation) return;
    pdf = loaded; pages.value = pdf.numPages; page.value = 1; await nextTick(); await render();
  } catch (err) { if (current === generation) error.value = err.message; }
}, { immediate: true });
watch([page, scale], render);
onBeforeUnmount(() => { generation++; renderTask?.cancel(); documentTask?.destroy(); });
</script>
<template><div class="pdf-preview"><div class="actions"><button class="btn" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button class="btn" :disabled="page >= pages" @click="page++">下一页</button><select v-model.number="scale" aria-label="PDF 缩放"><option :value="0.75">75%</option><option :value="1">100%</option><option :value="1.5">150%</option></select></div><p class="error-text">{{ error }}</p><canvas ref="canvas"></canvas></div></template>
