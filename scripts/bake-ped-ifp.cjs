// Converte os IFPs do GTA SA em clipes do esqueleto GTA dos personagens Law1-9 (public/anims/ped-extra.json), os MESMOS clipes que o Carlos recebe
// de scripts/bake-carlos-ifp.cjs (lista em scripts/bake-carlos-ifp.jobs.json). Formato: tracks [{id, t, q}] com os quaternions como estão no IFP
// (o jogo converte ao carregar: gtaConvert). `move`/`drop` (deslocamento do corpo) vêm do clipe de mesmo nome do carlos-extra.json (medidos em metros, valem para qualquer esqueleto).
// Uso: THREE147=/caminho/three@0.147.0/package node scripts/bake-ped-ifp.cjs   (precisa do playwright; só o navegador de teste usa o three antigo)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const THREE147 = process.env.THREE147;
if (!THREE147) { console.error('Defina THREE147 (pasta "package" do three@0.147.0).'); process.exit(1); }
const JOBS = JSON.parse(fs.readFileSync(path.join(__dirname, 'bake-carlos-ifp.jobs.json'), 'utf8')).clips;
// sem dedos (25/26/35/36): o jogo fecha a mão por `curlHand`, como nos clipes do Carlos
const KNOWN = new Set([1, 2, 3, 4, 5, 6, 7, 8, 21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 44, 51, 52, 53, 54, 201]);
// candidatos medidos e não usados no jogo (ver CLAUDE.md): não vão para o arquivo
// clipes em que o corpo deita/rola: levam também a rotação do osso Root (id 0), que é quem tomba o corpo no IFP (sem ela o personagem cai e fica em pé)
const LYING = /^(ko|getup|roll_|dive|hitk_2|bike_fall)/;
const SKIP = new Set(['car_sit2', 'sprint_civi', 'drive_l', 'drive_r', 'walk_player']);
const r3 = (n) => Math.round(n * 1000) / 1000;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.route('https://cdn.jsdelivr.net/**', (r) => {
    const u = r.request().url();
    const f = u.includes('OrbitControls') ? 'examples/js/controls/OrbitControls.js' : u.includes('GLTFLoader') ? 'examples/js/loaders/GLTFLoader.js' : 'build/three.min.js';
    r.fulfill({ body: fs.readFileSync(path.join(THREE147, f)), contentType: 'application/javascript' });
  });
  await p.goto('file://' + path.join(ROOT, 'public/load-animation.html'));
  await p.waitForFunction(() => window.__page && window.__page.S.rig, null, { timeout: 30000 });
  const carlosExtra = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/anims/carlos-extra.json'), 'utf8'));
  const out = {};
  for (const [file, map] of JOBS) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    await p.setInputFiles('#fileInput', abs);
    await p.waitForFunction((n) => window.__page.S.ifp && window.__page.S.ifpName === n, path.basename(abs), { timeout: 30000 });
    for (const [from, to] of Object.entries(map)) {
      const raw = await p.evaluate((n) => {
        const a = window.__page.S.ifp.anims.find((x) => x.name === n);
        return a ? { duration: a.duration, nodes: a.nodes.map((nd) => ({ id: nd.id, keys: nd.keys.map((k) => ({ t: k.t, q: k.q })) })) } : null;
      }, from);
      if (SKIP.has(to)) continue;
      if (!raw) { console.warn('não achei', from, 'em', file); continue; }
      const tracks = raw.nodes.filter((n) => (KNOWN.has(n.id) || (n.id === 0 && LYING.test(to))) && n.keys.length).map((n) => ({ id: n.id, t: n.keys.map((k) => r3(k.t)), q: n.keys.flatMap((k) => k.q.map(r3)) }));
      const clip = { duration: r3(Math.max(...tracks.map((t) => t.t[t.t.length - 1]), raw.duration)), tracks };
      const ce = carlosExtra[to];
      if (ce && ce.move) clip.move = ce.move;
      if (ce && ce.drop) clip.drop = ce.drop;
      out[to] = clip;
      console.log(to.padEnd(14), 'de', from.padEnd(22), clip.duration + ' s', tracks.length + ' ossos', clip.move ? 'move' : '');
    }
  }
  await b.close();
  const target = path.join(ROOT, process.env.PED_OUT || 'public/anims/ped-extra.json');
  const cur = JSON.parse(fs.readFileSync(target, 'utf8'));
  // confere contra o que já existia (mesmos IFPs): erro máximo dos quaternions
  for (const name of Object.keys(out)) {
    const old = cur[name];
    if (!old) continue;
    let worst = 0;
    for (const t of out[name].tracks) {
      const o = old.tracks.find((x) => x.id === t.id);
      if (!o || o.q.length !== t.q.length) continue;
      for (let i = 0; i < t.q.length; i++) worst = Math.max(worst, Math.abs(t.q[i] - o.q[i]));
    }
    console.log('confere', name.padEnd(12), 'erro máx', worst.toFixed(4), old.duration === out[name].duration ? '' : '(duração ' + old.duration + ' → ' + out[name].duration + ')');
  }
  Object.assign(cur, out);
  fs.writeFileSync(target, JSON.stringify(cur));
  console.log('gravado', target, (fs.statSync(target).size / 1024) | 0, 'KB');
})();
