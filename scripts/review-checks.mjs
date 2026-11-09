// Bot de revisão: regras do projeto aplicadas ao que mudou na branch/PR.
// Uso: node scripts/review-checks.mjs [base]   (base padrão: origin/main ou HEAD~1)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
const base = process.argv[2] || process.env.BASE_SHA || (() => { try { return sh('git merge-base HEAD origin/main'); } catch { return 'HEAD~1'; } })();
let changed = [];
try { changed = sh(`git diff --name-status ${base} HEAD`).split('\n').filter(Boolean).map((l) => l.split('\t')); } catch { /* sem base */ }

const errors = [];
const warns = [];
const notes = [];
const credits = existsSync('CREDITS.md') ? readFileSync('CREDITS.md', 'utf8') : '';

for (const [status, file] of changed) {
  if (status === 'D' || !existsSync(file)) continue;
  const size = statSync(file).size;

  if (/\.(glb|gltf)$/i.test(file) && file.startsWith('public/')) {
    if (size > 1_500_000) warns.push(`${file}: modelo de ${(size / 1e6).toFixed(1)} MB (meta: reduzir texturas para 512x512).`);
    const name = file.split('/').pop().replace(/\.glb$/i, '');
    const family = name.replace(/\d+$/, '');
    if (!credits.includes(name) && !credits.includes(family)) warns.push(`${file}: modelo novo sem crédito/licença no CREDITS.md.`);
  }
  if (size > 5_000_000 && file.startsWith('public/')) errors.push(`${file}: arquivo público acima de 5 MB (orçamento total do jogo: ~15 MB).`);

  if (file.startsWith('src/') && /\.ts$/.test(file)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((t, i) => {
      const at = `${file}:${i + 1}`;
      if (/\bdebugger\b/.test(t)) errors.push(`${at}: debugger esquecido.`);
      if (/\bconsole\.log\(/.test(t)) warns.push(`${at}: console.log (use console.warn/error só para falhas reais).`);
      if (/\b(TODO|FIXME|HACK)\b/.test(t)) notes.push(`${at}: ${t.trim().slice(0, 80)}`);
      if (/@ts-ignore|@ts-nocheck/.test(t)) warns.push(`${at}: supressão de tipos (@ts-ignore).`);
      if (/service_role|SUPABASE_SERVICE/i.test(t)) errors.push(`${at}: referência a service_role no front-end.`);
      if (/\.send\(|channel\.send/.test(t) && !/sendMove|httpSend/.test(t) && file !== 'src/net/sync.ts') warns.push(`${at}: envio de rede fora de src/net/sync.ts.`);
    });
  }

  if (file === 'package.json') {
    try {
      const now = JSON.parse(readFileSync('package.json', 'utf8'));
      const old = JSON.parse(sh(`git show ${base}:package.json`));
      for (const k of ['dependencies', 'devDependencies']) {
        for (const dep of Object.keys(now[k] || {})) if (!(old[k] || {})[dep]) notes.push(`Dependência nova em ${k}: ${dep} (confirme que é leve e necessária).`);
      }
    } catch { /* sem versão anterior */ }
  }
}

const out = [];
if (errors.length) out.push('### ❌ Precisa corrigir', ...errors.map((e) => `- ${e}`));
if (warns.length) out.push('### ⚠️ Atenção', ...warns.map((e) => `- ${e}`));
if (notes.length) out.push('### 📝 Notas', ...notes.map((e) => `- ${e}`));
if (!out.length) out.push(`✅ Nenhum problema nas ${changed.length} mudanças revisadas.`);
console.log(out.join('\n'));
process.exit(errors.length ? 1 : 0);
