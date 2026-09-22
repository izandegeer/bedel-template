<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../store.js';
import { weekGrid, blocksOn } from '../lib/agenda.js';
import { formatTime, madridParts, madridDate } from '../lib/dates.js';
import { dayKey, dateOfKey, weekStrip, shiftWeek } from '../lib/calendar.js';
import { useNow } from '../lib/clock.js';
import { nowPosition, rowFraction, elapsedColumns } from '../lib/nowline.js';
import SubjectTag from '../components/SubjectTag.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight } from '@lucide/vue';

const router = useRouter();
const now = useNow();
const grid = computed(() => weekGrid(store.timetable, now.value));
const todayParts = computed(() => madridParts(now.value));
const today = computed(() => todayParts.value.weekday);
const todayKey = computed(() => dayKey(todayParts.value.year, todayParts.value.month, todayParts.value.day));

/** Minutos desde medianoche (Madrid) de un instante. */
function mins(d) { const p = madridParts(d); return p.hour * 60 + p.minute; }
function hhmm(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

/** Fronteras horarias de la semana, ordenadas y sin duplicar. */
const bounds = computed(() => {
  const set = new Set();
  for (const day of grid.value) for (const b of day.blocks) { set.add(mins(b.start)); set.add(mins(b.end)); }
  return [...set].sort((a, b) => a - b);
});
const indexOf = computed(() => new Map(bounds.value.map((m, i) => [m, i])));

/** Filas = intervalos entre fronteras consecutivas. `free` = ninguna clase en ningún día. */
const rows = computed(() => bounds.value.slice(0, -1).map((start, i) => {
  const end = bounds.value[i + 1];
  const busy = grid.value.some((d) => d.blocks.some((b) => mins(b.start) < end && mins(b.end) > start));
  return { i, start, end, minutes: end - start, free: !busy };
}));

const templateRows = computed(() => rows.value
  .map((r) => (r.free ? 'minmax(22px, auto)' : `minmax(calc(${r.minutes} * var(--rf)), auto)`))
  .join(' '));

function placed(day) {
  return day.blocks.map((b) => ({
    ...b,
    row: `${indexOf.value.get(mins(b.start)) + 1} / ${indexOf.value.get(mins(b.end)) + 1}`,
    time: `${formatTime(b.start)}-${formatTime(b.end)}`,
    short: (b.end - b.start) / 60000 <= 50,
    current: day.key === todayKey.value && now.value >= b.start && now.value < b.end,
    fraction: Math.min(1, Math.max(0, (now.value - b.start) / (b.end - b.start))),
    past: day.key < todayKey.value || (day.key === todayKey.value && now.value >= b.end),
  }));
}

/* --- Tiempo transcurrido --- */
/** Días de la semana mostrada ya terminados y, si cae dentro, el índice de hoy. */
const elapsed = computed(() => elapsedColumns(weekDays.value, now.value));
/** Fila y fracción de la rejilla donde cae la hora actual, o null si queda fuera. */
/** Hoy está en la rejilla pero la jornada ya terminó: la columna entera queda atrás. */
/** Posición de la hora actual sobre las clases del día mostrado en el planificador móvil. */
const nowMobile = computed(() => (selected.value === todayKey.value
  ? nowPosition(dayBlocks.value, now.value)
  : { kind: 'outside' }));
function pct(fraction) { return `${(fraction * 100).toFixed(3)}%`; }

/* --- Planificador diario (móvil) --- */
const weekRef = ref(todayKey.value);
const selected = ref(todayKey.value);
const strip = computed(() => weekStrip(weekRef.value, todayKey.value)
  .map((d) => ({ ...d, past: d.key < todayKey.value })));
const selDate = computed(() => dateOfKey(selected.value));

function goWeek(step) {
  const i = Math.max(0, strip.value.findIndex((d) => d.key === selected.value));
  weekRef.value = shiftWeek(weekRef.value, step);
  selected.value = strip.value[i].key;
}

const dayBlocks = computed(() => blocksOn(store.timetable, selDate.value).map((b) => ({
  ...b,
  time: `${formatTime(b.start)}-${formatTime(b.end)}`,
  current: selected.value === todayKey.value && now.value >= b.start && now.value < b.end,
  past: selected.value < todayKey.value || (selected.value === todayKey.value && now.value >= b.end),
})));

const holiday = computed(() => (store.calendar?.holidays ?? [])
  .find((h) => h.from <= selected.value && selected.value <= h.to)?.text ?? null);

/** Días de la semana mostrada, con su fecha real y el número del día del mes. */
const weekDays = computed(() => {
  const p = madridParts(now.value);
  return grid.value.map((day) => {
    const q = madridParts(madridDate(p.year, p.month, p.day - p.weekday + day.day, 12, 0));
    return { ...day, key: dayKey(q.year, q.month, q.day), dom: q.day, isToday: day.day === today.value };
  });
});
function tasks(code) { return deadlinesFor(code).length; }

/** Pulsar una clase lleva a Material con esa asignatura abierta. */
function goMaterial(code) { router.push({ name: 'material', query: { open: code } }); }
function deadlinesFor(code) { return store.deadlines.filter((d) => d.code === code && !d.done && d.due); }
</script>

<template>
  <h1 class="mb-1 text-2xl font-semibold tracking-tight">Horario</h1>

  <!-- móvil: planificador diario -->
  <div class="md:hidden">
    <div class="mb-3 flex items-center gap-0.5">
      <Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Semana anterior" @click="goWeek(-1)">
        <ChevronLeft class="size-4" />
      </Button>
      <div class="flex min-w-0 flex-1 justify-between">
        <button
          v-for="d in strip"
          :key="d.key"
          type="button"
          class="flex min-w-0 flex-1 flex-col items-center gap-1 py-1"
          :aria-pressed="d.key === selected"
          @click="selected = d.key"
        >
          <span class="text-[11px] leading-none tracking-wide text-muted-foreground uppercase">{{ d.label }}</span>
          <Badge
            v-if="d.key === selected"
            class="h-6 rounded-md px-1.5 text-sm font-semibold tabular-nums"
          >{{ d.day }}</Badge>
          <Badge
            v-else-if="d.isToday"
            variant="outline"
            class="h-6 rounded-md px-1.5 text-sm font-semibold tabular-nums"
          >{{ d.day }}</Badge>
          <span
            v-else
            class="flex h-6 items-center justify-center px-1.5 text-sm tabular-nums"
            :class="d.past ? 'text-muted-foreground' : 'text-foreground'"
          >{{ d.day }}</span>
        </button>
      </div>
      <Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Semana siguiente" @click="goWeek(1)">
        <ChevronRight class="size-4" />
      </Button>
    </div>

    <template v-for="(b, i) in dayBlocks" :key="b.id">
      <button
        type="button"
        class="relative mb-2 block w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :class="b.past ? 'opacity-75' : ''"
        @click="goMaterial(b.code)"
      >
        <Card
          class="gap-1 border px-3 py-2.5 ring-0 hover:bg-accent"
          :class="b.current ? 'border-primary' : 'border-border'"
        >
          <div class="flex min-w-0 items-center gap-2">
            <SubjectTag :code="b.code" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ b.name }}</span>
            <Badge v-if="tasks(b.code)" variant="outline" class="shrink-0 rounded-md text-[10px]">
              {{ tasks(b.code) }} {{ tasks(b.code) === 1 ? 'tarea' : 'tareas' }}
            </Badge>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            <span class="tabular-nums">{{ b.time }}</span>{{ b.teacher ? `, ${b.teacher}` : '' }}
          </div>
        </Card>

        <!-- tiempo transcurrido dentro de la clase en curso -->
        <div
          v-if="nowMobile.kind === 'in' && nowMobile.index === i"
          class="pointer-events-none absolute inset-x-0 top-0 z-10 rounded-t-xl border-b border-foreground/15 bg-foreground/[0.035] dark:bg-foreground/[0.06]"
          :style="{ height: pct(nowMobile.fraction) }"
        ></div>
      </button>
    </template>

    <p v-if="!dayBlocks.length" class="text-sm text-muted-foreground">
      {{ holiday ? `Festivo: ${holiday}` : 'Sin clases' }}
    </p>
  </div>

  <!-- escritorio: rejilla semanal -->
  <Card class="hidden gap-0 p-3 md:block">
    <div class="grid grid-cols-[48px_repeat(5,minmax(0,1fr))]">
      <div></div>
      <div v-for="d in weekDays" :key="d.day" class="flex flex-col items-center gap-1 pb-2">
        <span class="text-[11px] tracking-wide text-muted-foreground uppercase">{{ d.label }}</span>
        <Badge
          v-if="d.isToday"
          class="h-7 rounded-md px-2 text-base leading-none font-semibold tabular-nums"
        >{{ d.dom }}</Badge>
        <span v-else class="flex h-7 items-center justify-center text-base leading-none font-semibold tabular-nums">{{ d.dom }}</span>
      </div>
    </div>

    <Separator class="mb-2" />

    <div
      class="grid grid-cols-[48px_repeat(5,minmax(0,1fr))] [--rf:0.9px] md:[--rf:1.5px]"
      :style="{ gridTemplateRows: templateRows }"
    >
      <!-- fondo del área de la rejilla -->
      <div
        class="pointer-events-none bg-muted/20"
        :style="{ gridColumn: '2 / -1', gridRow: '1 / -1' }"
      ></div>

      <!-- columna de hoy -->
      <div
        v-if="today < 5"
        class="pointer-events-none bg-primary/5"
        :style="{ gridColumn: today + 2, gridRow: '1 / -1' }"
      ></div>

      <!-- separadores verticales entre días -->
      <div
        v-for="n in 5"
        :key="`v${n}`"
        class="pointer-events-none border-l border-border/60"
        :style="{ gridColumn: n + 1, gridRow: '1 / -1' }"
      ></div>

      <!-- descansos -->
      <div
        v-for="r in rows.filter((x) => x.free)"
        :key="`f${r.i}`"
        class="pointer-events-none flex items-center justify-center bg-muted/50 text-[10px] tracking-wide text-muted-foreground uppercase"
        :style="{ gridColumn: '2 / -1', gridRow: r.i + 1 }"
      >{{ r.minutes >= 15 ? 'Descanso' : '' }}</div>

      <!-- líneas de hora -->
      <div
        v-for="r in rows"
        :key="`l${r.i}`"
        class="pointer-events-none border-t border-border"
        :style="{ gridColumn: '2 / -1', gridRow: r.i + 1 }"
      ></div>
      <div
        class="pointer-events-none self-end border-t border-border"
        :style="{ gridColumn: '2 / -1', gridRow: rows.length }"
      ></div>

      <!-- etiquetas de hora -->
      <div
        v-for="r in rows"
        :key="`h${r.i}`"
        class="-mt-[7px] pr-2 text-right text-[11px] leading-none tabular-nums text-muted-foreground"
        :style="{ gridColumn: 1, gridRow: r.i + 1 }"
      >{{ hhmm(r.start) }}</div>

      <div
        class="-mb-[3px] self-end pr-2 text-right text-[11px] leading-none tabular-nums text-muted-foreground"
        :style="{ gridColumn: 1, gridRow: rows.length }"
      >{{ hhmm(bounds[bounds.length - 1]) }}</div>

      <!-- bloques -->
      <template v-for="day in weekDays" :key="day.day">
        <button
          v-for="b in placed(day)"
          :key="b.id"
          type="button"
          class="block-card relative flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-card-foreground shadow-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="[b.current ? 'border-primary' : 'border-border', b.past ? 'bg-muted text-muted-foreground' : 'bg-card']"
          :style="{ gridColumn: day.day + 2, gridRow: b.row }"
          @click="goMaterial(b.code)"
        >
          <div
            v-if="b.current"
            class="pointer-events-none absolute inset-x-0 top-0 z-0 border-b border-foreground/15 bg-muted"
            :style="{ height: pct(b.fraction) }"
          ></div>
          <div class="relative z-10 flex w-full min-w-0 items-start gap-1.5">
            <span class="mt-[3px] size-2 shrink-0 rounded-full" :style="{ backgroundColor: b.color }"></span>
            <span
              class="min-w-0 flex-1 text-[12px] leading-tight text-foreground"
              :class="[b.short ? 'truncate' : 'line-clamp-2', b.current ? 'font-semibold' : 'font-medium']"
            >{{ b.name }}</span>
          </div>
          <div class="relative z-10 w-full truncate pl-3.5 text-[11px] leading-tight tabular-nums text-muted-foreground">{{ b.time }}</div>
        </button>
      </template>

    </div>
  </Card>

</template>

<style scoped>
.block-card { margin: 1.5px 3px; }
</style>
