// Ferramenta /personagens (só o admin salva): mistura cabeça, tronco e pernas dos modelos Law1-9, pinta cada parte e, se quiser, troca a cabeça
// por um modelo 3D novo (GLB) preso ao osso da cabeça. "Salvar" publica para todos (Supabase: tabelas custom_characters / custom_heads, bucket chars).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Animator } from '../game/anim';
import { supabase } from '../net/supabase';
import { isAdmin } from '../game/teams';
import { buildCustom, customList, forgetHead, headList, headOf, isHeadId, LAW_SOURCES, loadCustom, loadHeadModel, PART_LABEL, PARTS, registerLocalHead, type CharRecipe, type CustomChar } from '../game/customChars';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const rid = (p: string): string => p + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');

// ---------- cena ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24303f);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);
scene.add(new THREE.GridHelper(6, 24, 0x4a5a70, 0x34414f));
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
camera.position.set(-1.6, 1.5, 3.2);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.0, 0);
orbit.enableDamping = true;
orbit.minDistance = 0.3;
orbit.maxDistance = 8;
function resize(): void {
  const w = Math.max(10, view.clientWidth);
  const h = Math.max(10, view.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();

// ---------- estado ----------
let rec: CharRecipe = { head: 'Law1', torso: 'Law1', legs: 'Law1' };
let name = 'Novo personagem';
let editingId: string | null = null;
let obj: THREE.Group | null = null;
let animator: Animator | null = null;
let clip = 'idle';
let paused = false;
let admin = false;
let busy = false;
let building = 0;
const localHeads = new Map<string, { file: Blob; name: string }>(); // cabeças ainda não enviadas (já normalizadas/leves)
const status = mk('div');
status.id = 'status';
let statusTimer = 0;
const say = (t: string, keep = false): void => { status.textContent = t; clearTimeout(statusTimer); if (!keep) statusTimer = window.setTimeout(() => { status.textContent = ''; }, 6000); };

// ---------- montar e animar ----------
async function rebuild(): Promise<void> {
  const my = ++building;
  const next = await buildCustom(rec);
  if (my !== building) return;
  if (obj) scene.remove(obj);
  obj = next;
  scene.add(obj);
  animator = await Animator.create(obj);
  if (my !== building) return;
  if (animator) animator.play(animator.has(clip) ? clip : 'idle');
}
let timer = 0;
const schedule = (): void => { clearTimeout(timer); timer = window.setTimeout(() => { void rebuild().catch((e) => say(`Erro ao montar: ${(e as Error).message}`)); }, 60); };

const clock = new THREE.Timer();
clock.connect(document);
function frame(): void {
  requestAnimationFrame(frame);
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  if (animator && !paused) animator.update(dt);
  orbit.update();
  renderer.render(scene, camera);
}

// ---------- lista da esquerda ----------
const list = $('list');
const tileFor = (src: string): HTMLButtonElement => {
  const b = mk('button', 'tile');
  b.type = 'button';
  const img = mk('img');
  img.src = `/faces/${src}.webp`;
  img.alt = '';
  b.append(img, mk('span', '', src.replace('Law', 'Modelo ')));
  return b;
};
function buildList(): void {
  list.textContent = '';
  list.append(mk('div', 'title', 'Criar personagem'));
  const hint = mk('div', 'hint', 'Escolha de qual modelo vem cada parte. Todos têm o mesmo esqueleto, então andam e lutam igual.');
  hint.style.padding = '4px 14px 0';
  list.append(hint);
  for (const part of PARTS) {
    list.append(mk('h2', '', PART_LABEL[part]));
    const g = mk('div', 'grid');
    for (const s of LAW_SOURCES) {
      const b = tileFor(s);
      b.classList.toggle('on', rec[part] === s);
      b.onclick = () => { rec = { ...rec, [part]: s }; if (part === 'head') { delete rec.hp; delete rec.hr; delete rec.hs; } buildList(); buildControls(); schedule(); };
      g.append(b);
    }
    if (part === 'head') {
      for (const h of headList()) {
        const b = mk('button', 'tile');
        b.type = 'button';
        b.append(mk('div', 'ph', '🗿'), mk('span', '', h.name));
        b.classList.toggle('on', rec.head === h.id);
        b.onclick = () => { rec = { ...rec, head: h.id, hp: rec.hp ?? [0, 0.075, 0], hr: rec.hr ?? [0, 0, 0], hs: rec.hs ?? 1 }; buildList(); buildControls(); schedule(); };
        if (admin) {
          const x = mk('button', 'x warn', '✕');
          x.title = 'Apagar esta cabeça';
          x.onclick = (ev) => { ev.stopPropagation(); void deleteHead(h.id); };
          b.append(x);
        }
        g.append(b);
      }
    }
    list.append(g);
    if (part === 'head') {
      const up = mk('button', '', '＋ Enviar cabeça 3D (.glb)');
      up.style.margin = '0 12px 10px';
      up.onclick = () => $<HTMLInputElement>('glb').click();
      list.append(up);
    }
  }
  list.append(mk('h2', '', 'Personagens salvos'));
  const chars = customList();
  if (!chars.length) list.append(Object.assign(mk('div', 'hint', 'Nenhum ainda.'), { style: 'padding:0 14px 10px' }));
  for (const c of chars) {
    const row = mk('div', 'saved');
    row.classList.toggle('on', editingId === c.id);
    const img = mk('img');
    img.src = c.face;
    img.alt = '';
    row.append(img, mk('span', '', c.name));
    row.onclick = () => edit(c);
    if (admin) {
      const x = mk('button', 'warn', '✕');
      x.title = 'Apagar personagem';
      x.onclick = (ev) => { ev.stopPropagation(); void deleteChar(c); };
      row.append(x);
    }
    list.append(row);
  }
}

function edit(c: CustomChar): void {
  rec = JSON.parse(JSON.stringify(c.recipe)) as CharRecipe;
  name = c.name;
  editingId = c.id;
  buildList();
  buildControls();
  schedule();
}

// ---------- controles da direita ----------
const ctl = $('ctl');
function buildControls(): void {
  ctl.textContent = '';
  ctl.append(mk('div', 'title', 'Cores e salvar'));
  const who = mk('div');
  who.id = 'who';
  who.textContent = admin ? 'Conta de administrador: você pode salvar.' : 'Você não está como admin. Entre no jogo (login Google) com a conta de admin e volte aqui para salvar.';
  who.className = admin ? 'ok' : '';
  ctl.append(who);
  const pad = mk('div', 'pad');
  pad.append(mk('h2', '', 'Cor de cada parte'));
  pad.lastElementChild!.setAttribute('style', 'padding-left:0');
  for (const part of PARTS) {
    const row = mk('div', 'tint');
    const lab = mk('label', '', PART_LABEL[part]);
    const inp = mk('input');
    inp.type = 'color';
    inp.value = rec.tint?.[part] ?? '#ffffff';
    inp.oninput = () => { rec = { ...rec, tint: { ...rec.tint, [part]: inp.value } }; schedule(); };
    const clr = mk('button', '', 'Limpar');
    clr.onclick = () => { const t = { ...rec.tint }; delete t[part]; rec = { ...rec, tint: t }; inp.value = '#ffffff'; schedule(); };
    row.append(lab, inp, clr);
    pad.append(row);
  }
  pad.append(mk('div', 'hint', 'A cor se multiplica na textura: branco = sem mudar; tons escuros escurecem a roupa.'));

  if (isHeadId(rec.head)) {
    pad.append(mk('h2', '', 'Posição da cabeça 3D'));
    pad.lastElementChild!.setAttribute('style', 'padding-left:0');
    const slider = (label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number, unit: string): void => {
      const row = mk('div', 'row');
      const r = mk('input');
      r.type = 'range';
      r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(get());
      const n = mk('input');
      n.type = 'number';
      n.step = String(step); n.value = String(get());
      const apply = (v: number): void => { if (!Number.isFinite(v)) return; set(v); r.value = String(v); n.value = String(Math.round(v * 100) / 100); schedule(); };
      r.oninput = () => apply(Number(r.value));
      n.onchange = () => apply(Number(n.value));
      row.append(mk('label', '', `${label} ${unit}`), r, n);
      pad.append(row);
    };
    const hp = rec.hp ?? [0, 0.075, 0];
    const hr = rec.hr ?? [0, 0, 0];
    const setP = (i: number, v: number): void => { const a = [...(rec.hp ?? [0, 0.075, 0])] as [number, number, number]; a[i] = v / 100; rec = { ...rec, hp: a }; };
    const setR = (i: number, v: number): void => { const a = [...(rec.hr ?? [0, 0, 0])] as [number, number, number]; a[i] = v; rec = { ...rec, hr: a }; };
    slider('Lado', () => Math.round(hp[0] * 100), (v) => setP(0, v), -15, 15, 0.5, '(cm)');
    slider('Altura', () => Math.round(hp[1] * 100), (v) => setP(1, v), -15, 20, 0.5, '(cm)');
    slider('Frente', () => Math.round(hp[2] * 100), (v) => setP(2, v), -15, 15, 0.5, '(cm)');
    slider('Girar X', () => hr[0], (v) => setR(0, v), -180, 180, 1, '(°)');
    slider('Girar Y', () => hr[1], (v) => setR(1, v), -180, 180, 1, '(°)');
    slider('Girar Z', () => hr[2], (v) => setR(2, v), -180, 180, 1, '(°)');
    slider('Tamanho', () => Math.round((rec.hs ?? 1) * 100), (v) => { rec = { ...rec, hs: v / 100 }; }, 40, 220, 1, '(%)');
    pad.append(mk('div', 'hint', 'A cabeça nova fica presa ao osso da cabeça: acompanha o corpo e some na 1ª pessoa. Olhando de frente, ela deve cobrir o pescoço.'));
  }

  pad.append(mk('h2', '', 'Nome'));
  pad.lastElementChild!.setAttribute('style', 'padding-left:0');
  const nm = mk('input');
  nm.type = 'text';
  nm.maxLength = 24;
  nm.value = name;
  nm.oninput = () => { name = nm.value; };
  pad.append(nm);
  const btns = mk('div', 'row');
  btns.style.gridTemplateColumns = '1fr 1fr';
  const save = mk('button', 'go', editingId ? 'Salvar alterações' : 'Salvar para todos');
  save.disabled = !admin || busy;
  save.onclick = () => { void saveChar(false); };
  const copy = mk('button', '', 'Salvar como novo');
  copy.disabled = !admin || busy || !editingId;
  copy.onclick = () => { void saveChar(true); };
  btns.append(save, copy);
  pad.append(btns);
  const fresh = mk('button', '', 'Começar outro (limpar)');
  fresh.onclick = () => { rec = { head: 'Law1', torso: 'Law1', legs: 'Law1' }; name = 'Novo personagem'; editingId = null; buildList(); buildControls(); schedule(); };
  pad.append(fresh);
  ctl.append(pad, status);
}

// ---------- poses e câmera ----------
function buildBar(): void {
  const bar = $('poses');
  bar.textContent = '';
  for (const [id, label] of [['idle', 'Parado'], ['walk', 'Andando'], ['sprint', 'Correndo'], ['punch_1', 'Soco']] as const) {
    const b = mk('button', clip === id ? 'on' : '', label);
    b.onclick = () => { clip = id; if (animator?.has(id)) animator.play(id); buildBar(); };
    bar.append(b);
  }
  const pb = mk('button', paused ? 'on' : '', 'Pausar');
  pb.onclick = () => { paused = !paused; buildBar(); };
  bar.append(pb, mk('span', 'hint', '  Câmera:'));
  const cam = (label: string, pos: [number, number, number], target: [number, number, number]): void => {
    const b = mk('button', '', label);
    b.onclick = () => { camera.position.set(...pos); orbit.target.set(...target); };
    bar.append(b);
  };
  cam('Frente', [0, 1.1, 3.4], [0, 1, 0]);
  cam('Costas', [0, 1.1, -3.4], [0, 1, 0]);
  cam('Rosto', [0, 1.68, 1.1], [0, 1.66, 0]);
  cam('Corpo todo', [-1.6, 1.5, 3.2], [0, 1, 0]);
}

// ---------- cabeça 3D: enviar, deixar leve ----------
/** Deixa a cabeça leve: texturas até 512 px (quadradas ou não), materiais sem luz e um arquivo GLB novo. */
async function exportHead(url: string): Promise<Blob> {
  const g = await loadHeadModel(url);
  const clone = g.clone(true);
  let tris = 0;
  const jobs: Promise<void>[] = [];
  clone.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      const mb = mt as THREE.MeshBasicMaterial;
      const img = mb.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
      if (!mb.map || !img || !img.width) continue;
      const k = Math.min(1, 512 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = mb.map.flipY;
      t.wrapS = mb.map.wrapS;
      t.wrapT = mb.map.wrapT;
      mb.map = t;
    }
  });
  await Promise.all(jobs);
  if (tris > 9000) throw new Error(`Cabeça com ${Math.round(tris)} triângulos: o limite é 9000. Simplifique o modelo.`);
  const out = await new GLTFExporter().parseAsync(clone, { binary: true });
  const blob = new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' });
  if (blob.size > 2.8 * 1024 * 1024) throw new Error(`Arquivo de ${(blob.size / 1048576).toFixed(1)} MB: o limite é 2,8 MB. Reduza as texturas.`);
  return blob;
}

