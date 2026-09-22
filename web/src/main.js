import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { loadAll } from './store.js';
import './style.css';

/** shadcn-vue usa la clase .dark: la seguimos de la preferencia del sistema, sin toggle. */
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const applyScheme = (dark) => document.documentElement.classList.toggle('dark', dark);
applyScheme(scheme.matches);
scheme.addEventListener('change', (e) => applyScheme(e.matches));

loadAll();
createApp(App).use(router).mount('#app');
