import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ArmedMode = Armed;

import { rifleGeo, RIFLE_KINDS, type RifleKind } from './rifles';
import { EXTRA_MELEE_KEYS, isBatLike, type Animator, type Armed, type ExtraMelee } from './anim';

const loader = new GLTFLoader();
let rifleSrc: Promise<THREE.Object3D> | null = null;
export const loadRifle = (): Promise<THREE.Object3D> => (rifleSrc ??= loader.loadAsync('/models/weapons/AK47.glb').then((g) => g.scene));

const rifleSrcs = new Map<RifleKind, Promise<THREE.Object3D>>();
/** Modelo do fuzil (AK-47, M4A1, M16 ou Honey Badger). */
export const loadRifleKind = (k: RifleKind): Promise<THREE.Object3D> => {
  if (k === 'ak') return loadRifle();
  let p = rifleSrcs.get(k);
  if (!p) { p = loader.loadAsync(`/models/weapons/${rifleGeo(k).file}`).then((g) => g.scene); rifleSrcs.set(k, p); }
  return p;
};

let pistolSrc: Promise<THREE.Object3D> | null = null;
/** Revólver Python .357 (enviado pelo dono do projeto, convertido de DFF/TXD): 36 cm, cano para +X, origem na traseira. */
export const loadPistol = (): Promise<THREE.Object3D> => (pistolSrc ??= loader.loadAsync('/models/weapons/python357.glb').then((g) => g.scene));
/** Boca do cano da pistola no espaço da arma (medida no modelo já posicionado na mão). */
export const PISTOL_FLASH = new THREE.Vector3(0, 0.091, 0.19);

let flagSrc: Promise<THREE.Object3D> | null = null;
export const loadFlag = (): Promise<THREE.Object3D> => (flagSrc ??= loader.loadAsync('/models/weapons/flag-turkey.glb').then((g) => g.scene));

let cricketSrc: Promise<THREE.Object3D> | null = null;
export const loadCricket = (): Promise<THREE.Object3D> => (cricketSrc ??= loader.loadAsync('/models/weapons/cricket-bat.glb').then((g) => g.scene));

let baseballSrc: Promise<THREE.Object3D> | null = null;
export const loadBaseball = (): Promise<THREE.Object3D> => (baseballSrc ??= loader.loadAsync('/models/weapons/baseball-bat.glb').then((g) => g.scene));

/** Armas brancas do pacote: arquivo, ponto do cabo onde a mão direita segura (eixo Y do modelo, m) e escala. */
export const EXTRA_MELEE: Record<ExtraMelee, { file: string; grip: number; scale: number; /** giro em volta do cabo (rad) para a lâmina apontar para a frente */ roll?: number }> = {
  bottle: { file: 'broken-bottle.glb', grip: -0.04, scale: 1 },
  pipe: { file: 'pipe.glb', grip: -0.1, scale: 1 },
  cleaver: { file: 'cleaver.glb', grip: -0.08, scale: 1, roll: 1.9 },
  sickle: { file: 'sickle.glb', grip: 0, scale: 1, roll: 1.9 },
  axe: { file: 'axe.glb', grip: -0.2, scale: 1, roll: 1.9 },
};
const extraSrc = new Map<ExtraMelee, Promise<THREE.Object3D>>();
export const loadExtra = (k: ExtraMelee): Promise<THREE.Object3D> => {
  let p = extraSrc.get(k);
  if (!p) { p = loader.loadAsync(`/models/weapons/${EXTRA_MELEE[k].file}`).then((g) => { tintExtra(k, g.scene); return g.scene; }); extraSrc.set(k, p); }
  return p;
};

/** Garrafa, cano e machado vêm sem textura (brancos): pinta vidro verde, aço cinza e cabo de madeira com cabeça de aço. */
function tintExtra(k: ExtraMelee, root: THREE.Object3D): void {
  const mats = (m: THREE.Mesh): THREE.MeshStandardMaterial[] => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (k === 'bottle') {
      const glass = [0x2f7d46, 0x4aa266, 0x255f36];
      mats(m).forEach((x, i) => { x.color.setHex(glass[i % glass.length]!); x.roughness = 0.25; x.metalness = 0.1; });
    } else if (k === 'pipe') {
      mats(m).forEach((x) => { x.color.setHex(0x7d8389); x.metalness = 0.6; x.roughness = 0.4; });
    } else if (k === 'axe') {
      // vertex colors: o cabo (parte de baixo) de madeira e a cabeça (parte de cima) de aço
      const geo = m.geometry;
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const pos = geo.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const wood = new THREE.Color(0x8b5a2b);
      const steel = new THREE.Color(0xaab0b7);
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
        (t > 0.72 ? steel : wood).toArray(col, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mats(m).forEach((x) => { x.vertexColors = true; x.color.setHex(0xffffff); x.needsUpdate = true; });
    }
  });
}