$<HTMLInputElement>('glb').onchange = (ev) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  void (async () => {
    try {
      say('Lendo a cabeça…', true);
      const id = rid('h_');
      const tmp = URL.createObjectURL(f);
      const light = await (async () => { registerLocalHead({ id, name: f.name.replace(/\.glb$/i, '').slice(0, 30) || 'Cabeça', url: tmp }); return exportHead(tmp); })();
      const url = URL.createObjectURL(light);
      forgetHead(id);
      registerLocalHead({ id, name: f.name.replace(/\.glb$/i, '').slice(0, 30) || 'Cabeça', url });
      localHeads.set(id, { file: light, name: headOf(id)!.name });
      rec = { ...rec, head: id, hp: [0, 0.075, 0], hr: [0, 0, 0], hs: 1 };
      buildList();
      buildControls();
      schedule();
      say(`Cabeça pronta (${(light.size / 1024).toFixed(0)} KB). Ajuste a posição e salve.`);
    } catch (e) { say((e as Error).message); }
  })();
};

async function deleteHead(id: string): Promise<void> {
  if (!supabase) return;
  if (customList().some((c) => c.recipe.head === id)) { say('Esta cabeça está em uso por um personagem salvo.'); return; }
  const def = headOf(id);
  const { error } = await supabase.from('custom_heads').delete().eq('id', id);
  if (error) { say(error.message); return; }
  const m = def?.url.match(/\/chars\/(heads\/[^?]+)/);
  if (m) await supabase.storage.from('chars').remove([m[1]!]);
  await loadCustom(true);
  if (rec.head === id) { rec = { ...rec, head: 'Law1' }; schedule(); }
  buildList();
  buildControls();
}

