<script setup>
import { t } from '../i18n';
import { computed, ref, watch } from "vue";
import { SKIP_SENTINEL, questionKey, skipRemaining } from '../question-answers.js';

const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(["answer"]);
const step = ref(0);
const answers = ref({});
const selected = ref([]);
const text = ref("");

const specs = computed(() => {
  if (props.item.questions?.length) {
    return props.item.questions.map((question) => ({
      header: question.header || "",
      question: question.question || "请选择",
      options: question.options || [],
      allowText: question.allow_text !== false,
      multi: !!question.multi,
    }));
  }
  return [{
    header: props.item.header || "",
    question: props.item.text || "请选择",
    options: props.item.options || [],
    allowText: props.item.allowText !== false,
    multi: !!props.item.multi,
  }];
});
const spec = computed(() => specs.value[Math.min(step.value, specs.value.length - 1)]);
const grouped = computed(() => specs.value.length > 1 || !!props.item.questions?.length);
const optionLabel = (option) => typeof option === "string" ? option : option.label || "";
const optionDescription = (option) => typeof option === "string" ? "" : option.description || "";
const recommended = (option) => typeof option === "object" && !!option.recommended;
const keyFor = questionKey;

function submit(answer) {
  const value = answer.trim();
  if (!value) return false;
  if (!grouped.value) { emit("answer", value); return true; }
  answers.value = { ...answers.value, [keyFor(spec.value)]: value };
  if (step.value + 1 < specs.value.length) step.value += 1;
  else emit("answer", JSON.stringify(answers.value));
  return true;
}
function pick(option) {
  const label = optionLabel(option);
  if (!spec.value.multi) return submit(label);
  selected.value = selected.value.includes(label) ? selected.value.filter((item) => item !== label) : [...selected.value, label];
}
function submitSelected() { submit(selected.value.join(", ")); }
function submitText() { submit(text.value); }
function previous() { if (step.value > 0) step.value -= 1; }
function skip() { submit(SKIP_SENTINEL); }
function skipAll() { emit('answer', grouped.value ? JSON.stringify(skipRemaining(specs.value, answers.value)) : SKIP_SENTINEL); }
watch(step, () => {
  const saved = answers.value[keyFor(spec.value)];
  selected.value = saved && saved !== SKIP_SENTINEL ? spec.value.options.map(optionLabel).filter(label => saved.split(', ').includes(label)) : [];
  text.value = saved && saved !== SKIP_SENTINEL ? saved : '';
});
defineExpose({ answerText: submit });
</script>

<template>
  <section class="question-prompt">
    <div class="question-step">
      <button v-if="grouped && step > 0" :title="t(&quot;上一题&quot;)" @click="previous">‹</button>
      <strong>{{ spec.header || t("问题") }}</strong>
      <span v-if="grouped">{{ step + 1 }} / {{ specs.length }}</span>
      <span v-if="grouped && step + 1 < specs.length">{{ t("下一项：") }}{{ specs[step + 1].header || (t("问题 ") + (step + 2)) }}</span>
    </div>
    <h3>{{ spec.question }}</h3>
    <div v-if="spec.options.length" class="question-options">
      <button v-for="(option, index) in spec.options" :key="`${optionLabel(option)}-${index}`" :class="{ selected: selected.includes(optionLabel(option)) }" @click="pick(option)">
        <span class="option-title"><span v-if="spec.multi && selected.includes(optionLabel(option))">✓</span>{{ optionLabel(option) }}<em v-if="recommended(option)">{{ t("推荐") }}</em></span>
        <small v-if="optionDescription(option)">{{ optionDescription(option) }}</small>
      </button>
    </div>
    <button v-if="spec.multi && spec.options.length" class="btn primary question-submit" :disabled="!selected.length" @click="submitSelected">{{ t("提交所选内容") }}</button>
    <form v-if="spec.allowText || !spec.options.length" class="question-text" @submit.prevent="submitText">
      <input v-model="text" :placeholder="spec.options.length ? t(&quot;也可以输入自己的回答&quot;) : t(&quot;请输入回答&quot;)" autofocus />
      <button class="btn primary" :disabled="!text.trim()">{{ t("发送") }}</button>
    </form>
    <div class="question-skip actions">
      <button type="button" class="btn" @click="skip">{{ t('跳过此题') }}</button>
      <button v-if="grouped && step + 1 < specs.length" type="button" class="btn" @click="skipAll">{{ t('跳过剩余问题') }}</button>
    </div>
  </section>
</template>