let signSrc: Promise<THREE.Object3D> | null = null;
export const loadSign = (): Promise<THREE.Object3D> => (signSrc ??= loader.loadAsync('/models/weapons/traffic-sign.glb').then((g) => g.scene));

let flashTex: THREE.Texture | null = null;
function flashTexture(): THREE.Texture {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.4, 'rgba(255,190,60,.85)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  flashTex = new THREE.CanvasTexture(c);
  return flashTex;
}

/** Cópia visual de cada arma (para pré-carregar e compilar shaders). */
export async function loadWeaponModels(): Promise<THREE.Object3D[]> {
  const all = await Promise.all([loadPistol(), loadRifle(), loadFlag(), loadSign(), loadCricket(), loadBaseball(), ...EXTRA_MELEE_KEYS.map(loadExtra), ...RIFLE_KINDS.map(loadRifleKind)]);
  return all.map((o) => o.clone(true));
}

/** AK-47 na mão do personagem (fica na frente do peito) + clarão do cano. */
export class WeaponVisual {
  private readonly anchor = new THREE.Group();
  private readonly flashSprite: THREE.Sprite;
  private rifleInner: THREE.Object3D | null = null;
  /** M4A1, M16 e Honey Badger (o AK é o rifleInner) */
  private readonly rifleInners = new Map<RifleKind, THREE.Object3D>();
  private rifleKind: RifleKind = 'ak';
  private readonly pistolInner = buildPistol();
  private readonly batAnchor = new THREE.Group();
  private readonly flagInner = new THREE.Group();
  private readonly signInner = new THREE.Group();
  private readonly cricketInner = new THREE.Group();
  private readonly baseballInner = new THREE.Group();
  private readonly extraInner = new Map<ExtraMelee, THREE.Group>();
  private flashT = 0;
  private mode: ArmedMode = 'none';
  private ready = false;
  private bound = false;
  private animator: Animator | null = null;
  private hidden = false;
  private suppressed = false;

