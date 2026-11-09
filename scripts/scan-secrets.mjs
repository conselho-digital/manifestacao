// Bot de segurança: procura segredos em arquivos versionados.
// Uso: node scripts/scan-secrets.mjs   (sai com código 1 se achar algo)
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const SKIP_EXT = /\.(glb|png|jpg|jpeg|webp|rar|7z|zip|ifp|lock)$/i;
const SKIP_FILE = /^(package-lock\.json|scripts\/scan-secrets\.mjs)$/;

const patterns = [
  ['Chave secreta do Supabase (sb_secret_)', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Chave privada PEM', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['Chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['Chave de API (sk-...)', /\bsk-(?:ant-)?[A-Za-z0-9_-]{30,}\b/],
  ['Token da Vercel/Slack', /\b(?:xox[abprs]-[A-Za-z0-9-]{10,}|vercel_[A-Za-z0-9]{20,})\b/],
  ['Service role', /service_role\s*[:=]\s*['"][^'"]{20,}['"]/i],
];

const problems = [];
const add = (file, line, what) => problems.push(`${file}:${line}  ${what}`);

for (const f of files) {
  if (SKIP_EXT.test(f) || SKIP_FILE.test(f)) continue;
  if (/^\.env(\..*)?$/.test(f.split('/').pop()) && !f.endsWith('.env.example')) add(f, 1, 'Arquivo .env versionado');
  if (statSync(f).size > 2_000_000) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const [name, re] of patterns) if (re.test(text)) add(f, i + 1, name);
    // JWT: só a chave "anon" é pública. Qualquer outra role é segredo.
    for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
        if (payload.role && payload.role !== 'anon') add(f, i + 1, `JWT com role "${payload.role}" (segredo)`);
      } catch { /* não é JWT */ }
    }
  });
}

if (problems.length) {
  console.error('Possíveis segredos encontrados:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Nenhum segredo encontrado em ${files.length} arquivos.`);
