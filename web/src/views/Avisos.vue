<script setup>
import { computed } from 'vue';
import { store, markSeen } from '../store.js';
import { parseDate, formatDateTime } from '../lib/dates.js';
import SubjectTag from '../components/SubjectTag.vue';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
const notes = computed(() => (store.manual?.notes ?? []).map((n, i) => ({ id: `note-${i}`, code: null, title: n.text, text: '', author: 'Bedel', date: n.date, url: null })));
const all = computed(() => [...notes.value, ...store.announcements].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));
</script>
<template>
  <h1 class="mb-3 text-2xl font-semibold tracking-tight">Avisos</h1>
  <Accordion type="single" collapsible @update:model-value="(v) => v && markSeen(v)">
    <Card
      v-for="a in all"
      :key="a.id"
      class="mb-2 gap-0 border-l-4 px-3 py-0"
      :class="store.seen.has(a.id) ? 'border-l-transparent' : 'border-l-primary'"
    >
      <AccordionItem :value="a.id" class="border-b-0">
        <AccordionTrigger class="hover:no-underline">
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-2.5">
              <SubjectTag v-if="a.code" :code="a.code" />
              <b class="min-w-0 flex-1 truncate text-left">{{ a.title }}</b>
            </span>
            <span class="mt-0.5 block text-xs font-normal text-muted-foreground">
              {{ a.author }}, {{ a.date ? formatDateTime(parseDate(a.date)) : '' }}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <p class="whitespace-pre-wrap">{{ a.text }}</p>
          <a v-if="a.url" :href="a.url" target="_blank" rel="noopener" class="text-primary underline-offset-4 hover:underline">Ver en Aules ↗</a>
        </AccordionContent>
      </AccordionItem>
    </Card>
  </Accordion>
  <p v-if="!all.length" class="text-sm text-muted-foreground">No hay avisos.</p>
</template>