  constructor(root: THREE.Object3D) {
    this.anchor.visible = false;
    root.add(this.anchor);
    this.anchor.add(this.pistolInner);
    this.pistolInner.visible = false;
    // o revólver Python .357 troca a pistola simples (que fica só até o arquivo carregar)
    void loadPistol().then((src) => {
      const gun = src.clone(true);
      gun.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(gun);
      inner.rotation.y = -Math.PI / 2; // cano (+X no arquivo) para +Z
      inner.position.set(-0.016, 0.01, -0.18); // a palma fica no cabo, no mesmo ponto da pistola antiga
      this.pistolInner.clear();
      this.pistolInner.add(inner);
    });
    const fallbackBat = buildBat();
    this.batAnchor.add(fallbackBat);
    // o "taco" é a bandeira num mastro (modelo convertido do DFF); enquanto carrega, vale o taco simples
    this.batAnchor.add(this.flagInner, this.signInner, this.cricketInner, this.baseballInner);
    void loadFlag().then((src) => {
      this.batAnchor.remove(fallbackBat);
      this.flagInner.clear();
      const flag = src.clone(true);
      flag.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(flag);
      inner.rotation.x = Math.PI / 2; // mastro (Y no GLB) passa a apontar para +Z
      inner.scale.setScalar(0.75);
      inner.position.z = 0.1 - 0.35 * 0.75; // a mão direita segura perto da base do mastro (a esquerda, mais acima)
      this.flagInner.add(inner);
    });
    // placa de trânsito (convertida do DFF): mesma pegada de duas mãos
    void loadSign().then((src) => {
      const sign = src.clone(true);
      sign.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(sign);
      inner.rotation.x = Math.PI / 2;
      inner.scale.setScalar(0.65);
      inner.position.z = 0.2 * 0.65; // mãos a ~40 cm da base do poste
      this.signInner.add(inner);
    });
    // taco de críquete (Bully): 83 cm, cabo na origem da mão direita; lâmina larga na ponta
    void loadCricket().then((src) => {
      const bat = src.clone(true);
      bat.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(bat);
      inner.rotation.x = Math.PI / 2; // o comprimento (Y no GLB) passa a apontar para +Z
      inner.scale.setScalar(1.15);
      inner.position.z = 0.1; // a mão direita segura perto do fim do cabo
      this.cricketInner.add(inner);
    });
    // taco de beisebol (GTA SA): 89 cm, cabo na origem da mão direita
    void loadBaseball().then((src) => {
      const bat = src.clone(true);
      bat.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(bat);
      inner.rotation.x = Math.PI / 2;
      inner.scale.setScalar(1.1);
      inner.position.z = 0.12;
      this.baseballInner.add(inner);
    });
    // armas brancas do pacote (garrafa, cano, cutelo, foice, machado)
    for (const k of EXTRA_MELEE_KEYS) {
      const holder = new THREE.Group();
      this.extraInner.set(k, holder);
      this.batAnchor.add(holder);
      void loadExtra(k).then((src) => {
        const m = src.clone(true);
        m.traverse((o) => { o.castShadow = true; });
        const inner = new THREE.Group();
        m.rotation.y = EXTRA_MELEE[k].roll ?? 0; // giro em volta do cabo: a lâmina aponta para a frente
        inner.add(m);
        inner.rotation.x = Math.PI / 2; // o comprimento (Y no GLB) passa a apontar para +Z
        inner.scale.setScalar(EXTRA_MELEE[k].scale);
        inner.position.z = -EXTRA_MELEE[k].grip * EXTRA_MELEE[k].scale; // o ponto do cabo fica na palma da mão direita
        holder.add(inner);
      });
    }
    this.batAnchor.visible = false;
    root.add(this.batAnchor);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashSprite.scale.setScalar(0.5);
    this.flashSprite.position.set(-0.017, 0.019, 0.75);
    this.flashSprite.visible = false;
    this.anchor.add(this.flashSprite);
    for (const k of RIFLE_KINDS) {
      if (k === 'ak') continue;
      void loadRifleKind(k).then((src) => {
        const geo = rifleGeo(k);
        const model = src.clone(true);
        const dead: THREE.Object3D[] = [];
        model.traverse((o) => { if (o.name.toLowerCase().includes('muzzle') || o.name.toLowerCase().includes('flash')) dead.push(o); });
        dead.forEach((o) => o.removeFromParent());
        const box = new THREE.Box3().setFromObject(model);
        model.position.sub(box.getCenter(new THREE.Vector3()));
        const inner = new THREE.Group();
        inner.add(model);
        inner.scale.setScalar(geo.scale);
        inner.rotation.y = -Math.PI / 2; // cano para +Z (frente)
        inner.position.set(0, geo.shiftY, 0.3);
        inner.traverse((o) => { o.castShadow = true; });
        inner.visible = false;
        this.anchor.add(inner);
        this.rifleInners.set(k, inner);
        this.refresh();
      });
    }
    void loadRifle().then((src) => {
      const model = src.clone(true);
      // some o "clarão" que vem no arquivo (usamos o nosso)
      const dead: THREE.Object3D[] = [];
      model.traverse((o) => { if (o.name.toLowerCase().includes('gunflash')) dead.push(o); });
      dead.forEach((o) => o.removeFromParent());
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const inner = new THREE.Group();
      inner.add(model);
      inner.scale.setScalar(0.88 / Math.max(size.x, size.y, size.z));
      inner.rotation.y = -Math.PI / 2; // cano para +Z (frente)
      inner.position.z = 0.3;
      inner.traverse((o) => { o.castShadow = true; });
      this.anchor.add(inner);
      this.rifleInner = inner;
      this.ready = true;
      this.apply();
    });
  }

  /** A posição da arma passa a ser dada pelo animador (acompanha o peito e as mãos). */
  bind(animator: Animator): void {
    this.bound = true;
    this.animator = animator;
    animator.attachWeapon(this.anchor);
    animator.attachBat(this.batAnchor);
  }