async function deleteChar(c: CustomChar): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('custom_characters').delete().eq('id', c.id);
  if (error) { say(error.message); return; }
  const m = c.face.match(/\/chars\/(faces\/[^?]+)/);
  if (m) await supabase.storage.from('chars').remove([m[1]!]);
  if (editingId === c.id) editingId = null;
  await loadCustom(true);
  buildList();
  buildControls();
  say('Personagem apagado.');
}

// ---------- foto do rosto e salvar ----------
function faceShot(): Promise<Blob> {
  const S = 256;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(S, S);
  r.setPixelRatio(1);
  r.setClearColor(0x41506b);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a94a8, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(1.5, 2.5, 4);
  sc.add(key);
  const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
  const body = obj!;
  const parent = body.parent;
  sc.add(body); // (tira da cena principal só durante a foto)
  body.updateMatrixWorld(true);
  const cy = 1.8 - 0.115; // mesmo enquadramento das fotos dos personagens do jogo (dev/face-shots.ts)
  cam.position.set(0, cy + 0.01, 1.25);
  cam.lookAt(0, cy, 0);
  r.render(sc, cam);
  return new Promise<Blob>((resolve, reject) => {
    r.domElement.toBlob((b) => {
      parent?.add(body);
      r.dispose();
      r.forceContextLoss();
      if (b) resolve(b); else reject(new Error('Não consegui gerar a foto.'));
    }, 'image/webp', 0.86);
  });
}

