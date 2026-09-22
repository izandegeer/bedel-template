<script setup>
import { globalReport } from '../lib/absences.js';
import { computed } from 'vue';
import { store, manualEventsOn, subject, markResSeen } from '../store.js';
import { agendaAt, blocksOn } from '../lib/agenda.js';
import { pending } from '../lib/deadlines.js';
import { formatTime, formatDay, daysUntil, parseDate, madridParts } from '../lib/dates.js';
import EdgeTag from '../components/EdgeTag.vue';
import DeadlineItem from '../components/DeadlineItem.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useNow } from '../lib/clock.js';
import { nowPosition } from '../lib/nowline.js';
const now = useNow();
const agenda = computed(() => agendaAt(store.timetable, now.value));
const todayBlocks = computed(() => blocksOn(store.timetable, now.value));
/** Bloques del día con separadores de descanso (huecos de 15 min o más). */
const todayRows = computed(() => {
  const out = [];
  todayBlocks.value.forEach((b, i) => {
    const prev = todayBlocks.value[i - 1];
    if (prev && (b.start - prev.end) >= 15 * 60000) {
      out.push({ kind: 'break', id: `break-${i}`, label: `Descanso, ${formatTime(prev.end)}-${formatTime(b.start)}` });
    }
    out.push({ kind: 'block', id: b.id, b });
  });
  return out;
});
const status = (b) => (now.value >= b.start && now.value < b.end ? 'now' : b.start > now.value ? 'next' : 'past');
const soon = computed(() => pending(store.deadlines, now.value).filter((d) => d.due - now.value < 7 * 86400000));
const events = computed(() => manualEventsOn(now.value));

/* --- Tiempo transcurrido sobre el horario de hoy --- */
const nowAt = computed(() => nowPosition(todayBlocks.value, now.value));
/** Índice del bloque en curso, o -1. */
const nowBlock = computed(() => (nowAt.value.kind === 'in' ? nowAt.value.index : -1));
function pct(fraction) { return `${(fraction * 100).toFixed(3)}%`; }
const fresh = computed(() => store.announcements.filter((a) => !store.seen.has(a.id)).slice(0, 3));
const icon = (t) => (t === 'aula' ? '🚪' : t === 'examen' ? '📝' : '📌');
const risky = computed(() => {
  const g = globalReport(store.absenceReport, store.modules?.limitPercent ?? 15);
  const mods = store.absenceReport.filter((m) => m.level === 'danger' || m.level === 'lost');
  return g.level === 'danger' || g.level === 'lost' ? [{ ...g, code: 'Total' }, ...mods] : mods;
});
const todayKey = computed(() => { const p = madridParts(now.value); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; });
const global = computed(() => globalReport(store.absenceReport, store.modules?.limitPercent ?? 15));
const tightest = computed(() => store.absenceReport.find((m) => m.counted > 0) ?? null);
const exams = computed(() => (store.manual?.events ?? [])
  .filter((e) => e.type === 'examen' && e.date >= todayKey.value)
  .map((e) => ({ ...e, days: daysUntil(parseDate(e.date), now.value) }))
  .slice(0, 5));
