// Lojas no térreo de cada prédio: vitrine com um cartaz, porta, letreiro e toldo. O cartaz de cada vitrine é uma "vaga" com nome fixo
// (ex.: `N1_zp1` = prédio N1, lado +z, loja 1). Os cartazes ficam todos num ou mais atlas de textura (1 chamada de desenho por atlas).
// Sem imagem, a vaga mostra um cartaz de exemplo com o nome dela. Para pôr uma imagem: coloque o arquivo em `public/posters/` e
// liste-o em `public/posters/index.json` ({ "posters": { "N1_zp1": "N1_zp1.webp" } }) — ver `public/posters/LEIA.md`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { supabase } from '../net/supabase';

export interface ShopBuilding { name: string; r: { x0: number; x1: number; z0: number; z1: number }; off: number }
export interface PosterSlot { id: string; building: string; face: 'zp' | 'zn' | 'xp' | 'xn'; n: number; x: number; z: number; nx: number; nz: number; page: number; cell: number; /** centro do cartaz no mundo (x, z) e altura */ cx: number; cz: number; cy: number }

const SHOP_W = 6.2; // largura de cada loja (pilastras, vitrine e porta)
const GAP = 0.4;
const POSTER_W = 3.6;
const POSTER_H = 2.4;
const CELL_W = 256;
const CELL_H = 171; // 3:2, como o cartaz
const COLS = 8;
const ROWS = 11;
const PER_PAGE = COLS * ROWS;
const SIDES = [
  { k: 'zp', nx: 0, nz: 1 }, { k: 'zn', nx: 0, nz: -1 }, { k: 'xp', nx: 1, nz: 0 }, { k: 'xn', nx: -1, nz: 0 },
] as const;

