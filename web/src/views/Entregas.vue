<script setup>
import { computed, ref, watch } from 'vue';
import { store, subject } from '../store.js';
import { madridParts, formatDay, formatTime, daysUntil, parseDate } from '../lib/dates.js';
import { monthGrid, itemsByDay, monthLabel, shiftMonth, dayKey, keyOf, dateOfKey, weekOf, shiftWeek, weekLabel } from '../lib/calendar.js';
import DeadlineItem from '../components/DeadlineItem.vue';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, FileText, Info } from '@lucide/vue';

const ALL = '__all__';
const filter = ref(ALL);
const showDone = ref(false);

const now = new Date();
const todayParts = madridParts(now);
const todayKey = dayKey(todayParts.year, todayParts.month, todayParts.day);

const MODE_KEY = 'bedel.calMode';
function readMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'semana' || v === 'mes' ? v : 'mes';
  } catch { return 'mes'; }
}
const mode = ref(readMode());
watch(mode, (v) => { try { localStorage.setItem(MODE_KEY, v); } catch { /* sin almacenamiento */ } });

const view = ref({ year: todayParts.year, month: todayParts.month });
const weekRef = ref(todayKey);
const selected = ref(todayKey);

const codes = computed(() => [...new Set(store.deadlines.map((d) => d.code))].sort());
const list = computed(() => store.deadlines.filter(
  (d) => (filter.value === ALL || d.code === filter.value) && (showDone.value || !d.done),
));
const events = computed(() => store.manual?.events ?? []);
const byDay = computed(() => itemsByDay(list.value, events.value));
const days = computed(() => monthGrid(view.value.year, view.value.month));
const weekDays = computed(() => weekOf(weekRef.value));
const title = computed(() => (mode.value === 'semana'
  ? weekLabel(weekDays.value)
  : monthLabel(view.value.year, view.value.month)));

const EMPTY = { deadlines: [], exams: [], holidays: [], others: [] };
function items(key) { return byDay.value.get(key) ?? EMPTY; }
function chips(key) {
  const it = items(key);
  return [
    ...it.exams.map((e) => ({ kind: 'exam', key: `x${e.date}${e.text}`, label: e.code ?? 'Examen' })),
    ...it.deadlines.map((d) => ({ kind: 'deadline', key: d.id, label: d.code, color: subject(d.code).color, done: d.done })),
  ];
}
function hasContent(key) {
  const it = items(key);
  return it.deadlines.length || it.exams.length || it.holidays.length || it.others.length;
}

function pick(keys, fallback) {
  if (keys.includes(todayKey)) return todayKey;
  return keys.find((k) => hasContent(k)) ?? fallback;
}

function go(step) {
  if (mode.value === 'semana') {
    weekRef.value = shiftWeek(weekRef.value, step);
    const keys = weekOf(weekRef.value).map((d) => d.key);
    selected.value = pick(keys, keys[0]);
    return;
  }
  const next = shiftMonth(view.value.year, view.value.month, step);
  view.value = next;
  const keys = monthGrid(next.year, next.month).filter((d) => d.inMonth).map((d) => d.key);
  selected.value = pick(keys, dayKey(next.year, next.month, 1));
}
function goToday() {
  view.value = { year: todayParts.year, month: todayParts.month };
  weekRef.value = todayKey;
  selected.value = todayKey;
}

/** Al cambiar de modo se conserva la fecha de referencia. */
watch(mode, (v) => {
  if (v === 'semana') {
    const keys = monthGrid(view.value.year, view.value.month).filter((d) => d.inMonth).map((d) => d.key);
    weekRef.value = keys.includes(selected.value)
      ? selected.value
      : (keys.includes(todayKey) ? todayKey : keys[0]);
  } else {
    const keys = weekOf(weekRef.value);
    const ref_ = keys.find((d) => d.key === selected.value) ?? keys.find((d) => d.key === todayKey) ?? keys[0];
    view.value = { year: ref_.year, month: ref_.month };
  }
});

