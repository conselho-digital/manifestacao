// Lojas no térreo de cada prédio: vitrine com um cartaz, porta, letreiro e toldo. O cartaz de cada vitrine é uma "vaga" com nome fixo
// (ex.: `N1_zp1` = prédio N1, lado +z, loja 1). Os cartazes ficam todos num ou mais atlas de textura (1 chamada de desenho por atlas).
// Sem imagem, a vaga mostra um cartaz de exemplo com o nome dela. Para pôr uma imagem: coloque o arquivo em `public/posters/` e
// liste-o em `public/posters/index.json` ({ "posters": { "N1_zp1": "N1_zp1.webp" } }) — ver `public/posters/LEIA.md`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { supabase } from '../net/supabase';

/** `bay` = largura da baia da parede do térreo (a conta da textura em city.ts), `col` = onde fica o centro da coluna dentro da baia (0 = na divisa), `shops` false = sem lojas (casas) */
export interface ShopBuilding { name: string; r: { x0: number; x1: number; z0: number; z1: number }; off: number; bay: number; col: number; shops?: boolean; /** altura da loja (m); padrão 7; casas: só o térreo (4,5) */ top?: number }
export interface PosterSlot { id: string; building: string; face: 'zp' | 'zn' | 'xp' | 'xn'; n: number; /** número do cartaz (1, 2, 3...): "Cartaz 01" */ num: number; x: number; z: number; nx: number; nz: number; page: number; cell: number; /** centro do cartaz no mundo (x, z) e altura */ cx: number; cz: number; cy: number; /** largura do cartaz (m) */ pw: number }

const POSTER_W = 3.0;
const POSTER_H = 2.0;
/** posição do cartaz no módulo da loja: w = para fora, y = centro (o centro ao longo da fachada, `pu`, depende da largura da loja) */
const PW = 0.4;
const PY = 2.0;
/** altura da loja: até embaixo da laje do térreo dos prédios (o térreo `plinth` tem 7 m) */
const TOP = 7.0;
const CELL_W = 256;
const CELL_H = 171; // 3:2, como o cartaz
const COLS = 8;
const ROWS = 11;
const PER_PAGE = COLS * ROWS;
const SIDES = [
  { k: 'zp', nx: 0, nz: 1 }, { k: 'zn', nx: 0, nz: -1 }, { k: 'xp', nx: 1, nz: 0 }, { k: 'xn', nx: -1, nz: 0 },
] as const;

export const POSTER_SLOTS: PosterSlot[] = [];
const numText = (n: number): string => String(n).padStart(2, '0');
/** nome mostrado ao jogador: "Cartaz 01", "Cartaz 02"... (o id interno, ex. N1_zn2, só vale para arquivos e servidor) */
export const posterName = (id: string): string => `Cartaz ${numText(slotById.get(id)?.num ?? 0)}`;

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Cartaz de exemplo da vaga: cores pelo nome, com o nome grande (é ele que você usa no nome do arquivo). */
function drawPlaceholder(g: CanvasRenderingContext2D, x: number, y: number, id: string, num: number): void {
  const h = hash(id);
  const hue = h % 360;
  const grad = g.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
  grad.addColorStop(0, `hsl(${hue} 70% 46%)`);
  grad.addColorStop(1, `hsl(${(hue + 50) % 360} 75% 30%)`);
  g.fillStyle = grad;
  g.fillRect(x, y, CELL_W, CELL_H);
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.beginPath();
  g.arc(x + CELL_W * 0.82, y + CELL_H * 0.2, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(x, y + CELL_H * 0.68, CELL_W, CELL_H * 0.32);
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 4;
  g.strokeRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText('CARTAZ', x + CELL_W / 2, y + 40);
  g.font = '800 64px system-ui, sans-serif';
  g.fillText(numText(num), x + CELL_W / 2, y + 94);
  g.font = '600 15px system-ui, sans-serif';
  g.fillText('1200 x 800 px (3:2)', x + CELL_W / 2, y + CELL_H - 24);
}

interface Page { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }

/** Pinta a imagem do cartaz na vaga (corta para preencher, 3:2). */
function drawImage(g: CanvasRenderingContext2D, x: number, y: number, img: HTMLImageElement): void {
  const k = Math.max(CELL_W / img.width, CELL_H / img.height);
  const w = img.width * k;
  const h = img.height * k;
  g.save();
  g.beginPath();
  g.rect(x, y, CELL_W, CELL_H);
  g.clip();
  g.drawImage(img, x + (CELL_W - w) / 2, y + (CELL_H - h) / 2, w, h);
  g.restore();
}

// ---------- imagens dos cartazes ----------
let pagesRef: Page[] = [];
let cityRef: THREE.Object3D | null = null;
const slotById = new Map<string, PosterSlot>();
/** imagem salva de cada vaga (arquivo de `public/posters` ou endereço do servidor) e prévia local (só para quem escolheu, ainda não salva) */
const savedUrl = new Map<string, string>();
/** arquivo fixo de `public/posters` e linha paga do servidor (preço pago, quando sai do ar); a paga vale enquanto não vence */
const staticUrl = new Map<string, string>();
interface Row { url: string; price: number; expires: number }
const dbRow = new Map<string, Row>();
const previewUrl = new Map<string, string>();
const effectiveUrl = (id: string): string | undefined => previewUrl.get(id) ?? savedUrl.get(id);

/** Redesenha a vaga no atlas: cartaz de exemplo e, por cima, a imagem (prévia ou salva), se houver. */
function redraw(slot: PosterSlot): void {
  const page = pagesRef[slot.page];
  if (!page) return;
  const g = page.canvas.getContext('2d')!;
  const x = (slot.cell % COLS) * CELL_W;
  const y = Math.floor(slot.cell / COLS) * CELL_H;
  drawPlaceholder(g, x, y, slot.id, slot.num);
  page.tex.needsUpdate = true;
  const url = effectiveUrl(slot.id);
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (effectiveUrl(slot.id) !== url) return; // trocou enquanto carregava
    drawImage(g, x, y, img);
    page.tex.needsUpdate = true;
  };
  img.src = url;
}

