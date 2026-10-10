<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  options: { type: Array, default: () => [] },
  icon: { type: String, default: "◇" },
  label: { type: String, default: "选择" },
  wide: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);
const root = ref(null);
const open = ref(false);
const activeIndex = ref(0);
const current = computed(() => props.options.find((option) => option.value === props.modelValue));
const ordered = computed(() => {
  const groups = [...new Set(props.options.map(option => option.group || ''))];
  return groups.flatMap(group => props.options.filter(option => (option.group || '') === group));
});

function show() {
  if (props.disabled) return;
  open.value = !open.value;
  const index = ordered.value.findIndex((option) => option.value === props.modelValue);
  activeIndex.value = index < 0 ? 0 : index;
}
function choose(option) {
  if (props.disabled || option.disabled) return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
  open.value = false;
}
function keydown(event) {
  if (props.disabled || !ordered.value.length) return;
  if (!open.value && ["Enter", " ", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    open.value = true;
    return;
  }
  if (!open.value) return;
  if (event.key === "Escape") open.value = false;
  if (event.key === "ArrowDown") activeIndex.value = (activeIndex.value + 1) % ordered.value.length;
  if (event.key === "ArrowUp") activeIndex.value = (activeIndex.value - 1 + ordered.value.length) % ordered.value.length;
  if (event.key === "Enter" && ordered.value[activeIndex.value]) choose(ordered.value[activeIndex.value]);
  if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.preventDefault();
}
function outside(event) { if (!root.value?.contains(event.target)) open.value = false; }
onMounted(() => document.addEventListener("pointerdown", outside));
onUnmounted(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <div ref="root" :class="['select-menu', { open, wide }]" @keydown="keydown">
    <button type="button" class="select-trigger" :disabled="disabled" :aria-label="label" :aria-expanded="open" @click="show">
      <span class="select-icon">{{ icon }}</span>
      <span class="select-value">{{ current?.label || label }}</span>
      <span class="select-arrow">⌄</span>
    </button>
    <div v-if="open" class="select-popover" role="listbox">
      <template v-for="(option, index) in ordered" :key="option.value">
      <div v-if="option.group && (index === 0 || ordered[index-1].group !== option.group)" class="model-group-label" role="presentation">{{ option.group }}</div>
      <button type="button" :disabled="option.disabled" :class="['select-option', { selected: option.value === modelValue, focused: index === activeIndex }]" role="option" :aria-selected="option.value === modelValue" @mouseenter="activeIndex = index" @click="choose(option)">
        <span><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
        <span v-if="option.value === modelValue" class="select-check">✓</span>
      </button>
      </template>
    </div>
  </div>
</template>
