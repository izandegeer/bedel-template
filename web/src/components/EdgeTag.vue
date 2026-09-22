<script setup>
import { subject } from '../store.js';
defineProps({ code: String });
</script>
<template>
  <div
    class="flex w-12 shrink-0 items-center justify-center self-stretch text-[11px] font-bold text-white"
    :style="{ backgroundColor: subject(code).color }"
  >
    {{ code }}
  </div>
</template>