const selectedLabel = computed(() => {
  const d = parseDate(`${selected.value}T12:00`);
  const s = formatDay(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
});
const selectedItems = computed(() => items(selected.value));

const upcoming = computed(() => {
  const from = now.getTime() - 86400000;
  const to = now.getTime() + 14 * 86400000;
  return list.value.filter((d) => d.due && !d.done && d.due.getTime() > from && d.due.getTime() <= to);
});

function fullChips(key) {
  const it = items(key);
  return [
    ...it.exams.map((e) => ({ kind: 'exam', key: `x${e.date}${e.text}`, label: e.code ?? 'Examen', title: e.text })),
    ...it.deadlines.map((d) => ({ kind: 'deadline', key: d.id, label: d.code, title: d.title, color: subject(d.code).color, done: d.done })),
  ];
}

const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DOW_LONG = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/* --- Lista de tareas (móvil) --- */
const byFilter = computed(() => store.deadlines.filter((d) => filter.value === ALL || d.code === filter.value));
const examList = computed(() => events.value.filter(
  (e) => e.type === 'examen' && (filter.value === ALL || e.code === filter.value),
));

function taskRow(d) {
  const n = d.due ? daysUntil(d.due, now) : null;
  return {
    id: `d${d.id}`, kind: 'task', day: d.due ? keyOf(d.due) : '',
    title: d.title, code: d.code, time: d.due ? formatTime(d.due) : '',
    url: d.url, done: d.done, urgent: n === 0 || n === 1, sort: d.due ? d.due.getTime() : 0,
  };
}
function examRow(e) {
  return {
    id: `x${e.date}${e.text}`, kind: 'exam', day: e.date,
    title: `Examen: ${e.text}`, code: e.code ?? null, time: '',
    url: null, done: false, urgent: false, sort: 0,
  };
}
function dayLabel(key) {
  const s = formatDay(dateOfKey(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function tint(color) { return `color-mix(in srgb, ${color} 18%, transparent)`; }

const todayRows = computed(() => [
  ...examList.value.filter((e) => e.date === todayKey).map(examRow),
  ...byFilter.value.filter((d) => d.due && !d.done && keyOf(d.due) === todayKey).map(taskRow),
]);

const upcomingGroups = computed(() => {
  const rows = [
    ...byFilter.value.filter((d) => d.due && !d.done && keyOf(d.due) > todayKey).map(taskRow),
    ...examList.value.filter((e) => e.date > todayKey).map(examRow),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.sort - b.sort);
  const groups = [];
  for (const r of rows) {
    if (!groups.length || groups[groups.length - 1].day !== r.day) groups.push({ day: r.day, label: dayLabel(r.day), rows: [] });
    groups[groups.length - 1].rows.push(r);
  }
  return groups;
});

const doneRows = computed(() => byFilter.value
  .filter((d) => d.done)
  .map(taskRow)
  .sort((a, b) => b.sort - a.sort));

const TAB_KEY = 'bedel.taskTab';
const TABS = ['hoy', 'proximas', 'hechas'];
function readTab() {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (TABS.includes(v)) return v;
  } catch { /* sin almacenamiento */ }
  return todayRows.value.length ? 'hoy' : 'proximas';
}
const tab = ref(readTab());
watch(tab, (v) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* sin almacenamiento */ } });
</script>

<template>
  <h1 class="mb-3 text-2xl font-semibold tracking-tight">Entregas</h1>

  <div class="mb-3 flex flex-wrap items-center gap-4">
    <Select v-model="filter">
      <SelectTrigger class="w-32"><SelectValue placeholder="Todas" /></SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">Todas</SelectItem>
        <SelectItem v-for="c in codes" :key="c" :value="c">{{ c }}</SelectItem>
      </SelectContent>
    </Select>
    <label class="hidden cursor-pointer items-center gap-2 text-sm md:flex">
      <Switch v-model="showDone" /> Ver hechas
    </label>
  </div>

  <!-- móvil: lista de tareas -->
  <Tabs v-model="tab" class="w-full md:hidden">
    <TabsList class="grid w-full grid-cols-3">
      <TabsTrigger value="hoy">Hoy</TabsTrigger>
      <TabsTrigger value="proximas">Próximas</TabsTrigger>
      <TabsTrigger value="hechas">Completadas</TabsTrigger>
    </TabsList>

    <TabsContent value="hoy" class="mt-3">
      <template v-for="(r, i) in todayRows" :key="r.id">
        <Separator v-if="i" />
        <component
          :is="r.url ? 'a' : 'div'"
          :href="r.url || undefined"
          :target="r.url ? '_blank' : undefined"
          :rel="r.url ? 'noopener' : undefined"
          class="flex items-start gap-3 py-2.5"
        >
          <FileText v-if="r.kind === 'exam'" class="mt-0.5 size-4 shrink-0 text-red-500" />
          <Circle v-else class="mt-0.5 size-4 shrink-0" :class="r.urgent ? 'text-red-500' : 'text-muted-foreground'" />
          <div class="min-w-0 flex-1">
            <div class="line-clamp-2 text-sm">{{ r.title }}</div>
            <span
              v-if="r.code"
              class="mt-1 inline-block rounded-sm px-1.5 text-[10px]"
              :style="{ backgroundColor: tint(subject(r.code).color), color: subject(r.code).color }"
            >{{ r.code }}</span>
          </div>
          <span
            v-if="r.time"
            class="shrink-0 text-xs tabular-nums"
            :class="r.urgent ? 'text-red-500' : 'text-muted-foreground'"
          >{{ r.time }}</span>
        </component>
      </template>
      <p v-if="!todayRows.length" class="text-sm text-muted-foreground">Nada para hoy.</p>
    </TabsContent>

    <TabsContent value="proximas" class="mt-3">
      <div v-for="g in upcomingGroups" :key="g.day" class="mb-2">
        <h2 class="mb-1 text-xs font-semibold text-muted-foreground">{{ g.label }}</h2>
        <template v-for="(r, i) in g.rows" :key="r.id">
          <Separator v-if="i" />
          <component
            :is="r.url ? 'a' : 'div'"
            :href="r.url || undefined"
            :target="r.url ? '_blank' : undefined"
            :rel="r.url ? 'noopener' : undefined"
            class="flex items-start gap-3 py-2.5"
          >
            <FileText v-if="r.kind === 'exam'" class="mt-0.5 size-4 shrink-0 text-red-500" />
            <Circle v-else class="mt-0.5 size-4 shrink-0" :class="r.urgent ? 'text-red-500' : 'text-muted-foreground'" />
            <div class="min-w-0 flex-1">
              <div class="line-clamp-2 text-sm">{{ r.title }}</div>
              <span
                v-if="r.code"
                class="mt-1 inline-block rounded-sm px-1.5 text-[10px]"
                :style="{ backgroundColor: tint(subject(r.code).color), color: subject(r.code).color }"
              >{{ r.code }}</span>
            </div>
            <span
              v-if="r.time"
              class="shrink-0 text-xs tabular-nums"
              :class="r.urgent ? 'text-red-500' : 'text-muted-foreground'"
            >{{ r.time }}</span>
          </component>
        </template>
      </div>
      <p v-if="!upcomingGroups.length" class="text-sm text-muted-foreground">Nada pendiente.</p>
    </TabsContent>

    <TabsContent value="hechas" class="mt-3">
      <template v-for="(r, i) in doneRows" :key="r.id">
        <Separator v-if="i" />
        <component
          :is="r.url ? 'a' : 'div'"
          :href="r.url || undefined"
          :target="r.url ? '_blank' : undefined"
          :rel="r.url ? 'noopener' : undefined"
          class="flex items-start gap-3 py-2.5"
        >
          <CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <div class="min-w-0 flex-1">
            <div class="line-clamp-2 text-sm">{{ r.title }}</div>
            <span
              v-if="r.code"
              class="mt-1 inline-block rounded-sm px-1.5 text-[10px]"
              :style="{ backgroundColor: tint(subject(r.code).color), color: subject(r.code).color }"
            >{{ r.code }}</span>
          </div>
          <span v-if="r.time" class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ r.time }}</span>
        </component>
      </template>
      <p v-if="!doneRows.length" class="text-sm text-muted-foreground">Nada completado todavía.</p>
    </TabsContent>
  </Tabs>

  <!-- escritorio: calendario -->
  <div class="hidden md:block">
    <div class="mb-2 flex items-center gap-1">
      <Button variant="ghost" size="icon" :aria-label="mode === 'semana' ? 'Semana anterior' : 'Mes anterior'" @click="go(-1)"><ChevronLeft class="size-4" /></Button>
      <div class="flex-1 text-center text-sm font-semibold text-balance md:text-base">{{ title }}</div>
      <Button variant="ghost" size="icon" :aria-label="mode === 'semana' ? 'Semana siguiente' : 'Mes siguiente'" @click="go(1)"><ChevronRight class="size-4" /></Button>
      <Button variant="ghost" size="sm" class="ml-1" @click="goToday">Hoy</Button>
      <Tabs v-model="mode" class="ml-1 w-auto shrink-0">
        <TabsList aria-label="Vista del calendario">
          <TabsTrigger value="semana" class="px-2 text-xs">Semana</TabsTrigger>
          <TabsTrigger value="mes" class="px-2 text-xs">Mes</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div v-if="mode === 'mes'" class="grid grid-cols-7 gap-px text-center text-[11px] font-semibold text-muted-foreground">
      <div v-for="(d, i) in DOW_SHORT" :key="d">
        <span class="md:hidden">{{ d }}</span><span class="hidden md:inline">{{ DOW_LONG[i] }}</span>
      </div>
    </div>

    <div v-if="mode === 'mes'" class="mt-1 grid grid-cols-7 gap-px">
      <button
        v-for="d in days"
        :key="d.key"
        type="button"
        class="flex min-h-14 min-w-0 flex-col gap-0.5 rounded-md border border-transparent p-0.5 text-left md:min-h-20"
        :class="[
          d.inMonth ? '' : 'opacity-40',
          items(d.key).holidays.length ? 'bg-muted' : (d.isWeekend ? 'bg-muted/40' : ''),
          d.key === todayKey ? 'ring-2 ring-primary' : '',
          d.key === selected ? 'border-primary bg-primary/5' : '',
        ]"
        @click="selected = d.key"
      >
        <div class="flex items-center justify-between gap-0.5">
          <span class="text-[10px] tabular-nums md:text-xs" :class="d.key === todayKey ? 'font-bold text-primary' : ''">{{ d.day }}</span>
          <span v-if="items(d.key).holidays.length" class="truncate text-[9px] text-muted-foreground">festivo</span>
        </div>
        <div
          v-for="c in chips(d.key).slice(0, 3)"
          :key="c.key"
          class="truncate rounded-sm px-0.5 text-[9px] leading-tight font-bold text-white md:px-1 md:text-[10px]"
          :class="c.done ? 'opacity-50' : ''"
          :style="{ backgroundColor: c.kind === 'exam' ? '#dc2626' : c.color }"
        >{{ c.kind === 'exam' ? '📝 ' : '' }}{{ c.label }}</div>
        <div v-if="chips(d.key).length > 3" class="px-0.5 text-[9px] text-muted-foreground">+{{ chips(d.key).length - 3 }}</div>
        <span v-if="items(d.key).others.length" class="mt-auto size-1.5 rounded-full bg-primary"></span>
      </button>
    </div>

    <div v-else class="mt-1 grid grid-cols-7 gap-px">
      <button
        v-for="(d, i) in weekDays"
        :key="d.key"
        type="button"
        class="flex min-h-28 min-w-0 flex-col gap-0.5 rounded-md border border-transparent p-0.5 text-left md:min-h-40 md:p-1"
        :class="[
          items(d.key).holidays.length ? 'bg-muted' : (d.isWeekend ? 'bg-muted/40' : ''),
          d.isWeekend && !items(d.key).holidays.length ? 'text-muted-foreground' : '',
          d.key === todayKey ? 'ring-2 ring-primary' : '',
          d.key === selected ? 'border-primary bg-primary/5' : '',
        ]"
        @click="selected = d.key"
      >
        <div class="min-w-0">
          <div class="truncate text-[9px] leading-tight font-semibold text-muted-foreground uppercase md:text-[10px]">
            <span class="md:hidden">{{ DOW_SHORT[i] }}</span><span class="hidden md:inline">{{ DOW_LONG[i] }}</span>
          </div>
          <div class="text-xs leading-tight font-semibold tabular-nums md:text-sm" :class="d.key === todayKey ? 'font-bold text-primary' : ''">{{ d.day }}</div>
        </div>
        <div v-if="items(d.key).holidays.length" class="truncate text-[9px] leading-tight text-muted-foreground">festivo</div>
        <div
          v-for="c in fullChips(d.key)"
          :key="c.key"
          class="w-full min-w-0 rounded-sm px-0.5 py-px text-white md:px-1"
          :class="c.done ? 'opacity-50' : ''"
          :style="{ backgroundColor: c.kind === 'exam' ? '#dc2626' : c.color }"
        >
          <div class="truncate text-[9px] leading-tight font-bold md:text-[10px]">{{ c.kind === 'exam' ? '📝 ' : '' }}{{ c.label }}</div>
          <div v-if="c.title" class="hidden truncate text-[10px] leading-tight md:block">{{ c.title }}</div>
        </div>
        <div v-for="e in items(d.key).others" :key="e.type + e.text" class="flex w-full min-w-0 items-center gap-1">
          <span class="size-1.5 shrink-0 rounded-full bg-primary"></span>
          <span class="truncate text-[10px] leading-tight text-muted-foreground">{{ e.text }}</span>
        </div>
      </button>
    </div>

    <h2 class="mt-5 mb-2 text-base font-semibold">{{ selectedLabel }}</h2>
    <Card
      v-for="e in [...selectedItems.holidays, ...selectedItems.exams, ...selectedItems.others]"
      :key="e.type + e.text"
      class="mb-2 flex-row items-center gap-2 px-3 py-2 text-sm"
    >
      <FileText v-if="e.type === 'examen'" class="size-4 shrink-0 text-destructive" />
      <Info v-else class="size-4 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1">{{ e.text }}</span>
      <span v-if="e.code" class="shrink-0 text-xs text-muted-foreground">{{ e.code }}</span>
    </Card>
    <DeadlineItem v-for="d in selectedItems.deadlines" :key="d.id" :d="d" />
    <p
      v-if="!selectedItems.deadlines.length && !selectedItems.exams.length && !selectedItems.holidays.length && !selectedItems.others.length"
      class="text-sm text-muted-foreground"
    >Nada ese día.</p>

    <h2 class="mt-6 mb-2 text-base font-semibold">Próximas</h2>
    <DeadlineItem v-for="d in upcoming" :key="d.id" :d="d" />
    <p v-if="!upcoming.length" class="text-sm text-muted-foreground">Nada en los próximos 14 días.</p>
  </div>
</template>
