<script setup>
import { subject } from '../store.js';
import { Badge } from '@/components/ui/badge';
defineProps({ code: String });
</script>
<template>
  <Badge class="shrink-0 rounded-sm font-bold text-white" :style="{ backgroundColor: subject(code).color }">
    {{ code }}
  </Badge>
</template>