const SAFE_URL = /^(https:\/\/[^\s]+|\/posters\/[\w.-]{1,80})$/;
const liveRow = (id: string): Row | undefined => { const r = dbRow.get(id); return r && r.expires > Date.now() ? r : undefined; };
/** Recalcula o que a vaga mostra (linha paga ainda valendo, senão o arquivo fixo) e redesenha se mudou. */
function syncSaved(id: string): void {
  const slot = slotById.get(id);
  if (!slot) return;
  const url = liveRow(id)?.url ?? staticUrl.get(id);
  if (url === savedUrl.get(id)) return;
  if (url) savedUrl.set(id, url); else savedUrl.delete(id);
  redraw(slot);
  overlayKey.clear();
}
function setRow(id: string, row: { url?: unknown; price?: unknown; expires_at?: unknown } | null): void {
  if (row && typeof row.url === 'string' && SAFE_URL.test(row.url)) {
    const exp = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : Infinity;
    dbRow.set(id, { url: row.url, price: typeof row.price === 'number' ? Math.max(0, row.price) : 0, expires: Number.isFinite(exp) ? exp : Infinity });
  } else dbRow.delete(id);
  syncSaved(id);
}

/** Preço e prazo do cartaz no ar (ou `null` se a vaga está livre). */
export function posterInfo(id: string): { price: number; expires: number } | null { const r = liveRow(id); return r ? { price: r.price, expires: r.expires } : null; }
/** Menor valor para pôr uma imagem agora: $2 na vaga livre; com imagem no ar, mais que o valor pago por ela. */
export function posterMinPrice(id: string): number { const r = liveRow(id); return r ? Math.max(r.price + 1, FIRST_PRICE) : FIRST_PRICE; }
export const FIRST_PRICE = 2;

let listenersOn = false;
/** Lê os cartazes: arquivos de `public/posters/index.json` e, por cima, os pagos no servidor (ao vivo pelo Realtime; vencem em 24 h). */
async function loadPosters(): Promise<void> {
  try {
    const r = await fetch('/posters/index.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = (await r.json()) as { posters?: Record<string, unknown> };
      for (const [k, v] of Object.entries(j.posters ?? {})) if (typeof v === 'string' && /^[\w.-]{1,80}$/.test(v)) { staticUrl.set(k, `/posters/${v}`); syncSaved(k); }
    }
  } catch { /* sem índice */ }
  if (!supabase) return;
  try {
    const { data } = await supabase.from('posters').select('slot_id,url,price,expires_at');
    for (const row of (data ?? []) as { slot_id: string; url: string; price: number; expires_at: string | null }[]) setRow(row.slot_id, row);
  } catch { /* tabela ainda não existe: só os arquivos */ }
  if (listenersOn) return;
  listenersOn = true;
  supabase.channel('posters')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posters' }, (p) => {
      const n = p.new as { slot_id?: string; url?: string; price?: number; expires_at?: string };
      const o = p.old as { slot_id?: string };
      if (p.eventType === 'DELETE') { if (o.slot_id) setRow(o.slot_id, null); } else if (n.slot_id) setRow(n.slot_id, n);
    })
    .subscribe();
  // quem venceu (24 h) volta ao cartaz de exemplo sem precisar de aviso do servidor
  setInterval(() => { for (const id of dbRow.keys()) syncSaved(id); }, 10000);
}

