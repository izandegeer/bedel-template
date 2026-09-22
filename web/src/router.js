import { createRouter, createWebHistory } from 'vue-router';
import { LayoutDashboard, CalendarDays, Inbox, BookOpen, Megaphone, Calculator } from '@lucide/vue';
import Hoy from './views/Hoy.vue';
import Horario from './views/Horario.vue';
import Entregas from './views/Entregas.vue';
import Material from './views/Material.vue';
import Avisos from './views/Avisos.vue';
import Faltas from './views/Faltas.vue';

export const routes = [
  { path: '/', name: 'hoy', component: Hoy, meta: { title: 'Dashboard', icon: '📊', lucide: LayoutDashboard } },
  { path: '/horario', name: 'horario', component: Horario, meta: { title: 'Horario', icon: '🗓️', lucide: CalendarDays } },
  { path: '/entregas', name: 'entregas', component: Entregas, meta: { title: 'Entregas', icon: '📬', lucide: Inbox } },
  { path: '/material', name: 'material', component: Material, meta: { title: 'Material', icon: '📚', lucide: BookOpen } },
  { path: '/avisos', name: 'avisos', component: Avisos, meta: { title: 'Avisos', icon: '📣', lucide: Megaphone } },
  { path: '/faltas', name: 'faltas', component: Faltas, meta: { title: 'Faltas', icon: '🧮', lucide: Calculator } },
];
export const router = createRouter({ history: createWebHistory(), routes });
