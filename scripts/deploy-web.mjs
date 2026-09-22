#!/usr/bin/env node
// Construye la web con los datos actuales y la despliega en Pages y en Workers.
// Uso: npm run deploy
import { loadConfig } from './lib/config.mjs';
import { deployAll } from './lib/deploy.mjs';

const cfg = loadConfig();
const r = deployAll(cfg);
console.log(`Pages: ${r.pages}`);
console.log(`Workers: ${r.worker}`);
process.exit(r.pages === 'ok' && r.worker === 'ok' ? 0 : 1);
