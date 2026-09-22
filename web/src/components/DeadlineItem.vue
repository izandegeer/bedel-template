<script setup>
import SubjectTag from './SubjectTag.vue';
import EdgeTag from './EdgeTag.vue';
import { formatDateTime, daysUntil } from '../lib/dates.js';
import { Card } from '@/components/ui/card';
const props = defineProps({ d: Object, edge: Boolean });
function countdown() {
  if (!props.d.due) return 'sin fecha';
  const n = daysUntil(props.d.due);
  if (n < 0) return 'vencida';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  return `${n} d`;
}
function urgent() { return props.d.due && (props.d.due - Date.now()) < 48 * 3600 * 1000; }
</script>
<template>
  <Card
    class="mb-2 flex-row items-center gap-2.5"
    :class="[{ 'opacity-55': d.done }, edge ? 'overflow-hidden py-0 pr-3' : 'px-3 py-2.5']"
  >
    <EdgeTag v-if="edge" :code="d.code" />
    <SubjectTag v-else :code="d.code" />
    <div class="min-w-0 flex-1" :class="edge ? 'py-2.5' : ''">
      <div class="truncate">
        <a
          v-if="d.url"
          :href="d.url"
          target="_blank"
          rel="noopener"
          class="text-primary underline-offset-4 hover:underline"
        >{{ d.title }}</a>
        <span v-else>{{ d.title }}</span>
      </div>
      <div class="text-xs text-muted-foreground">
        <span v-if="d.due">{{ formatDateTime(d.due) }}</span>
        <span v-if="d.source === 'manual'">, manual</span>
        <span v-if="d.submitted">, entregada</span>
        <span v-else-if="d.done">, hecha</span>
      </div>
    </div>
    <div
      class="shrink-0 font-bold tabular-nums whitespace-nowrap"
      :class="urgent() && !d.done ? 'text-destructive' : ''"
    >{{ d.done ? '✓' : countdown() }}</div>
  </Card>
</template>
