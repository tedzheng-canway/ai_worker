<script setup>
import { PROVIDER_LOGOS } from '../providers/catalog';
defineProps({ name: String, title: String, large: Boolean });
</script>
<template><span class="provider-mark" :class="{ large }"><img v-if="PROVIDER_LOGOS[name]" :src="PROVIDER_LOGOS[name]" alt="" /><span v-else>{{ title?.[0] || '?' }}</span></span></template>