/** Vaga de cartaz na frente da qual o jogador está (a menos de 4 m, de frente para a vitrine), ou null. `reach` > 1 alarga a zona (para não cancelar na borda). */
export function nearestPoster(x: number, z: number, reach = 1): PosterSlot | null {
  let best: PosterSlot | null = null;
  let bd = Infinity;
  for (const s of POSTER_SLOTS) {
    const dx = x - s.cx;
    const dz = z - s.cz;
    const d = dx * s.nx + dz * s.nz; // distância à frente do cartaz
    const lat = dx * s.nz - dz * s.nx; // ao longo da fachada
    if (d < 0.2 || d > 4.2 * reach || Math.abs(lat) > 2.6 * reach) continue;
    const dist = Math.hypot(d, lat);
    if (dist < bd) { bd = dist; best = s; }
  }
  return best;
}

/** Mostra uma imagem no cartaz SÓ para este jogador (prévia, ainda não salva); `null` desfaz e volta ao que está salvo. */
export function setPosterPreview(id: string, blob: Blob | null): void {
  const slot = slotById.get(id);
  if (!slot) return;
  const old = previewUrl.get(id);
  if (old) { URL.revokeObjectURL(old); previewUrl.delete(id); }
  if (blob) previewUrl.set(id, URL.createObjectURL(blob));
  redraw(slot);
  overlayKey.clear(); // força a revisão da imagem grande
}
export const hasPosterPreview = (id: string): boolean => previewUrl.has(id);
export const posterHasImage = (id: string): boolean => liveRow(id) !== undefined;

/** `reach` pequeno = "bem perto" (só aí aparece o preço): a ~2 m da vitrine, no meio do cartaz. */
export const CLOSE_REACH = 0.5;

/**
 * Envia a imagem (webp) com um nome novo e pede ao servidor a vaga (`claim_poster`): o servidor só aceita se `price` for maior que o valor
 * pago pela imagem que está no ar (ou ≥ $2 na vaga livre); o admin não paga. Retorna `{ error }` ou `{ ok: true }` (quem chama desconta o dinheiro).
 */
export async function savePoster(id: string, blob: Blob, price: number): Promise<{ ok: true } | { error: string }> {
  if (!supabase) return { error: 'Sem conexão com o servidor.' };
  if (!slotById.has(id)) return { error: 'Cartaz desconhecido.' };
  const path = `${id}/${Date.now()}.webp`;
  const up = await supabase.storage.from('posters').upload(path, blob, { upsert: false, contentType: blob.type || 'image/webp', cacheControl: '31536000' });
  if (up.error) return { error: /bucket not found|not found/i.test(up.error.message) ? 'O armazenamento de cartazes ainda não existe no servidor.' : /row-level security|permission|unauthorized|jwt/i.test(up.error.message) ? 'Entre com a sua conta para pôr um cartaz.' : up.error.message };
  const prev = savedUrl.get(id);
  const { data, error } = await supabase.rpc('claim_poster', { p_slot: id, p_path: path, p_price: Math.floor(price) });
  const res = data as { ok?: boolean; error?: string; min?: number; url?: string; price?: number; expires_at?: string } | null;
  if (error || !res?.ok) {
    void supabase.storage.from('posters').remove([path]); // arquivo que ninguém usa
    if (res?.error === 'preco') {
      const cur = liveRow(id);
      if (cur && typeof res.min === 'number') cur.price = Math.max(cur.price, res.min - 1); // alguém pagou mais enquanto você escolhia
      return { error: `Alguém pagou mais. O mínimo agora é $${res.min ?? '?'}.` };
    }
    if (res?.error === 'login') return { error: 'Entre com a sua conta para pôr um cartaz.' };
    return { error: error?.message ?? 'O servidor não aceitou o cartaz.' };
  }
  const old = previewUrl.get(id);
  if (old) { URL.revokeObjectURL(old); previewUrl.delete(id); }
  setRow(id, { url: res.url, price: res.price, expires_at: res.expires_at });
  // a imagem anterior deixa de ser usada: apaga o arquivo (o servidor só deixa apagar arquivo sem uso)
  const m = prev?.match(/\/posters\/([A-Za-z0-9_]+\/\d+\.webp)/);
  if (m) void supabase.storage.from('posters').remove([m[1]]);
  overlayKey.clear();
  return { ok: true };
}

