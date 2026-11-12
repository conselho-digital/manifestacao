// Converte IFPs do GTA SA em clipes do Carlos (public/anims/carlos-extra.json), com o mesmo método da página /load-animation
// (CarlosRetarget.bakeGame): rotação do Root e deslocamento relativos ao 1º quadro, deslocamento do corpo em `move`, sem dedos.
// Uso: THREE147=/caminho/para/three@0.147.0/package node scripts/bake-carlos-ifp.cjs
//   (o pacote do `npm pack three@0.147.0`; só o navegador de teste usa, não é dependência do jogo). Precisa do `playwright`.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const THREE147 = process.env.THREE147;
if (!THREE147) { console.error('Defina THREE147 (pasta "package" do three@0.147.0).'); process.exit(1); }
/** [arquivo .ifp, { nome no IFP: nome no jogo }] */
const JOBFILE = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'bake-carlos-ifp.jobs.json'), 'utf8'));
const JOBS = JOBFILE.clips;
const HANDS = JOBFILE.hands || [];

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
  const out = {};
  for (const [file, map] of JOBS) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    await p.setInputFiles('#fileInput', abs);
    await p.waitForFunction((n) => window.__page.S.ifp && window.__page.S.ifpName === n, path.basename(abs), { timeout: 30000 });
    for (const [from, to] of Object.entries(map)) {
      const data = await p.evaluate((n) => {
        const a = window.__page.S.ifp.anims.find((x) => x.name === n);
        return a ? CarlosRetarget.bakeGame(a) : null;
      }, from);
      if (!data) { console.warn('não achei', from, 'em', file); continue; }
      out[to] = data;
      console.log(to.padEnd(14), 'de', from.padEnd(22), data.duration + ' s', data.tracks.length + ' ossos', data.move ? 'move ' + Math.max(...data.move.f).toFixed(2) + ' m' : '');
    }
  }
  // trilhas das mãos (armas curtas): public/anims/pistol-overlay.json
  const hands = {};
  for (const [file, map] of HANDS) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    await p.setInputFiles('#fileInput', abs);
    await p.waitForFunction((n) => window.__page.S.ifp && window.__page.S.ifpName === n, path.basename(abs), { timeout: 30000 });
    for (const [from, to] of Object.entries(map)) {
      const refLast = typeof to === 'string' && to.endsWith('@last');
      const data = await p.evaluate(([n, last]) => window.__page.handTrack(n, last), [from, refLast]);
      if (!data) { console.warn('não achei', from); continue; }
      hands[to.replace('@last', '')] = data;
      console.log(to.padEnd(18), 'mãos de', from, data.duration + ' s');
    }
  }
  await b.close();
  if (Object.keys(hands).length) fs.writeFileSync(path.join(ROOT, 'public/anims/pistol-overlay.json'), JSON.stringify(hands));
  const target = path.join(ROOT, 'public/anims/carlos-extra.json');
  const cur = JSON.parse(fs.readFileSync(target, 'utf8'));
  Object.assign(cur, out);
  fs.writeFileSync(target, JSON.stringify(cur));
  console.log('gravado', target, (fs.statSync(target).size / 1024) | 0, 'KB');
})();