export const POSTER_SLOTS: PosterSlot[] = [];

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Cartaz de exemplo da vaga: cores pelo nome, com o nome grande (é ele que você usa no nome do arquivo). */
function drawPlaceholder(g: CanvasRenderingContext2D, x: number, y: number, id: string): void {
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
  let size = 44;
  g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(id).width > CELL_W - 36 && size > 16) { size -= 2; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillText(id, x + CELL_W / 2, y + 94);
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
const previewUrl = new Map<string, string>();
const effectiveUrl = (id: string): string | undefined => previewUrl.get(id) ?? savedUrl.get(id);

/** Redesenha a vaga no atlas: cartaz de exemplo e, por cima, a imagem (prévia ou salva), se houver. */
function redraw(slot: PosterSlot): void {
  const page = pagesRef[slot.page];
  if (!page) return;
  const g = page.canvas.getContext('2d')!;
  const x = (slot.cell % COLS) * CELL_W;
  const y = Math.floor(slot.cell / COLS) * CELL_H;
  drawPlaceholder(g, x, y, slot.id);
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
function setSaved(id: string, url: string | null): void {
  const slot = slotById.get(id);
  if (!slot) return;
  if (url && SAFE_URL.test(url)) savedUrl.set(id, url); else savedUrl.delete(id);
  redraw(slot);
}

/** Lê os cartazes: arquivos de `public/posters/index.json` e, por cima, os que o admin salvou no servidor (ao vivo pelo Realtime). */
async function loadPosters(): Promise<void> {
  try {
    const r = await fetch('/posters/index.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = (await r.json()) as { posters?: Record<string, unknown> };
      for (const [k, v] of Object.entries(j.posters ?? {})) if (typeof v === 'string' && /^[\w.-]{1,80}$/.test(v)) setSaved(k, `/posters/${v}`);
    }
  } catch { /* sem índice */ }
  if (!supabase) return;
  try {
    const { data } = await supabase.from('posters').select('slot_id,url');
    for (const row of (data ?? []) as { slot_id: string; url: string }[]) setSaved(row.slot_id, row.url);
  } catch { /* tabela ainda não existe: só os arquivos */ }
  supabase.channel('posters')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posters' }, (p) => {
      const n = p.new as { slot_id?: string; url?: string };
      const o = p.old as { slot_id?: string };
      if (p.eventType === 'DELETE') { if (o.slot_id) setSaved(o.slot_id, null); } else if (n.slot_id && typeof n.url === 'string') setSaved(n.slot_id, n.url);
    })
    .subscribe();
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
export const posterHasImage = (id: string): boolean => savedUrl.has(id);

/** Admin: envia a imagem (webp) da vaga para o servidor e grava o endereço; todos passam a ver. Retorna a mensagem de erro, se houver. */
export async function savePoster(id: string, blob: Blob): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  if (!slotById.has(id)) return 'Cartaz desconhecido.';
  const path = `${id}.webp`;
  const up = await supabase.storage.from('posters').upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (up.error) return /bucket not found|not found/i.test(up.error.message) ? 'O armazenamento de cartazes ainda não existe no servidor.' : /row-level security|permission|unauthorized/i.test(up.error.message) ? 'Sem permissão: só o administrador salva cartazes.' : up.error.message;
  const url = `${supabase.storage.from('posters').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from('posters').upsert({ slot_id: id, url }, { onConflict: 'slot_id' });
  if (error) return /row-level security|permission/i.test(error.message) ? 'Sem permissão: só o administrador salva cartazes.' : error.message;
  const old = previewUrl.get(id);
  if (old) { URL.revokeObjectURL(old); previewUrl.delete(id); }
  setSaved(id, url);
  overlayKey.clear();
  return null;
}

/** Admin: tira o cartaz salvo (volta ao cartaz de exemplo). */
export async function clearPoster(id: string): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  await supabase.storage.from('posters').remove([`${id}.webp`]);
  const { error } = await supabase.from('posters').delete().eq('slot_id', id);
  if (error) return /row-level security|permission/i.test(error.message) ? 'Sem permissão: só o administrador apaga cartazes.' : error.message;
  setSaved(id, null);
  overlayKey.clear();
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

/**
 * Põe lojas nos lados livres de cada prédio (lados que dão para rua, calçada ou praça). `bounds` = limite jogável (metade da largura e do fundo).
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

  for (const b of buildings) {
    for (const s of SIDES) {
      const alongX = s.nz !== 0;
      const L = alongX ? b.r.x1 - b.r.x0 : b.r.z1 - b.r.z0;
      const cx = (b.r.x0 + b.r.x1) / 2;
      const cz = (b.r.z0 + b.r.z1) / 2;
      const face = alongX ? (s.nz > 0 ? b.r.z1 : b.r.z0) + s.nz * b.off : (s.nx > 0 ? b.r.x1 : b.r.x0) + s.nx * b.off;
      // o lado tem de dar para um espaço livre (3 m à frente, em 3 pontos)
      const probe = (t: number): boolean => (alongX ? free(cx + t, face + s.nz * 3, b) : free(face + s.nx * 3, cz + t, b));
      if (!(probe(0) && probe(-L * 0.3) && probe(L * 0.3))) continue;
      const n = Math.min(4, Math.floor((L - 2 + GAP) / (SHOP_W + GAP)));
      if (n < 1) continue;
      const theta = Math.atan2(s.nx, s.nz);
      for (let i = 0; i < n; i++) {
        const u0 = (i - (n - 1) / 2) * (SHOP_W + GAP); // centro da loja ao longo da fachada
        const px = alongX ? cx + u0 : face;
        const pz = alongX ? face : cz + u0;
        const id = `${b.name}_${s.k}${i + 1}`;
        const slotIndex = POSTER_SLOTS.length;
        const page = Math.floor(slotIndex / PER_PAGE);
        const cell = slotIndex % PER_PAGE;
        POSTER_SLOTS.push({ id, building: b.name, face: s.k, n: i + 1, x: px, z: pz, nx: s.nx, nz: s.nz, page, cell, cx: px - 1.2 * s.nz + 0.13 * s.nx, cz: pz + 1.2 * s.nx + 0.13 * s.nz, cy: 1.95 });
        // peça no espaço da loja (u ao longo da fachada, y para cima, w para fora) → mundo
        const put = (g: THREE.BufferGeometry, u: number, y: number, w: number): THREE.BufferGeometry => {
          g.translate(u, y, w);
          g.rotateY(theta);
          g.translate(px, 0, pz);
          return g;
        };
        const box = (k: string, bw: number, bh: number, bd: number, u: number, y: number, w: number): void => { push(k, put(new THREE.BoxGeometry(bw, bh, bd), u, y + bh / 2, w)); };
        // pilastras (esquerda, meio e direita), vitrine, porta, letreiro e toldo
        box('frame', 0.3, 3.9, 0.3, -SHOP_W / 2 + 0.15, 0, 0.12);
        box('frame', 0.3, 3.9, 0.3, 0.8, 0, 0.12);
        box('frame', 0.3, 3.9, 0.3, SHOP_W / 2 - 0.15, 0, 0.12);
        box('glass', 4.2, 2.7, 0.1, -1.2, 0.6, 0.06);
        box('frame', 4.2, 0.6, 0.2, -1.2, 0, 0.1); // peitoril
        box('door', 1.1, 2.4, 0.1, 2.15, 0, 0.06);
        box('sign', SHOP_W - 0.3, 0.7, 0.18, 0, 3.9, 0.12);
        box(`awn${hash(id) % AWNINGS.length}`, SHOP_W - 0.2, 0.12, 0.95, 0, 3.55, 0.5);
        // cartaz (atlas)
        const pg = new THREE.PlaneGeometry(POSTER_W, POSTER_H);
        const uv = pg.getAttribute('uv') as THREE.BufferAttribute;
        const col = cell % COLS;
        const row = Math.floor(cell / COLS);
        const eps = 0.5;
        const W = COLS * CELL_W;
        const H = ROWS * CELL_H;
        for (let k = 0; k < uv.count; k++) {
          const u = uv.getX(k);
          const v = uv.getY(k);
          uv.setXY(k, (col * CELL_W + eps + u * (CELL_W - 2 * eps)) / W, 1 - (row * CELL_H + eps + (1 - v) * (CELL_H - 2 * eps)) / H);
        }
        put(pg, -1.2, 0.6 + 1.35, 0.13);
        (posterGeos[page] ??= []).push(pg);
      }
    }
  }

  const colors: Record<string, number> = { frame: 0x3b3a3f, glass: 0x1f3042, door: 0x1b1b1d, sign: 0xf0e9d6 };
  AWNINGS.forEach((c, i) => { colors[`awn${i}`] = c; });
  for (const [k, list] of groups) {
    const geo = mergeGeometries(list, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat(colors[k] ?? 0x888888));
    m.receiveShadow = true;
    city.add(m);
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
    for (const slot of POSTER_SLOTS) if (slot.page === p) drawPlaceholder(g, (slot.cell % COLS) * CELL_W, Math.floor(slot.cell / COLS) * CELL_H, slot.id);
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