/** Novedades sin ver: material nuevo, tareas nuevas y cambios de fecha de los últimos 7 días. */
const recent = computed(() => {
  const limit = now.value.getTime() - 7 * 86400000;
  const items = [];
  for (const r of store.resources) {
    if (r.modified && parseDate(r.modified)?.getTime() > limit && !store.seenRes.has(r.id)) {
      items.push({ key: r.id, kind: 'res', code: r.code, title: r.title, sub: r.section, url: r.url, when: r.modified });
    }
  }
  for (const c of store.changes ?? []) {
    const key = `${c.id}|${c.type}|${c.at}`;
    if (new Date(c.at).getTime() <= limit || store.seenRes.has(key)) continue;
    const url = store.deadlines.find((d) => d.id === c.id)?.url ?? null;
    if (c.type === 'due') {
      const f = c.from ? formatDay(parseDate(c.from)) : 'sin fecha';
      const t = c.to ? formatDay(parseDate(c.to)) : 'sin fecha';
      items.push({ key, kind: 'due', code: c.code, title: c.title, sub: `Cambio de fecha: ${f} pasa a ${t}`, url, when: c.at });
    } else {
      items.push({ key, kind: 'new', code: c.code, title: c.title, sub: c.due ? `Nueva tarea, ${formatDay(parseDate(c.due))}` : 'Nueva tarea', url, when: c.at });
    }
  }
  return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 10);
});
const countdown = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `${n} d`);
const percent = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
</script>
<template>
  <h1 class="mb-3 text-2xl font-semibold tracking-tight">Dashboard</h1>

  <Alert v-if="risky.length" variant="destructive" class="mb-3">
    <AlertDescription>
      <router-link to="/faltas" class="underline underline-offset-2">
        Faltas:
        <template v-for="(m, i) in risky" :key="m.code">
          <template v-if="i">, </template>{{ m.code }} al {{ percent(m.percent) }} %
          ({{ m.lost ? 'evaluación continua perdida' : `te quedan ${m.remaining} sesiones` }})
        </template>
      </router-link>
    </AlertDescription>
  </Alert>

  <Alert v-for="(e, i) in events" :key="i" class="mb-3 bg-primary text-primary-foreground">
    <AlertDescription class="font-semibold text-primary-foreground">
      {{ icon(e.type) }} {{ e.text }}
    </AlertDescription>
  </Alert>

  <div class="grid gap-4 md:grid-cols-2">
    <Card class="gap-2 px-4 py-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-semibold">Horario de hoy</h2>
        <span class="text-xs text-muted-foreground">{{ formatDay(now) }}</span>
      </div>
      <template v-if="todayBlocks.length">
        <template v-for="row in todayRows" :key="row.id">
          <div v-if="row.kind === 'break'" class="flex items-center gap-2 px-1 py-0.5">
            <span class="h-px flex-1 bg-border"></span>
            <span class="text-[11px] text-muted-foreground">{{ row.label }}</span>
            <span class="h-px flex-1 bg-border"></span>
          </div>
          <router-link
            v-else
            :to="{ name: 'material', query: { open: row.b.code } }"
            class="relative flex items-center gap-2.5 overflow-hidden rounded-md bg-muted/40 pr-3 hover:bg-accent"
            :class="status(row.b) === 'now' ? 'ring-2 ring-primary' : status(row.b) === 'past' ? 'opacity-50' : ''"
          >
            <EdgeTag :code="row.b.code" />
            <span class="relative z-10 w-24 shrink-0 py-2.5 text-sm tabular-nums text-muted-foreground">{{ formatTime(row.b.start) }}-{{ formatTime(row.b.end) }}</span>
            <div class="relative z-10 min-w-0 flex-1 py-2">
              <div class="truncate text-sm font-medium">{{ row.b.name }}</div>
              <div class="truncate text-xs text-muted-foreground">{{ row.b.teacher }}</div>
            </div>
            <Badge v-if="status(row.b) === 'now'" class="relative z-20 shrink-0 rounded-sm text-white" :style="{ backgroundColor: row.b.color }">Ahora</Badge>
            <div
              v-if="row.b.id === todayBlocks[nowBlock]?.id"
              class="pointer-events-none absolute inset-x-0 top-0 z-0 border-b border-foreground/15 bg-foreground/[0.035] dark:bg-foreground/[0.06]"
              :style="{ height: pct(nowAt.fraction) }"
            ></div>
          </router-link>
        </template>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">Hoy no hay clase.</p>
        <div v-if="agenda.next" class="flex items-start gap-2.5">
          <Badge class="mt-0.5 shrink-0 rounded-sm text-white" :style="{ backgroundColor: agenda.next.color }">{{ agenda.label }}</Badge>
          <div class="min-w-0 flex-1">
            <b>{{ agenda.next.name }}</b>
            <div class="text-xs text-muted-foreground">{{ formatTime(agenda.next.start) }}-{{ formatTime(agenda.next.end) }}, {{ agenda.next.teacher }}</div>
          </div>
        </div>
      </template>
    </Card>

    <Card class="gap-2 px-4 py-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-semibold">Tareas de la semana</h2>
        <router-link to="/entregas" class="text-xs text-primary underline-offset-4 hover:underline">Ver calendario</router-link>
      </div>
      <DeadlineItem v-for="d in soon" :key="d.id" :d="d" edge class="mb-0 rounded-md bg-muted/40 ring-0 shadow-none" />
      <p v-if="!soon.length" class="text-sm text-muted-foreground">Nada que entregar en 7 días.</p>
    </Card>

    <Card class="gap-2 px-4 py-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-semibold">Faltas</h2>
        <router-link to="/faltas" class="text-sm font-semibold tabular-nums" :class="{ 'text-emerald-600': global.level === 'ok', 'text-amber-600': global.level === 'warn', 'text-red-600': global.level === 'danger' || global.level === 'lost' }">{{ global.counted }} / {{ global.maxAllowed }}</router-link>
      </div>
      <div v-if="tightest" class="flex items-center gap-2 overflow-hidden rounded-md bg-muted/40 pr-3 text-sm">
        <EdgeTag :code="tightest.code" />
        <span class="min-w-0 flex-1 truncate py-2.5">{{ tightest.name }}</span>
        <span class="shrink-0 tabular-nums text-muted-foreground">{{ tightest.counted }} / {{ tightest.maxAllowed }}</span>
      </div>
      <p v-else class="text-sm text-muted-foreground">Sin faltas registradas.</p>
    </Card>

    <Card class="gap-2 px-4 py-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-semibold">Próximos exámenes</h2>
        <router-link to="/entregas" class="text-xs text-primary underline-offset-4 hover:underline">Calendario</router-link>
      </div>
      <div v-for="e in exams" :key="e.date + e.text" class="flex items-center gap-2 overflow-hidden rounded-md bg-muted/40 pr-3 text-sm">
        <EdgeTag v-if="e.code" :code="e.code" />
        <span class="min-w-0 flex-1 truncate py-2.5">{{ e.text }}</span>
        <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ e.date.slice(8, 10) }}/{{ e.date.slice(5, 7) }}</span>
        <span class="shrink-0 font-semibold tabular-nums" :class="e.days <= 2 ? 'text-red-600' : ''">{{ countdown(e.days) }}</span>
      </div>
      <p v-if="!exams.length" class="text-sm text-muted-foreground">Sin exámenes anunciados.</p>
    </Card>

    <Card class="gap-2 px-4 py-4 md:col-span-2">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-semibold">Novedades</h2>
        <button v-if="recent.length" type="button" class="text-xs text-primary underline-offset-4 hover:underline" @click="markResSeen(recent.map((r) => r.key))">Marcar todo como visto</button>
      </div>
      <component
        v-for="r in recent" :key="r.key"
        :is="r.url ? 'a' : 'div'" :href="r.url || undefined" :target="r.url ? '_blank' : undefined" rel="noopener"
        class="flex items-center gap-2 overflow-hidden rounded-md pr-3 text-sm hover:bg-muted/70"
        :class="r.kind === 'due' ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'bg-muted/40'"
        @click="markResSeen([r.key])"
      >
        <EdgeTag :code="r.code" />
        <div class="min-w-0 flex-1 py-2">
          <div class="truncate">{{ r.title }}</div>
          <div class="truncate text-xs" :class="r.kind === 'due' ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'">{{ r.sub }}</div>
        </div>
        <span class="shrink-0 text-xs text-muted-foreground">{{ formatDay(parseDate(r.when)) }}</span>
      </component>
      <p v-if="!recent.length" class="text-sm text-muted-foreground">Nada nuevo sin ver.</p>
    </Card>

    <Card v-if="fresh.length" class="gap-2 px-4 py-4 md:col-span-2">
      <h2 class="text-base font-semibold">Avisos nuevos</h2>
      <router-link v-for="a in fresh" :key="a.id" to="/avisos" class="block rounded-md bg-muted/40 px-3 py-2">
        <b class="text-sm">{{ a.title }}</b>
        <div class="text-xs text-muted-foreground">{{ a.code }}, {{ a.author }}</div>
      </router-link>
    </Card>
  </div>
</template>