/** Admin: tira o cartaz do ar (volta ao cartaz de exemplo). */
export async function clearPoster(id: string): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  const prev = dbRow.get(id)?.url.match(/\/posters\/([A-Za-z0-9_]+\/\d+\.webp)/);
  const { error } = await supabase.from('posters').delete().eq('slot_id', id);
  if (error) return /row-level security|permission/i.test(error.message) ? 'Sem permissão: só o administrador remove cartazes.' : error.message;
  if (prev) void supabase.storage.from('posters').remove([prev[1]]);
  setRow(id, null);
  return null;
}

// Cartaz em alta resolução: o atlas tem só 256 px por vaga; os 4 cartazes com imagem mais perto (até 28 m) ganham um plano com a imagem inteira.
const OVERLAYS = 4;
const overlays: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
const overlayKey = new Map<number, string>();
const texCache = new Map<string, THREE.Texture>();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
let overlayT = 0;

function overlayTexture(url: string, done: (t: THREE.Texture) => void): void {
  const hit = texCache.get(url);
  if (hit) { done(hit); return; }
  texLoader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (texCache.size >= 10) { const k = texCache.keys().next().value as string; texCache.get(k)?.dispose(); texCache.delete(k); }
    texCache.set(url, t);
    done(t);
  });
}

export function updatePosterOverlays(dt: number, px: number, pz: number): void {
  if (!cityRef) return;
  overlayT -= dt;
  if (overlayT > 0) return;
  overlayT = 0.35;
  const near = POSTER_SLOTS
    .filter((s) => effectiveUrl(s.id))
    .map((s) => ({ s, d: Math.hypot(s.cx - px, s.cz - pz) }))
    .filter((e) => e.d < 28)
    .sort((a, b) => a.d - b.d)
    .slice(0, OVERLAYS);
  for (let i = 0; i < OVERLAYS; i++) {
    let o = overlays[i];
    if (!o) {
      const mat = new THREE.MeshBasicMaterial({ transparent: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), mat);
      mesh.visible = false;
      cityRef.add(mesh);
      o = { mesh, mat };
      overlays[i] = o;
    }
    const e = near[i];
    if (!e) { o.mesh.visible = false; overlayKey.delete(i); continue; }
    const url = effectiveUrl(e.s.id)!;
    const key = `${e.s.id}|${url}`;
    if (overlayKey.get(i) === key) continue;
    overlayKey.set(i, key);
    o.mesh.position.set(e.s.cx + 0.01 * e.s.nx, e.s.cy, e.s.cz + 0.01 * e.s.nz);
    o.mesh.rotation.y = Math.atan2(e.s.nx, e.s.nz);
    o.mesh.scale.setScalar(e.s.pw / POSTER_W);
    o.mesh.visible = false;
    overlayTexture(url, (t) => {
      if (overlayKey.get(i) !== key) return;
      o!.mat.map = t;
      o!.mat.needsUpdate = true;
      o!.mesh.visible = true;
    });
  }
}

const mat = (c: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c });
const AWNINGS = [0xc0392b, 0x2e7d4f, 0x2b5fa8, 0xe0a82e, 0x7a3b8c];

// ---------- aparência das lojas: interior pintado atrás do vidro e letreiro com o nome ----------
const KINDS = 8;
const NAMES = [
  'MODA URBANA', 'FASHION CENTER', 'TECH ZONE', 'ELETRO MAIS', 'CAFÉ CENTRAL', 'PADARIA DO BAIRRO', 'MERCADO PAULISTA', 'EMPÓRIO',
  'LIVRARIA', 'PAPELARIA', 'FARMÁCIA', 'ÓTICA', 'PIZZARIA', 'LANCHES & CIA', 'CALÇADOS', 'ESPORTES',
];
const ACCENT = ['#8e44ad', '#2b86c5', '#a0522d', '#2e7d4f', '#b9770e', '#1e9e8a', '#c0392b', '#d35400'];
const INT_W = 512;
const INT_H = 256;
const SIGN_W = 512;
const SIGN_H = 64;

function rng(seed: number): () => number { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }

