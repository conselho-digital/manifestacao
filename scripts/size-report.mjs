// Mede o tamanho do build e falha se passar do orçamento do jogo (~15 MB).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 15 * 1024 * 1024;
const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p) : files.push([p, statSync(p).size]);
  }
})('dist');
// dist/tools/ guarda dados das páginas de ferramentas (ex.: ped.ifp da página de animações): os jogadores nunca baixam, então não entram no orçamento do jogo
const tools = files.filter(([p]) => /[\\/]tools[\\/]/.test(p));
for (const t of tools) files.splice(files.indexOf(t), 1);
const total = files.reduce((s, [, n]) => s + n, 0);
if (tools.length) console.log(`Ferramentas (fora do orçamento): ${(tools.reduce((s, [, n]) => s + n, 0) / 1048576).toFixed(2)} MB`);
files.sort((a, b) => b[1] - a[1]);
console.log(`Build total: ${(total / 1048576).toFixed(2)} MB (limite ${LIMIT / 1048576} MB)`);
for (const [p, n] of files.slice(0, 5)) console.log(`  ${(n / 1024).toFixed(0).padStart(6)} KB  ${p}`);
if (total > LIMIT) { console.error('Build acima do orçamento.'); process.exit(1); }