async function saveChar(asNew: boolean): Promise<void> {
  if (!supabase || !admin || busy) return;
  if (!obj) return;
  const nm = name.trim().slice(0, 24);
  if (!nm) { say('Dê um nome ao personagem.'); return; }
  busy = true;
  buildControls();
  try {
    say('Salvando…', true);
    const r: CharRecipe = JSON.parse(JSON.stringify(rec)) as CharRecipe;
    // cabeça nova ainda local: envia o arquivo e grava na biblioteca
    if (isHeadId(r.head) && localHeads.has(r.head)) {
      const lh = localHeads.get(r.head)!;
      const path = `heads/${r.head}.glb`;
      const up = await supabase.storage.from('chars').upload(path, lh.file, { contentType: 'model/gltf-binary', upsert: false, cacheControl: '31536000' });
      if (up.error) throw new Error(up.error.message);
      const url = supabase.storage.from('chars').getPublicUrl(path).data.publicUrl;
      const ins = await supabase.from('custom_heads').insert({ id: r.head, name: lh.name, url });
      if (ins.error) throw new Error(ins.error.message);
      localHeads.delete(r.head);
    }
    const face = await faceShot();
    const id = !asNew && editingId ? editingId : rid('c_');
    const fpath = `faces/${id}-${Date.now()}.webp`;
    const fu = await supabase.storage.from('chars').upload(fpath, face, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
    if (fu.error) throw new Error(fu.error.message);
    const face_url = supabase.storage.from('chars').getPublicUrl(fpath).data.publicUrl;
    const old = editingId && !asNew ? customList().find((c) => c.id === editingId)?.face.match(/\/chars\/(faces\/[^?]+)/)?.[1] : undefined;
    const row = await supabase.from('custom_characters').upsert({ id, name: nm, recipe: r, face_url }, { onConflict: 'id' });
    if (row.error) throw new Error(row.error.message);
    if (old) void supabase.storage.from('chars').remove([old]);
    editingId = id;
    await loadCustom(true);
    // a cabeça que acabou de subir passa a vir do servidor
    schedule();
    say(`"${nm}" salvo! Todos veem na seleção de personagens (atualize a página do jogo).`);
  } catch (e) {
    const m = (e as Error).message;
    say(/row-level security|permission|unauthorized/i.test(m) ? 'Sem permissão: só o administrador salva.' : /relation .* does not exist|bucket not found/i.test(m) ? 'O servidor ainda não tem as tabelas dos personagens (migração pendente).' : m);
  } finally {
    busy = false;
    buildList();
    buildControls();
  }
}

// ---------- início ----------
async function start(): Promise<void> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  admin = data.session ? await isAdmin() : false;
  await loadCustom();
  buildList();
  buildControls();
  buildBar();
  try {
    await rebuild();
    for (let i = 0; i < 60 && animator && !animator.has('sprint'); i++) await new Promise((r) => setTimeout(r, 120));
  } catch (e) { $('load').textContent = `Erro: ${(e as Error).message}`; return; }
  $('load').remove();
  requestAnimationFrame(frame);
  (window as unknown as { __chars: unknown }).__chars = {
    set: (r: CharRecipe) => { rec = r; buildList(); buildControls(); schedule(); },
    get: () => rec,
    obj: () => obj,
    face: async () => { const b = await faceShot(); return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); }); },
    setAdmin: (a: boolean) => { admin = a; buildList(); buildControls(); },
  };
}
void start();