  /** Troca o modelo do fuzil na mão (AK-47, M4A1, M16, Honey Badger). */
  setRifleKind(k: RifleKind): void {
    if (k === this.rifleKind) return;
    this.rifleKind = k;
    this.refresh();
  }

  setMode(mode: ArmedMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.apply();
  }

  /** Inclina a arma para onde a câmera mira (positivo = para baixo). */
  setPitch(p: number): void {
    if (!this.bound) this.anchor.rotation.x = p * 0.9;
  }

  /** Esconde (morto, no carro) sem perder o modo. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.refresh();
  }

  /** Some enquanto o animador não segura a arma (escalando, rolando, emote). */
  setSuppressed(v: boolean): void {
    if (v === this.suppressed) return;
    this.suppressed = v;
    this.refresh();
  }

  private refresh(): void {
    const show = this.ready && this.mode !== 'none' && !this.hidden && !this.suppressed;
    const bat = isBatLike(this.mode);
    this.flagInner.visible = this.mode === 'bat';
    this.signInner.visible = this.mode === 'sign';
    this.cricketInner.visible = this.mode === 'cricket';
    this.baseballInner.visible = this.mode === 'baseball';
    this.extraInner.forEach((g, k) => { g.visible = this.mode === k; });
    const pistol = this.mode === 'pistol' || this.mode === 'pistol_aim';
    this.anchor.visible = show && !bat;
    this.batAnchor.visible = show && bat;
    this.pistolInner.visible = pistol;
    if (this.rifleInner) this.rifleInner.visible = !pistol && this.rifleKind === 'ak';
    this.rifleInners.forEach((g, k) => { g.visible = !pistol && this.rifleKind === k; });
    // boca do cano medida nos modelos: AK-47 (-0,017; 0,019; 0,738) e pistola (0; 0; 0,17), 1–2 cm à frente da ponta
    const fl = rifleGeo(this.rifleKind).flash;
    this.flashSprite.position.set(pistol ? PISTOL_FLASH.x : fl.x, pistol ? PISTOL_FLASH.y : fl.y, pistol ? PISTOL_FLASH.z : fl.z);
    this.flashSprite.scale.setScalar(pistol ? 0.3 : 0.5);
  }

  private apply(): void {
    this.refresh();
    if (!this.bound) this.anchor.position.set(0.02, this.mode === 'aim' || this.mode === 'pistol_aim' ? 1.34 : 1.2, 0.18);
  }

  /** Mostra o clarão por ~50 ms. */
  flash(): void {
    this.flashT = 0.05;
    this.animator?.kick();
    this.flashSprite.visible = true;
  }

  update(dt: number): void {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashSprite.visible = false;
    }
  }

  /** Posição do cano no mundo (de onde sai o tiro). */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    return this.flashSprite.getWorldPosition(out);
  }
}

/** Rastros dos tiros (linhas amarelas curtas). */
export class Tracers {
  private readonly pool: { line: THREE.Line; t: number }[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.9 }));
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.pool.push({ line, t: 0 });
    }
  }

  add(from: THREE.Vector3, to: THREE.Vector3): void {
    const e = this.pool[this.next++ % this.pool.length]!;
    const pos = e.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    e.line.visible = true;
    e.t = 0.07;
  }

  update(dt: number): void {
    for (const e of this.pool) {
      if (!e.line.visible) continue;
      e.t -= dt;
      if (e.t <= 0) e.line.visible = false;
    }
  }
}

const DARK = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });

/** Pistola simples: ferrolho, cano e cabo (cano para +Z, origem perto do cabo). */
export function buildPistol(): THREE.Group {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.045, 0.22), DARK);
  slide.position.set(0, 0, 0.06);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.05), new THREE.MeshLambertMaterial({ color: 0x3b2c22 }));
  grip.position.set(0, -0.07, -0.03);
  grip.rotation.x = -0.18;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), DARK);
  guard.position.set(0, -0.03, 0.03);
  g.add(slide, grip, guard);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** Taco de madeira: cabo na origem (palma), ponta em +Z. */
function buildBat(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xb88a52 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.35, 8), wood);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.024, 0.5, 10), wood);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), wood);
  for (const m of [handle, barrel]) m.rotation.x = Math.PI / 2;
  handle.position.z = 0.1;
  barrel.position.z = 0.53;
  knob.position.z = -0.08;
  g.add(handle, barrel, knob);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