function drawInterior(g: CanvasRenderingContext2D, x: number, y: number, kind: number): void {
  const r = rng(kind * 7919 + 13);
  const wall = ['#cfc8bd', '#2b3340', '#c9a77c', '#e7ecd6', '#5a3b2a', '#f1f5f5', '#8a2a1f', '#e8e1d6'][kind];
  const floor = ['#8a7b6a', '#3a3f48', '#6b4a32', '#b9b2a2', '#4a3426', '#d4d8da', '#4a4a4a', '#9a8b78'][kind];
  g.save();
  g.beginPath();
  g.rect(x, y, INT_W, INT_H);
  g.clip();
  g.fillStyle = wall;
  g.fillRect(x, y, INT_W, INT_H);
  g.fillStyle = floor;
  g.fillRect(x, y + INT_H * 0.8, INT_W, INT_H * 0.2);
  const sh = g.createLinearGradient(0, y + INT_H * 0.8, 0, y + INT_H);
  sh.addColorStop(0, 'rgba(255,255,255,.22)');
  sh.addColorStop(1, 'rgba(0,0,0,.15)');
  g.fillStyle = sh;
  g.fillRect(x, y + INT_H * 0.8, INT_W, INT_H * 0.2);
  g.fillStyle = '#e9e5dc';
  g.fillRect(x, y, INT_W, 20);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#fffbe6'; g.fillRect(x + 30 + i * 82, y + 7, 52, 6); }
  const box = (c: string, bx: number, by: number, bw: number, bh: number): void => { g.fillStyle = c; g.fillRect(x + bx, y + by, bw, bh); };
  const rows = (ys: number[], colors: string[], w0: number, h0: number): void => {
    for (const yy of ys) {
      box('rgba(0,0,0,.35)', 10, yy + h0, INT_W - 20, 4);
      for (let bx = 14; bx < INT_W - 24; bx += w0 + 3) box(colors[Math.floor(r() * colors.length)], bx, yy + h0 * (0.4 + 0.6 * r()) * 0.4, w0, h0 * (0.6 + 0.4 * r()));
    }
  };
  if (kind === 0) { // moda: araras com roupas e manequins
    for (const yy of [78, 138]) {
      box('#555', 10, yy, INT_W - 20, 3);
      for (let bx = 18; bx < INT_W - 30; bx += 17) box(['#2c3e50', '#c0392b', '#ecf0f1', '#8e44ad', '#27ae60', '#f1c40f'][Math.floor(r() * 6)], bx, yy + 3, 13, 40 + r() * 14);
    }
    for (const mx of [90, 250, 420]) { g.fillStyle = '#ddd'; g.beginPath(); g.arc(x + mx, y + 150, 9, 0, 7); g.fill(); box('#bbb', mx - 12, 160, 24, 36); box('#999', mx - 2, 196, 4, 8); }
  } else if (kind === 1) { // tecnologia: prateleiras, telas
    rows([66, 118, 170], ['#111', '#222', '#334', '#445'], 30, 34);
    const sg = g.createLinearGradient(x, y + 80, x + 150, y + 150);
    sg.addColorStop(0, '#2b8cff');
    sg.addColorStop(1, '#7b3cff');
    g.fillStyle = sg;
    g.fillRect(x + 180, y + 70, 150, 84);
  } else if (kind === 2) { // café: balcão, máquina, lâmpadas
    box('#3b2a1e', 20, 24, 150, 60); box('#f4e9d8', 28, 34, 134, 4);
    for (const lx of [90, 230, 380]) { box('#222', lx, 20, 2, 36); g.fillStyle = '#ffd98a'; g.beginPath(); g.arc(x + lx + 1, y + 62, 12, 0, 7); g.fill(); }
    box('#5a3c28', 0, 160, INT_W, 56); box('#a9774e', 0, 156, INT_W, 8); box('#999', 300, 118, 46, 38); box('#222', 310, 126, 26, 12);
    for (const cx of [60, 110, 160]) box('#fff', cx, 146, 12, 10);
  } else if (kind === 3) { // mercado: gôndolas coloridas
    rows([46, 98, 150], ['#e74c3c', '#f1c40f', '#27ae60', '#3498db', '#ecf0f1', '#e67e22'], 20, 40);
  } else if (kind === 4) { // livraria: estantes cheias
    rows([40, 92, 144], ['#c0392b', '#2c3e50', '#f1c40f', '#16a085', '#ecf0f1', '#8e44ad', '#d35400'], 9, 44);
  } else if (kind === 5) { // farmácia: prateleiras brancas e cruz verde
    rows([84, 134], ['#ffffff', '#27ae60', '#3498db', '#ecf0f1'], 22, 34);
    box('#27ae60', 236, 30, 40, 12); box('#27ae60', 250, 16, 12, 40);
  } else if (kind === 6) { // pizzaria: forno e balcão
    box('#c0392b', 0, 156, INT_W, 56); for (let bx = 0; bx < INT_W; bx += 32) box('#fff', bx, 156, 16, 56);
    box('#b34a1c', 330, 60, 130, 96); g.fillStyle = '#ff9a2e'; g.beginPath(); g.arc(x + 395, y + 130, 36, Math.PI, 0); g.fill();
    for (const px of [60, 140, 220]) { g.fillStyle = '#e8b25a'; g.beginPath(); g.arc(x + px, y + 80, 28, 0, 7); g.fill(); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x + px, y + 80, 20, 0, 7); g.fill(); }
  } else { // calçados: tênis na parede e banco
    for (const yy of [60, 106, 152]) { box('#777', 10, yy + 22, INT_W - 20, 3); for (let bx = 20; bx < INT_W - 50; bx += 44) { g.fillStyle = ['#e74c3c', '#2c3e50', '#ecf0f1', '#f1c40f', '#27ae60'][Math.floor(r() * 5)]; g.beginPath(); g.ellipse(x + bx + 18, y + yy + 12, 18, 9, 0, 0, 7); g.fill(); } }
    box('#6b4a32', 180, 188, 150, 14);
  }
  g.restore();
}

