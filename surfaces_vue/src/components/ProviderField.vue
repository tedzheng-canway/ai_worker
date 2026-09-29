<script setup>
import { t } from '../i18n';
defineProps({ field: Object, modelValue: String, saved: Boolean, savedLabel: String, testable: Boolean, testing: Boolean, canTest: Boolean, testLabel: String, credentialed: Boolean });
const emit = defineEmits(['update:modelValue', 'blur', 'test']);
</script>
<template>
  <div class="provider-field">
    <label :for="`provider-field-${field.key}`">{{ field.label || field.key }}</label>
    <div class="provider-field-line"><div class="provider-input-wrap">
      <input :id="`provider-field-${field.key}`" :value="modelValue || ''" :type="field.secret ? 'password' : 'text'" :class="{ saved }" :placeholder="field.secret && credentialed ? '••••••••' : field.placeholder" autocomplete="off" spellcheck="false" @input="emit('update:modelValue',$event.target.value)" @blur="emit('blur',$event)" />
      <span v-if="saved" class="provider-saved-pill">{{ savedLabel || t('✓ 已保存') }}</span>
    </div><button v-if="testable" type="button" class="btn provider-test" data-provider-test :disabled="testing || !canTest" @click="emit('test')">{{ testing ? '…' : testLabel }}</button></div>
    <p v-if="field.help" class="provider-help">{{ field.help }}</p>
  </div>
</template>
