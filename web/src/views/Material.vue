<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { agendaAt } from '../lib/agenda.js';
import { useNow } from '../lib/clock.js';
import { Badge } from '@/components/ui/badge';
import { store, subject } from '../store.js';
import EdgeTag from '../components/EdgeTag.vue';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
const codes = computed(() => Object.keys(store.timetable?.subjects ?? {}));
/** Profesor de la asignatura según el horario, y sesiones semanales oficiales. */
function teacher(code) {
  const tt = store.timetable;
  const ini = tt?.classes?.find((c) => c.code === code)?.teacher;
  return (ini && tt?.teachers?.[ini]) || '';
}
function weekly(code) { return store.modules?.modules?.[code]?.weekly ?? null; }
function meta(code) {
  const parts = [teacher(code), weekly(code) ? `${weekly(code)} h/semana` : ''].filter(Boolean);
  return parts.join(', ');
}
const now = useNow();
/** Código de la asignatura cuya clase está en curso ahora mismo. */
const currentCode = computed(() => (store.timetable ? agendaAt(store.timetable, now.value).current?.code ?? null : null));
/** Asignatura abierta; `?open=DIG` la abre al cargar (enlace directo). */
const route = useRoute();
const open = ref(String(route.query.open ?? ''));
function links(code) { return store.links?.[code] ?? []; }
function resources(code) { return store.resources.filter((r) => r.code === code); }
function courseUrl(code) { return store.courses.find((c) => c.code === code)?.url; }
import { FileText, Link as LinkIcon, Folder, ExternalLink, StickyNote, ClipboardList, ListChecks } from '@lucide/vue';
const kindIcon = (k) => (k === 'url' ? LinkIcon : k === 'folder' ? Folder : k === 'page' ? StickyNote : k === 'assign' ? ClipboardList : k === 'quiz' ? ListChecks : FileText);
/** Recursos de una asignatura agrupados por tema (sección de Aules), en orden de aparición. */
function sections(code) {
  const groups = new Map();
  for (const r of resources(code)) {
    const key = r.section || 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}
</script>
<template>
  <h1 class="mb-3 text-2xl font-semibold tracking-tight">Material</h1>
  <Accordion v-model="open" type="single" collapsible class="space-y-2">
    <AccordionItem v-for="c in codes" :key="c" :value="c" class="flex overflow-hidden rounded-md border-b-0 bg-muted/40" :class="c === currentCode ? 'ring-2 ring-primary' : ''">
      <EdgeTag :code="c" />
      <div class="min-w-0 flex-1 px-3">
        <AccordionTrigger class="hover:no-underline">
          <span class="flex w-full min-w-0 items-center gap-2.5">
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate">{{ subject(c).name }}</span>
              <span class="block truncate text-xs font-normal text-muted-foreground">{{ meta(c) }}</span>
            </span>
            <Badge v-if="c === currentCode" class="mr-2 rounded-sm">Ahora</Badge>
            <span class="mr-2 text-xs text-muted-foreground">{{ resources(c).length + links(c).length }}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent class="pb-3 [&_a]:no-underline">
          <div class="mb-2 flex flex-wrap gap-2">
            <a v-if="courseUrl(c)" :href="courseUrl(c)" target="_blank" rel="noopener"
               class="inline-flex items-center gap-1 rounded-md bg-background px-2.5 py-1 text-xs font-medium hover:bg-background/70">
              <ExternalLink class="size-3.5" /> Curso en Aules
            </a>
            <a v-for="l in links(c)" :key="l.url" :href="l.url" target="_blank" rel="noopener"
               class="inline-flex items-center gap-1 rounded-md bg-background px-2.5 py-1 text-xs font-medium hover:bg-background/70">
              <LinkIcon class="size-3.5" /> {{ l.title }}
            </a>
          </div>

          <div v-for="sec in sections(c)" :key="sec.title" class="mb-3 last:mb-0">
            <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ sec.title }}</h3>
            <div class="space-y-1">
              <a v-for="r in sec.items" :key="r.id" :href="r.url" target="_blank" rel="noopener"
                 class="flex items-center gap-2.5 rounded-md bg-background px-3 py-2 text-sm hover:bg-background/70">
                <component :is="kindIcon(r.kind)" class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate">{{ r.title }}</span>
              </a>
            </div>
          </div>

          <p v-if="!resources(c).length && !links(c).length" class="text-sm text-muted-foreground">Sin material todavía.</p>
        </AccordionContent>
      </div>
    </AccordionItem>
  </Accordion>
</template>