function drawSign(g: CanvasRenderingContext2D, x: number, y: number, name: string, accent: string): void {
  g.fillStyle = '#f4f1ea';
  g.fillRect(x, y, SIGN_W, SIGN_H);
  g.fillStyle = accent;
  g.fillRect(x, y + SIGN_H - 8, SIGN_W, 8);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#2a2d33';
  let size = 40;
  g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(name).width > SIGN_W - 40 && size > 14) { size -= 2; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillText(name, x + SIGN_W / 2, y + (SIGN_H - 8) / 2 + 2);
}

function atlasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** põe o UV de um plano na célula (col, row) de um atlas */
function cellUV(pg: THREE.BufferGeometry, col: number, row: number, cw: number, ch: number, W: number, H: number, vBot = 1): void {
  const uv = pg.getAttribute('uv') as THREE.BufferAttribute;
  const eps = 0.5;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (col * cw + eps + uv.getX(k) * (cw - 2 * eps)) / W, 1 - (row * ch + eps + (1 - uv.getY(k)) * (ch * vBot - 2 * eps)) / H);
  }
}

/**
 * Põe lojas nos lados livres de cada prédio (lados que dão para rua, calçada ou praça). `bounds` = limite jogável (metade da largura e do fundo).
 * Cada loja (6,2 m): base de pedra, pilastras escuras, vitrine de vidro com o interior pintado atrás (8 tipos: moda, tecnologia, café, mercado, livraria,
 * farmácia, pizzaria, calçados), porta dupla, toldo fino colorido, letreiro branco com o nome e o cartaz (3 x 2 m) na vitrine.
 * Não usa o gerador aleatório da cidade (árvores e fachadas continuam nos mesmos lugares) e não cria colisão.
 */
