<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import { classesOn, sessionMinutesAt } from '../lib/agenda.js';
import { formatDay } from '../lib/dates.js';
import { globalReport } from '../lib/absences.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const now = new Date();
const limit = computed(() => store.modules?.limitPercent ?? 15);
const report = computed(() => store.absenceReport ?? []);

const num = (n, d = 1) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

/** Media de sesiones por día en que hay clase del módulo, en el periodo vigente. */
function sessionsPerClassDay(code) {
  const tt = store.timetable;
  if (!tt) return 0;
  const mins = sessionMinutesAt(tt, now);
  const byDay = new Map();
  for (const c of classesOn(tt, now)) {
    if (c.code !== code) continue;
    const [sh, sm] = c.start.split(':').map(Number);
    const [eh, em] = c.end.split(':').map(Number);
    const n = Math.round((eh * 60 + em - (sh * 60 + sm)) / mins);
    byDay.set(c.day, (byDay.get(c.day) ?? 0) + n);
  }
  if (!byDay.size) return 0;
  return [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size;
}

/** Sesiones restantes convertidas a "clases" (días de clase). */
function classesLeft(m) {
  const per = sessionsPerClassDay(m.code);
  return per > 0 ? Math.floor(m.remaining / per) : null;
}

const BAR = {
  ok: '[&>[data-slot=progress-indicator]]:bg-emerald-500',
  warn: '[&>[data-slot=progress-indicator]]:bg-amber-500',
  danger: '[&>[data-slot=progress-indicator]]:bg-red-500',
  lost: '[&>[data-slot=progress-indicator]]:bg-red-600',
};
const TEXT = { ok: 'text-emerald-600', warn: 'text-amber-600', danger: 'text-red-600', lost: 'text-red-600' };

const bar = (m) => Math.min(100, (m.percent / limit.value) * 100);
const rows = computed(() => report.value.map((m) => ({ ...m, left: classesLeft(m) })));
const total = computed(() => rows.value.reduce((n, m) => n + m.items.length, 0));
const global = computed(() => globalReport(report.value, limit.value));
</script>

<template>
  <h1 class="mb-3 text-2xl font-semibold tracking-tight">Faltas</h1>

  <Card class="mb-4 gap-2 border-2 px-3 py-3" :class="global.level === 'ok' ? 'border-emerald-500/40' : global.level === 'warn' ? 'border-amber-500/60' : 'border-red-500/70'">
    <div class="flex items-baseline gap-2">
      <span class="text-sm font-semibold">Total del curso</span>
      <span class="text-xs text-muted-foreground">{{ global.hours }} h oficiales</span>
      <span class="ml-auto text-lg font-semibold tabular-nums" :class="TEXT[global.level]">{{ num(global.percent) }} %</span>
    </div>
    <Progress :model-value="bar(global)" :class="BAR[global.level]" />
    <p v-if="global.level === 'lost'" class="text-xs font-semibold text-red-600">Evaluación continua perdida</p>
    <p class="text-xs text-muted-foreground">
      {{ global.counted }} / {{ global.maxAllowed }} sesiones, te quedan {{ global.remaining }} antes del {{ limit }} %
      ({{ num(global.percentOfHeld) }} % de lo impartido)<template v-if="global.justified">, +{{ global.justified }} justificadas</template>
    </p>
  </Card>

  <Card v-for="m in rows" :key="m.code" class="mb-2 gap-2 px-3 py-3">
    <div class="flex items-start gap-2">
      <Badge variant="secondary" class="shrink-0">{{ m.code }}</Badge>
      <span class="min-w-0 flex-1 text-sm font-medium break-words">{{ m.name }}</span>
      <span class="shrink-0 text-sm tabular-nums" :class="TEXT[m.level]">
        {{ m.counted }} / {{ m.maxAllowed }}
      </span>
    </div>

    <Progress :model-value="bar(m)" :class="BAR[m.level]" />

    <p v-if="m.level === 'lost'" class="text-xs font-semibold text-red-600">
      Evaluación continua perdida
    </p>

    <p class="text-xs text-muted-foreground">
      {{ num(m.percent) }} % del módulo, {{ num(m.percentOfHeld) }} % de lo impartido -
      te quedan {{ m.remaining }} {{ m.remaining === 1 ? 'sesión' : 'sesiones' }}<template v-if="m.left !== null">
        (≈ {{ m.left }} {{ m.left === 1 ? 'clase' : 'clases' }})</template>
    </p>

    <p v-if="m.justified > 0" class="text-xs text-muted-foreground">
      +{{ m.justified }} justificada{{ m.justified === 1 ? '' : 's' }}
    </p>

    <Accordion v-if="m.items.length" type="single" collapsible class="-mb-1">
      <AccordionItem :value="m.code" class="border-none">
        <AccordionTrigger class="py-1 text-xs font-normal text-muted-foreground">
          Ver {{ m.items.length }} {{ m.items.length === 1 ? 'falta' : 'faltas' }}
        </AccordionTrigger>
        <AccordionContent class="pb-1">
          <ul class="space-y-1">
            <li v-for="(a, i) in m.items" :key="i" class="flex flex-wrap items-baseline gap-x-1.5 text-xs">
              <span class="font-medium">{{ formatDay(new Date(`${a.date}T12:00:00Z`)) }}</span>
              <span class="text-muted-foreground">{{ a.sessions }} {{ a.sessions === 1 ? 'sesión' : 'sesiones' }}</span>
              <Badge v-if="a.justified" variant="outline" class="text-[0.65rem]">justificada</Badge>
              <span v-if="a.note" class="w-full text-muted-foreground break-words">{{ a.note }}</span>
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </Card>

  <p v-if="!rows.length" class="text-sm text-muted-foreground">Sin módulos configurados.</p>

  <p class="mt-5 text-xs text-muted-foreground">
    Límite: {{ limit }} % de las horas oficiales del módulo.<template v-if="!total">
      Aún no hay faltas registradas.</template>
    Registra faltas con <code class="rounded bg-muted px-1 py-0.5">./scripts/falta.sh CODE [fecha]</code>.
  </p>
</template>