export function addShops(city: THREE.Object3D, buildings: ShopBuilding[], bounds: { hx: number; hz: number }): void {
  POSTER_SLOTS.length = 0;
  const free = (x: number, z: number, self: ShopBuilding): boolean => {
    if (Math.abs(x) > bounds.hx - 2 || Math.abs(z) > bounds.hz - 2) return false;
    return !buildings.some((o) => o !== self && x > o.r.x0 - o.off - 0.6 && x < o.r.x1 + o.off + 0.6 && z > o.r.z0 - o.off - 0.6 && z < o.r.z1 + o.off + 0.6);
  };
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const push = (k: string, g: THREE.BufferGeometry): void => { (groups.get(k) ?? groups.set(k, []).get(k)!).push(g); };
  const posterGeos: THREE.BufferGeometry[][] = [];
  const interiorGeos: THREE.BufferGeometry[] = [];
  const signGeos: THREE.BufferGeometry[] = [];

  for (const b of buildings) {
    if (b.shops === false) continue;
    const top = b.top ?? TOP;
    for (const s of SIDES) {
      const alongX = s.nz !== 0;
      const L0 = alongX ? b.r.x1 - b.r.x0 : b.r.z1 - b.r.z0;
      const L = L0 + 2 * b.off; // comprimento da parede do térreo (a que tem as colunas)
      const cx = (b.r.x0 + b.r.x1) / 2;
      const cz = (b.r.z0 + b.r.z1) / 2;
      const face = alongX ? (s.nz > 0 ? b.r.z1 : b.r.z0) + s.nz * b.off : (s.nx > 0 ? b.r.x1 : b.r.x0) + s.nx * b.off;
      // o lado tem de dar para um espaço livre (3 m à frente, em 3 pontos)
      const probe = (t: number): boolean => (alongX ? free(cx + t, face + s.nz * 3, b) : free(face + s.nx * 3, cz + t, b));
      if (!(probe(0) && probe(-L0 * 0.3) && probe(L0 * 0.3))) continue;
      // GRADE DE COLUNAS (como células de planilha): a parede tem `nb` baias iguais (mesma conta da textura em city.ts: round(L / baia)) e cada loja
      // ocupa DUAS baias, de uma coluna do prédio até duas colunas depois. `c` = onde fica o centro da coluna dentro da baia (0 = na divisa).
      const nb = Math.max(1, Math.round(L / b.bay));
      const bw = L / nb;
      const c = b.col * bw;
      const count = Math.floor(nb / 2);
      if (count < 1) continue;
      // sentido do eixo u da textura = eixo local da loja (zp +x, zn -x, xp -z, xn +z)
      const dir = s.k === 'zp' || s.k === 'xn' ? 1 : -1;
      const start = alongX ? (dir > 0 ? cx - L / 2 : cx + L / 2) : (dir > 0 ? cz - L / 2 : cz + L / 2);
      const theta = Math.atan2(s.nx, s.nz);
      for (let i = 0; i < count; i++) {
        const uA = 2 * i * bw + c;
        const uB = Math.min(L, (2 * i + 2) * bw + c);
        const W = uB - uA; // largura desta loja
        const along = start + dir * ((uA + uB) / 2);
        const px = alongX ? along : face;
        const pz = alongX ? face : along;
        const id = `${b.name}_${s.k}${i + 1}`;
        const hh = hash(id);
        const kind = hh % KINDS;
        const nameIdx = kind * 2 + ((hh >>> 8) & 1);
        // medidas da loja: Wi = vão entre as pilastras; porta dupla à direita, vitrine (com o cartaz) à esquerda
        const Wi = W - 0.6;
        const dw = Math.min(2.4, Wi * 0.36);
        const ww = Wi - dw - 0.12;
        const um = -Wi / 2 + ww + 0.06; // divisória janela/porta
        const ud = um + 0.06 + dw / 2; // centro da porta
        const pu = -Wi / 2 + ww / 2; // centro do cartaz
        const pw = Math.min(3.75, ww - 0.5);
        const ph = pw / 1.5;
        const slotIndex = POSTER_SLOTS.length;
        const page = Math.floor(slotIndex / PER_PAGE);
        const cell = slotIndex % PER_PAGE;
        POSTER_SLOTS.push({ id, building: b.name, face: s.k, n: i + 1, num: slotIndex + 1, x: px, z: pz, nx: s.nx, nz: s.nz, page, cell, cx: px + pu * s.nz + PW * s.nx, cz: pz - pu * s.nx + PW * s.nz, cy: PY, pw });
        // peça no espaço da loja (u ao longo da fachada, y para cima, w para fora) → mundo
        const put = (g: THREE.BufferGeometry, u: number, y: number, w: number): THREE.BufferGeometry => {
          g.translate(u, y, w);
          g.rotateY(theta);
          g.translate(px, 0, pz);
          return g;
        };
        const box = (k: string, bw2: number, bh: number, bd: number, u: number, y: number, w: number): void => { push(k, put(new THREE.BoxGeometry(bw2, bh, bd), u, y + bh / 2, w)); };
        // base de pedra e pilastras escuras: a da esquerda fica em cima da coluna do prédio; a da direita só na última loja (nas outras é a da vizinha)
        box('plinth', W, 0.6, 0.5, 0, 0, 0.27);
        const inL = Math.max(0, 0.2 - uA);
        const inR = Math.max(0, 0.2 - (L - uB));
        box('frame', 0.4, top - 0.6, 0.5, -W / 2 + inL, 0.6, 0.27);
        if (i === count - 1) box('frame', 0.4, top - 0.6, 0.5, W / 2 - inR, 0.6, 0.27);
        // interior pintado atrás do vidro
        const ip = new THREE.PlaneGeometry(Wi, 2.8);
        cellUV(ip, kind % 2, Math.floor(kind / 2), INT_W, INT_H, INT_W * 2, INT_H * 4);
        interiorGeos.push(put(ip, 0, 2.0, 0.1));
        // vidro (janela e porta), travessa do alto, divisória entre janela e porta e porta dupla
        box('glass', Wi, 2.8, 0.04, 0, 0.6, 0.38);
        box('frame', Wi, 0.16, 0.12, 0, 3.4, 0.4);
        box('frame', 0.12, 2.8, 0.12, um, 0.6, 0.4);
        box('frame', 0.1, 2.5, 0.1, ud, 0.6, 0.4);
        box('frame', dw, 0.1, 0.1, ud, 3.0, 0.4);
        box('metal', 0.05, 0.5, 0.06, ud - 0.1, 1.0, 0.46);
        box('metal', 0.05, 0.5, 0.06, ud + 0.1, 1.0, 0.46);
        // vitrine de cima (1º andar): outro interior pintado, até embaixo da laje do térreo (top); casas (top baixo) ficam só com o térreo
        if (top >= 6) {
          const up = new THREE.PlaneGeometry(Wi, 2.2);
          const uk = (kind + 3) % KINDS;
          cellUV(up, uk % 2, Math.floor(uk / 2), INT_W, INT_H, INT_W * 2, INT_H * 4, 0.8);
          interiorGeos.push(put(up, 0, 5.8, 0.1));
          box('glass', Wi, 2.2, 0.04, 0, 4.7, 0.38);
          box('frame', Wi, 0.2, 0.12, 0, 4.5, 0.4);
          box('frame', Wi, 0.12, 0.12, 0, top - 0.12, 0.4);
          box('frame', 0.12, 2.2, 0.12, -Wi * 0.18, 4.7, 0.4);
          box('frame', 0.12, 2.2, 0.12, Wi * 0.18, 4.7, 0.4);
        }
        // letreiro branco com o nome e toldo fino colorido
        box('signbox', W, 0.95, 0.34, 0, 3.55, 0.3);
        const sw = Math.min(W - 0.6, 7.0);
        const sp = new THREE.PlaneGeometry(sw, sw * (SIGN_H / SIGN_W));
        cellUV(sp, nameIdx % 2, Math.floor(nameIdx / 2), SIGN_W, SIGN_H, SIGN_W * 2, SIGN_H * 8);
        signGeos.push(put(sp, 0, 4.03, 0.48));
        box(`awn${hh % AWNINGS.length}`, W - 0.5, 0.1, 0.75, 0, 3.42, 0.7);
        // cartaz (atlas) na vitrine
        const pg = new THREE.PlaneGeometry(pw, ph);
        cellUV(pg, cell % COLS, Math.floor(cell / COLS), CELL_W, CELL_H, COLS * CELL_W, ROWS * CELL_H);
        put(pg, pu, PY, PW);
        (posterGeos[page] ??= []).push(pg);
      }
    }
  }

  const colors: Record<string, number> = { frame: 0x34353a, plinth: 0x4a4c52, metal: 0xc9ccd1, signbox: 0xf4f1ea };
  AWNINGS.forEach((c, i) => { colors[`awn${i}`] = c; });
  for (const [k, list] of groups) {
    const geo = mergeGeometries(list, false);
    if (!geo) continue;
    const material = k === 'glass'
      ? new THREE.MeshLambertMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.2, depthWrite: false })
      : mat(colors[k] ?? 0x888888);
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = k !== 'glass';
    if (k === 'glass') m.renderOrder = 2;
    city.add(m);
  }

  // interiores e letreiros: um atlas de canvas cada (1 chamada de desenho cada)
  const intCanvas = document.createElement('canvas');
  intCanvas.width = INT_W * 2;
  intCanvas.height = INT_H * 4;
  const ig = intCanvas.getContext('2d')!;
  for (let k = 0; k < KINDS; k++) drawInterior(ig, (k % 2) * INT_W, Math.floor(k / 2) * INT_H, k);
  const signCanvas = document.createElement('canvas');
  signCanvas.width = SIGN_W * 2;
  signCanvas.height = SIGN_H * 8;
  const sg = signCanvas.getContext('2d')!;
  NAMES.forEach((nm, k) => drawSign(sg, (k % 2) * SIGN_W, Math.floor(k / 2) * SIGN_H, nm, ACCENT[Math.floor(k / 2)]));
  for (const [list, canvas] of [[interiorGeos, intCanvas], [signGeos, signCanvas]] as const) {
    const geo = mergeGeometries(list as THREE.BufferGeometry[], false);
    if (geo) city.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlasTexture(canvas) })));
  }

  // atlas de cartazes: cartaz de exemplo em todas as vagas (as imagens publicadas entram por cima)
  const pages: Page[] = [];
  posterGeos.forEach((list, p) => {
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#222';
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (const slot of POSTER_SLOTS) if (slot.page === p) drawPlaceholder(g, (slot.cell % COLS) * CELL_W, Math.floor(slot.cell / COLS) * CELL_H, slot.id, slot.num);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    pages.push({ canvas, tex });
    const geo = mergeGeometries(list, false);
    if (!geo) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    city.add(m);
  });
  pagesRef = pages;
  cityRef = city;
  slotById.clear();
  for (const sl of POSTER_SLOTS) slotById.set(sl.id, sl);
  void loadPosters();
  if (import.meta.env.DEV) (window as unknown as { __posterSlots: PosterSlot[] }).__posterSlots = POSTER_SLOTS;
}
