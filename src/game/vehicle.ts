import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLLIDERS, MAP } from './map';
import { EngineSound } from './audio';

export const CAR_MODELS = ['blistac', 'buffalo', 'clover'] as const;
export const BIKE_MODELS = ['harley', 'triumph', 'bmw', 'suzuki'] as const;
/** Assento do piloto (z = para a frente, y = para cima), no espaço do modelo antes de subir até o chão. */
const SEATS: Record<string, [number, number]> = { harley: [-0.46, 0.14], triumph: [-0.51, 0.42], bmw: [-0.4, 0.47], suzuki: [-0.4, 0.57] };
/** Pontas do guidão (x lateral, z para a frente, y para cima), mesmo espaço dos assentos. */
const BARS: Record<string, [number, number, number]> = { harley: [0.37, 0.15, 0.76], triumph: [0.37, 0.17, 0.63], bmw: [0.31, 0.43, 0.4], suzuki: [0.29, 0.46, 0.46] };
/** quanto o piloto deita o tronco (0 ereto … 1,5 peito no tanque): custom/clássica quase ereto, esportiva deitado */
const RIDER_LEAN: Record<string, number> = { harley: 0.35, triumph: 0.55, bmw: 1.4, suzuki: 1.5 };
/** Banco do motorista dos carros (x para a esquerda, z para a frente, y para cima) e volante. */
const CAR_SEATS: Record<string, [number, number, number]> = { blistac: [0.48, -0.25, -0.12], buffalo: [0.54, -0.35, -0.16], clover: [0.51, -0.15, -0.12] };
const isBikeModel = (m?: string): boolean => (BIKE_MODELS as readonly string[]).includes(m ?? '');
const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();
export const loadModel = (name: string): Promise<THREE.Object3D> => {
  let p = modelCache.get(name);
  if (!p) { p = loader.loadAsync(`/models/${isBikeModel(name) ? 'bikes' : 'vehicles'}/${name}.glb`).then((g) => g.scene); modelCache.set(name, p); }
  return p;
};

const MAX_SPEED = 28; // 100 km/h (dobro do anterior)
const MAX_REVERSE = 10; // dobro da ré anterior (5)
const ACCEL = 9; // carros demoram mais para pegar velocidade (era 18)
const BIKE_ACCEL = 8;
const BRAKE = 30;
const DRAG = 3;
const HAND_BRAKE = 24;
const TURN_RATE = 1.9;
const RADIUS = 1.3;


/** Duas cores da equipe (#rrggbb) para pintar o veículo. */
export interface PaintLook { c1: string; c2: string; /** pintura de viatura: teto na cor 1, letreiro "POLÍCIA MILITAR" nas laterais e luzes no teto */ police?: boolean }
/** Viatura da PM: o Buffalo pintado de branco com a faixa de baixo preta (letreiro e luzes no teto vêm de `police`). */
/** pintura padrão dos carros comuns (cinza claro); a equipe aparece nos adesivos redondos (portas e capô) */
export const DEFAULT_PAINT = '#b9bec5';
export const POLICE_LOOK: PaintLook = { c1: '#f1f2f4', c2: '#16181b', police: true };

const BLACK = 0x161616;
const GRAY = 0x8b8e93;
const WHITE = 0xe9eaec;
const lumOf = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** cor básica (preto, cinza ou branco) pelo brilho original */
const basicColor = (l: number): number => (l < 0.22 ? BLACK : l < 0.62 ? GRAY : WHITE);

/**
 * Pinta o veículo com as cores da equipe: a pintura (material `paint`, ou o maior material fora das rodas) vira a cor 1;
 * nos carros a faixa de baixo e o teto levam a cor 2; nas motos o segundo maior material leva a cor 2.
 * Pneus e detalhes ficam em preto, cinza e branco (sem texturas). Vidros e faróis não mudam.
 */
function applyTeamPaint(model: THREE.Object3D, look: PaintLook, bike: boolean): void {
  const wheelRoots = ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR', 'wheel_F', 'wheel_R'].map((n) => model.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  const inWheel = (o: THREE.Object3D): boolean => wheelRoots.some((r) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === r) return true; return false; });
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const matsOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);
  const triCount = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3;
  const tris = new Map<THREE.Material, number>();
  const wheelR = new Map<THREE.Material, number>(); // raio da roda (m) por material, para separar pneu e aro
  for (const m of meshes) {
    const w = inWheel(m);
    if (w) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const r = Math.max(bb.max.y, -bb.min.y, bb.max.z, -bb.min.z);
      for (const mat of matsOf(m)) wheelR.set(mat, Math.max(wheelR.get(mat) ?? 0, r));
    }
    for (const mat of matsOf(m)) {
      if (!w) tris.set(mat, (tris.get(mat) ?? 0) + triCount(m) / matsOf(m).length);
    }
  }
  const skip = (mat: THREE.Material): boolean => mat.name === 'glass' || mat.name === 'light';
  const body = [...tris.entries()].filter(([mat]) => !skip(mat)).sort((x, y) => y[1] - x[1]);
  const painted = body.filter(([mat]) => mat.name === 'paint').map(([mat]) => mat);
  const paint1 = painted.length ? painted : body[0] ? [body[0][0]] : [];
  const second = bike ? body.find(([mat, n]) => !paint1.includes(mat) && n >= (body[0]?.[1] ?? 0) * 0.2 && lumOf((mat as THREE.MeshStandardMaterial).color ?? new THREE.Color(0.5, 0.5, 0.5)) > 0.2)?.[0] : undefined;
  const c1 = new THREE.Color(!bike && !look.police ? DEFAULT_PAINT : look.c1); // carro comum: pintura padrão (a equipe vai em adesivos)
  const c2 = new THREE.Color(look.c2);
  const clones = new Map<THREE.Material, THREE.Material>();
  const clonesW = new Map<THREE.Material, THREE.Material>(); // versões para as peças das rodas
  const recolor = (mat: THREE.Material, onWheel: boolean): THREE.Material => {
    if (skip(mat)) return mat;
    let c = (onWheel ? clonesW : clones).get(mat);
    if (c) return c;
    const std = mat.clone() as THREE.MeshStandardMaterial;
    std.map = null;
    std.userData.teamPaint = false;
    const l = lumOf(mat instanceof THREE.MeshStandardMaterial ? mat.color : new THREE.Color(0.5, 0.5, 0.5));
    if (onWheel) { std.color.set(BLACK); addTire(std, wheelR.get(mat) ?? 0.33); } // roda: pneu preto por fora, aro cinza no miolo
    else if (paint1.includes(mat)) { std.color.copy(c1); std.userData.teamPaint = !bike && !!look.police; std.roughness = 0.45; std.metalness = 0.25; }
    else if (mat === second) { std.color.copy(c2); std.roughness = 0.45; std.metalness = 0.25; }
    else std.color.set(basicColor(mat instanceof THREE.MeshStandardMaterial && mat.map ? 0.45 : l));
    std.userData.c2 = c2;
    c = std;
    (onWheel ? clonesW : clones).set(mat, c);
    return c;
  };
  for (const m of meshes) {
    const w = inWheel(m);
    m.material = Array.isArray(m.material) ? m.material.map((x) => recolor(x, w)) : recolor(m.material, w);
  }
}

/** Roda: pneu preto (raio externo) e aro cinza (miolo), pela distância ao eixo no espaço da roda. */
function addTire(mat: THREE.MeshStandardMaterial, radius: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: radius * 0.68 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTR = length(position.yz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTR;\nuniform float uRim;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.55, 0.56, 0.58), vec3(0.07), step(uRim, vTR));');
  };
  mat.customProgramCacheKey = () => 'teamtire';
}

/** Acrescenta ao material pintado a segunda cor: faixa de baixo (soleiras e para-choques) e teto, pela altura no mundo. */
function addTwoTone(mat: THREE.MeshStandardMaterial, c2: THREE.Color, height: number, roofColored = true): void {
  const low = height * 0.3;
  const roof = roofColored ? height * 0.8 : 1e6; // viatura: o teto fica na cor 1
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uC2 = { value: c2 };
    sh.uniforms.uLow = { value: low };
    sh.uniforms.uRoof = { value: roof };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTH;\nvarying float vTU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTH = (modelMatrix * vec4(position, 1.0)).y;\nvTU = normalize(mat3(modelMatrix) * normal).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTH;\nvarying float vTU;\nuniform vec3 uC2;\nuniform float uLow;\nuniform float uRoof;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat tw = max(1.0 - step(uLow, vTH), step(uRoof, vTH) * step(0.55, vTU));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uC2, tw);');
  };
  mat.customProgramCacheKey = () => 'teamtwotone';
}

/** a malha pertence ao nó `body` (e não às rodas e portas)? */
function isBodyPart(m: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = m; p; p = p.parent) {
    if (p.name === 'body') return true;
    if (/^(wheel_|door_)/.test(p.name)) return false;
  }
  return true;
}

/** Monta o visual de um carro a partir do GLB (nós `body` e `wheel_FL/FR/BL/BR`); sem `look`, a pintura (`paint`) recebe `colorHex`; com `look`, vale a pintura da equipe. */
export function buildCarVisual(src: THREE.Object3D, colorHex: number, look?: PaintLook, bike = false): { group: THREE.Group; wheels: Record<string, THREE.Object3D> } {
  const model = src.clone(true);
  const paint = new THREE.Color(colorHex);
  const done = new Map<THREE.Material, THREE.Material>();
  if (look?.police) applyTeamPaint(model, look, bike); // só a viatura é repintada; os pessoais mantêm as cores do arquivo (a equipe vai em adesivos nas portas dos carros; moto sem nada)
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // só a carroceria joga sombra: rodas, portas e vidros são pequenos e custariam uma chamada de desenho cada na passada das sombras
    m.castShadow = isBodyPart(m) && !(!Array.isArray(m.material) && m.material.name === 'glass');
    if (look) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mat) => {
      if (mat.name !== 'paint') return mat;
      let c = done.get(mat);
      if (!c) { c = mat.clone(); (c as THREE.MeshStandardMaterial).color.copy(paint); done.set(mat, c); }
      return c;
    });
    m.material = Array.isArray(m.material) ? out : out[0]!;
  });
  const wheels: Record<string, THREE.Object3D> = {};
  const group = new THREE.Group();
  const body = model.getObjectByName('body');
  if (body) group.add(body);
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  for (const name of ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR', 'wheel_F', 'wheel_R', 'door_L', 'door_R']) {
    const node = model.getObjectByName(name);
    if (!node) continue;
    const origin = node.position.clone();
    const hinge = origin.clone();
    if (name.startsWith('door')) {
      // a porta gira na dobradiça: na ponta da frente da porta (junto ao para-brisa), não no meio dela
      hinge.z = new THREE.Box3().setFromObject(node).applyMatrix4(toModel).max.z;
    }
    const pivot = new THREE.Group(); // pivô: esterça/abre sem atrapalhar o giro
    pivot.name = name;
    pivot.position.copy(hinge);
    node.position.copy(origin).sub(hinge);
    pivot.add(node);
    group.add(pivot);
    wheels[name] = pivot;
  }
  // a origem do GLB fica no centro do carro: sobe até as rodas tocarem o chão
  group.position.y = -new THREE.Box3().setFromObject(group).min.y;
  if (look) {
    const h = new THREE.Box3().setFromObject(group).max.y;
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat.userData.teamPaint) addTwoTone(mat as THREE.MeshStandardMaterial, mat.userData.c2 as THREE.Color, h, !look.police);
    });
  }
  if (look?.police) addPoliceDetails(group);
  else if (look && !bike) addTeamStickers(group, wheels, look);
  return { group, wheels };
}

const stickerTex = new Map<string, THREE.CanvasTexture>();
/** Adesivo redondo da equipe: borda branca e o círculo dividido na diagonal nas duas cores. */
function stickerTexture(c1: string, c2: string): THREE.CanvasTexture {
  const key = c1 + c2;
  let t = stickerTex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.save();
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.clip();
  g.fillStyle = c1; g.fillRect(0, 0, 128, 128);
  g.fillStyle = c2; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 128); g.lineTo(0, 128); g.closePath(); g.fill();
  g.restore();
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  stickerTex.set(key, t);
  return t;
}

/** Adesivos da equipe: um em cada porta da frente (o da porta gira junto com ela). */
function addTeamStickers(group: THREE.Group, wheels: Record<string, THREE.Object3D>, look: PaintLook): void {
  group.updateMatrixWorld(true);
  const mat = new THREE.MeshBasicMaterial({ map: stickerTexture(look.c1, look.c2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const disc = (d: number): THREE.Mesh => new THREE.Mesh(new THREE.PlaneGeometry(d, d), mat);
  for (const [name, side] of [['door_L', 1], ['door_R', -1]] as const) {
    const pivot = wheels[name];
    if (!pivot) continue;
    const box = new THREE.Box3().setFromObject(pivot);
    const h = box.max.y - box.min.y;
    const world = new THREE.Vector3(side > 0 ? box.max.x : box.min.x, box.min.y + h * 0.32, (box.min.z + box.max.z) / 2);
    const m = disc(Math.min(0.42, h * 0.55));
    m.position.copy(pivot.worldToLocal(world.addScaledVector(new THREE.Vector3(side, 0, 0), 0.014)));
    m.rotation.y = side * (Math.PI / 2);
    pivot.add(m);
  }
}

let policeTex: THREE.CanvasTexture | null = null;
/** Letreiro lateral: "POLÍCIA MILITAR" em preto com a faixa vermelha embaixo (fundo transparente). */
function policeDecal(): THREE.CanvasTexture {
  if (policeTex) return policeTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 62px Impact, "Arial Black", sans-serif';
  g.fillStyle = '#16181b';
  g.fillText('POLÍCIA MILITAR', 256, 52);
  g.fillStyle = '#d4202a';
  g.fillRect(24, 96, 464, 12);
  policeTex = new THREE.CanvasTexture(c);
  policeTex.colorSpace = THREE.SRGBColorSpace;
  policeTex.anisotropy = 4;
  return policeTex;
}

/** Letreiro nas duas portas e luzes vermelha e azul no teto (medidas pelo tamanho do carro). */
function addPoliceDetails(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const lift = group.position.y; // o grupo já subiu até as rodas tocarem o chão
  const w = size.x;
  const mat = new THREE.MeshBasicMaterial({ map: policeDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  group.updateMatrixWorld(true);
  const y = box.min.y + size.y * 0.4;
  for (const side of [1, -1]) {
    // raio horizontal de fora para dentro: o letreiro encosta na lataria de verdade (a caixa do carro inclui os retrovisores)
    const from = group.localToWorld(new THREE.Vector3(side * (w / 2 + 1), y - lift, c.z - size.z * 0.02));
    const ray = new THREE.Raycaster(from, new THREE.Vector3(-side, 0, 0), 0, w + 2);
    const hit = ray.intersectObject(group, true).find((h) => h.object instanceof THREE.Mesh && !(h.object.material as THREE.Material).transparent);
    const x = hit ? group.worldToLocal(hit.point.clone()).x : side * (w / 2 - 0.1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size.z * 0.34, size.z * 0.085), mat);
    m.position.set(x + side * 0.015, y - lift, c.z - size.z * 0.02);
    m.rotation.y = side * (Math.PI / 2);
    group.add(m);
  }
  // barra de luzes no teto
  const bar = new THREE.Group();
  const lamp = (x: number, color: number): void => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.09, 0.2), new THREE.MeshBasicMaterial({ color }));
    l.position.x = x;
    bar.add(l);
  };
  lamp(-w * 0.11, 0xe02020);
  lamp(w * 0.11, 0x2060ff);
  bar.position.set(0, box.max.y - lift + 0.04, c.z - size.z * 0.05);
  group.add(bar);
}

/** Visual de um carro parado/decorativo (sem lógica de direção). */
export function loadCarVisual(model: string, colorHex: number): Promise<THREE.Group> {
  return loadModel(model).then((src) => buildCarVisual(src, colorHex).group);
}

export class Car {
  readonly root: THREE.Group;
  x: number;
  z: number;
  heading: number;
  speed = 0;
  /** id de quem está dirigindo (null = livre) */
  driver: string | null = null;
  private wheels: Record<string, THREE.Object3D>;
  private spin = 0;
  private readonly color: number;
  readonly bike: boolean;
  readonly model?: string;
  private readonly engine: EngineSound;
  /** empinada (rad) e inclinação lateral da moto */
  private throttle = 0;
  private tilt = 0;
  private lean = 0;
  /** derrapagem: a velocidade segue heading + slip (freio de mão trava as rodas traseiras e a traseira sai) */
  private slip = 0;
  private rearLocked = false;
  private rearSpin = 0;
  private skidSmooth = 0;
  /** velocidade (m/s) no instante da última batida deste quadro (0 = não bateu) */
  impact = 0;
  /** moto caída de lado (depois de uma batida forte); levanta quando alguém sobe */
  fallen = false;
  private axle = new THREE.Vector3(0, 0.35, -0.9);
  private lastX = 0;
  private lastZ = 0;
  /** velocidade estimada por quem só vê o carro (motorista remoto) */
  private seenSpeed = 0;

  /** dono (id do jogador) e equipe do dono, se for um veículo pessoal: só o dono e a equipe dele entram */
  ownerId: string | null = null;
  teamId = '';
  private look: PaintLook | null;
  private srcModel: THREE.Object3D | null = null;

  constructor(readonly id: number, x: number, z: number, heading: number, color: number, model?: string, look: PaintLook | null = null) {
    this.look = look;
    this.color = color;
    this.bike = isBikeModel(model);
    this.model = model;
    this.engine = new EngineSound(model);
    this.root = new THREE.Group(); // o modelo GLB entra quando carregar
    this.wheels = {};
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
    if (model) void loadModel(model).then((src) => { this.srcModel = src; this.useModel(src); });
  }

  /** Troca as cores da equipe (o dono mudou de equipe). */
  recolor(look: PaintLook | null): void {
    this.look = look;
    if (this.srcModel) this.useModel(this.srcModel);
  }

  /** portas dianteiras (0 fechada, 1 aberta) e o tempo que ficam abertas */
  private doorT = 0;
  private doorOpen = 0;
  /** abre a porta do motorista por um instante (entrar/sair) */
  openDoor(sec = 0.9): void { this.doorT = sec; }
  /** porta do motorista aberta até soltar (sequência de entrar/sair: abrir, sentar, fechar) */
  doorHold = false;
  /** moto caída que o piloto está levantando: continua deitada até soltar */
  holdFallen = false;
  private rising = false;
  /** onde fica a pélvis do piloto (espaço do carro); null em carros */
  seat: THREE.Vector3 | null = null;
  /** mãos no guidão: [esquerda, direita] (espaço do carro) */
  grips: [THREE.Vector3, THREE.Vector3] | null = null;
  /** inclinação do tronco do piloto (ver RIDER_LEAN); carros: 0 */
  get riderLean(): number { return this.bike ? RIDER_LEAN[this.model ?? ''] ?? 1.2 : 0; }
  private body: THREE.Group | null = null;
  private bodyBase = new THREE.Vector3();

  private useModel(src: THREE.Object3D): void {
    const v = buildCarVisual(src, this.color, this.look ?? undefined, this.bike);
    this.root.clear();
    if (this.bike) {
      // a moto inteira (corpo e rodas) vai dentro de um grupo que empina/inclina
      const inner = new THREE.Group();
      inner.add(v.group);
      this.body = inner;
      this.bodyBase.set(0, 0, 0);
      const rear = v.wheels['wheel_R'];
      if (rear) this.axle.set(0, rear.position.y + v.group.position.y, rear.position.z);
      const sp = SEATS[this.model ?? ''];
      if (sp) this.seat = new THREE.Vector3(0, sp[1] + v.group.position.y, sp[0]);
      const bar = BARS[this.model ?? ''];
      if (bar) { const y = bar[2] + v.group.position.y; this.grips = [new THREE.Vector3(bar[0], y, bar[1]), new THREE.Vector3(-bar[0], y, bar[1])]; }
      this.root.add(inner);
    } else {
      this.root.add(v.group);
      const cs = CAR_SEATS[this.model ?? ''];
      if (cs) {
        const lift = v.group.position.y;
        this.seat = new THREE.Vector3(cs[0], cs[2] + lift, cs[1]);
        // mãos no volante: um pouco à frente e acima do quadril
        const w = new THREE.Vector3(0, cs[2] + lift + 0.4, cs[1] + 0.5);
        this.grips = [w.clone().add(new THREE.Vector3(cs[0] + 0.17, 0, 0)), w.clone().add(new THREE.Vector3(cs[0] - 0.17, 0, 0))];
      }
    }
    this.wheels = v.wheels;
  }

  /** Dirige: acelerador, freio e freio de mão; steer -1..1 (direita +). */
  drive(dt: number, gas: boolean, brake: boolean, hand: boolean, steer: number, wheelie = false): void {
    const f = this.speed;
    const bike = this.bike;
    this.throttle = gas ? 1 : 0;
    const accel = bike ? BIKE_ACCEL : ACCEL;
    const maxSpeed = bike ? 20 : MAX_SPEED;
    const turn = bike ? 2.5 : TURN_RATE;
    const radius = bike ? 0.7 : RADIUS;
    // empinar: só com velocidade; a roda da frente sobe até ~40° e volta ao soltar
    const wantTilt = bike && wheelie && this.speed > 3 ? 0.72 : 0; // como antes: basta segurar empinar com a moto andando (sem precisar acelerar)
    this.tilt += (wantTilt - this.tilt) * Math.min(1, dt * (wantTilt > this.tilt ? 3 : (gas ? 7 : 12)));
    if (gas) this.speed += (f < -0.5 ? BRAKE : accel * (this.tilt > 0.3 ? 1.5 : 1)) * dt; // empinada dá um arranque extra
    else if (brake) this.speed -= (f > 0.5 ? BRAKE : ACCEL * 0.6) * dt; // freia e depois dá ré
    else this.speed -= Math.sign(f) * Math.min(Math.abs(f), DRAG * dt);
    // freio de mão: em velocidade trava as traseiras e derrapa (perde menos velocidade); parado/devagar segura firme
    if (hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (Math.abs(this.speed) > 3 ? HAND_BRAKE * 0.45 : HAND_BRAKE) * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, bike ? -4 : -MAX_REVERSE, maxSpeed);

    // Só esterça andando; com o freio de mão as rodas traseiras travam e a traseira desliza (o carro gira mais que a velocidade)
    const sliding = hand && Math.abs(this.speed) > 3;
    const grip = THREE.MathUtils.clamp(this.speed / 4, -1, 1) * (sliding ? 1.9 : 1);
    const before = this.heading;
    this.heading -= steer * turn * grip * (1 - this.tilt * 0.8) * Math.max(0.4, 1 - Math.abs(this.speed) / 45) * dt; // a alta velocidade a direção fica mais firme
    if (sliding) this.slip -= (this.heading - before) * 0.85; // a velocidade mantém a direção antiga: a traseira sai
    this.slip *= Math.exp(-dt * (sliding ? 0.9 : 5));
    if (Math.abs(this.slip) < 1e-3) this.slip = 0;
    this.rearLocked = sliding;
    this.lean += (steer * Math.min(1, Math.abs(this.speed) / 10) * 0.45 - this.lean) * Math.min(1, dt * 6);
    const dir = this.heading + this.slip;
    this.x += Math.sin(dir) * this.speed * dt;
    this.z += Math.cos(dir) * this.speed * dt;

    // Limites da arena e caixas: para e quica um pouco
    let hit = false;
    const speedBefore = Math.abs(this.speed);
    const cx = THREE.MathUtils.clamp(this.x, -(MAP.halfX - 1.8), MAP.halfX - 1.8);
    const cz = THREE.MathUtils.clamp(this.z, -(MAP.halfZ - 1.8), MAP.halfZ - 1.8);
    if (cx !== this.x || cz !== this.z) { this.x = cx; this.z = cz; hit = true; }
    for (const b of COLLIDERS) {
      if (b.top < 0.6 || (b.bottom ?? 0) > 2.2) continue; // degraus baixos e coisas suspensas não bloqueiam
      const px = THREE.MathUtils.clamp(this.x, b.minX, b.maxX);
      const pz = THREE.MathUtils.clamp(this.z, b.minZ, b.maxZ);
      const dx = this.x - px;
      const dz = this.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 1e-6) { this.x = px + (dx / d) * radius; this.z = pz + (dz / d) * radius; }
        hit = true;
      }
    }
    // colisão com outros veículos: cada carro é 2 círculos, a moto 1
    for (const o of CARS) {
      if (o === this) continue;
      for (const [ax, az, ar] of this.circles()) for (const [bx, bz, br] of o.circles()) {
        const dx = ax - bx;
        const dz = az - bz;
        const d = Math.hypot(dx, dz);
        const min = ar + br;
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / d;
        // veículo parado é empurrado (só se o lugar novo estiver livre: não entra em parede nem em outro carro); o de outro jogador não
        const share = o.driver === null && o.fits(o.x - dx * push * 0.5, o.z - dz * push * 0.5, this) ? 0.5 : 0;
        this.x += dx * push * (1 - share);
        this.z += dz * push * (1 - share);
        if (share > 0) o.setPose(o.x - dx * push * share, o.z - dz * push * share, o.heading);
        hit = true;
      }
    }
    // trânsito da avenida: o carro é barrado e o trânsito para e balança
    for (const t of TRAFFIC) {
      for (const [ax, az, ar] of this.circles()) for (const [bx, bz, br] of trafficCircles(t)) {
        const dx = ax - bx;
        const dz = az - bz;
        const d = Math.hypot(dx, dz);
        const min = ar + br;
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / d;
        this.x += dx * push;
        this.z += dz * push;
        if (Math.abs(this.speed) > 3) { t.stopT = Math.max(t.stopT, 1.2); t.wobble = 1; }
        hit = true;
      }
    }
    this.impact = hit ? speedBefore : 0;
    if (hit) { this.speed *= -0.25; this.slip = 0; }
    this.apply(steer, dt);
  }

  private pushX = 0;
  private pushZ = 0;
  private wobble = 0;
  /** Levou um golpe/tiro: abala e, se estiver parado, desliza um pouco. */
  bump(dx: number, dz: number, strength: number): void {
    this.wobble = Math.max(this.wobble, 0.5 + strength * 0.2);
    if (this.driver !== null) return;
    const d = Math.hypot(dx, dz) || 1;
    this.pushX += (dx / d) * strength;
    this.pushZ += (dz / d) * strength;
  }

  /** Este veículo cabe em (nx, nz), sem bater em prédio, objeto, trânsito ou outro veículo (menos `except`)? */
  fits(nx: number, nz: number, except: Car): boolean {
    const fx = this.bike ? 0 : Math.sin(this.heading) * 1.15;
    const fz = this.bike ? 0 : Math.cos(this.heading) * 1.15;
    const r = this.bike ? 0.55 : 1.0;
    const spots: [number, number][] = this.bike ? [[nx, nz]] : [[nx + fx, nz + fz], [nx - fx, nz - fz]];
    for (const [sx, sz] of spots) {
      if (Math.abs(sx) > MAP.halfX - 1.8 || Math.abs(sz) > MAP.halfZ - 1.8) return false;
      for (const b of COLLIDERS) {
        if (b.top < 0.6 || (b.bottom ?? 0) > 2.2) continue;
        if (Math.hypot(sx - THREE.MathUtils.clamp(sx, b.minX, b.maxX), sz - THREE.MathUtils.clamp(sz, b.minZ, b.maxZ)) < r) return false;
      }
      for (const o of CARS) {
        if (o === this || o === except) continue;
        for (const [bx, bz, br] of o.circles()) if (Math.hypot(sx - bx, sz - bz) < r + br) return false;
      }
      for (const t of TRAFFIC) for (const [bx, bz, br] of trafficCircles(t)) if (Math.hypot(sx - bx, sz - bz) < r + br) return false;
    }
    return true;
  }

  /** Círculos de colisão (x, z, raio) no chão. */
  circles(): [number, number, number][] {
    if (this.bike) return [[this.x, this.z, 0.55]];
    const fx = Math.sin(this.heading) * 1.15;
    const fz = Math.cos(this.heading) * 1.15;
    return [[this.x + fx, this.z + fz, 1.0], [this.x - fx, this.z - fz, 1.0]];
  }

  /** Velocidade (m/s, sinal da marcha) de quem dirige localmente ou estimada de longe. */
  get movingSpeed(): number { return this.driver === 'local' ? this.speed : this.seenSpeed; }

  /** Empinada, inclinação lateral e eixo traseiro da moto (o piloto acompanha). null em carros. */
  bikePose(): { pitch: number; roll: number; axle: THREE.Vector3 } | null {
    return this.bike ? { pitch: -this.tilt, roll: this.lean, axle: this.axle } : null;
  }

  /** Motor: toca quando há motorista; volume e lado seguem a distância ao ouvinte (ver setListener). Chame todo quadro. */
  updateEngine(dt: number): void {
    if (Math.abs(this.pushX) + Math.abs(this.pushZ) > 0.01 && this.driver === null) {
      this.x += this.pushX * dt;
      this.z += this.pushZ * dt;
      const k = Math.exp(-dt * 3);
      this.pushX *= k;
      this.pushZ *= k;
      this.root.position.set(this.x, 0, this.z);
    }
    if (this.wobble > 0) {
      this.wobble = Math.max(0, this.wobble - dt * 2.5);
      this.root.rotation.z = Math.sin(performance.now() * 0.05) * this.wobble * 0.04;
    }
    // moto caída: deita de lado; quando alguém sobe, levanta
    if (this.bike && this.fallen && (this.driver === null || this.holdFallen)) {
      this.lean += (1.25 - this.lean) * Math.min(1, dt * 5);
      this.apply(0);
    } else if (this.bike && this.fallen && this.driver !== null && !this.holdFallen) { this.fallen = false; this.rising = true; }
    if (this.rising) {
      // a moto levanta (o piloto a ergueu): volta do lado deitado para a vertical
      this.lean += (0 - this.lean) * Math.min(1, dt * 5);
      this.apply(0);
      if (Math.abs(this.lean) < 0.03) this.rising = false;
    }
    // portas: abrem enquanto doorT > 0,25 e fecham no final
    this.doorOpen += ((this.doorT > 0.25 || this.doorHold ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 10);
    if (this.doorT > 0) this.doorT -= dt;
    const dl = this.wheels['door_L'];
    if (dl) dl.rotation.y = -this.doorOpen * 1.0;
    const lastPx = this.lastX;
    const lastPz = this.lastZ;
    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ) / Math.max(dt, 1e-3);
    this.lastX = this.x;
    this.lastZ = this.z;
    const sp = this.driver === null ? 0 : Math.abs(this.speed) > 0.01 ? this.speed : moved;
    this.seenSpeed += (sp - this.seenSpeed) * Math.min(1, dt * 5);
    // derrapagem: ângulo entre para onde o veículo anda e para onde aponta (vale para o meu e para o dos outros jogadores)
    let skid = 0;
    if (this.driver !== null && moved > 3.5) {
      const dx = this.x - lastPx;
      const dz = this.z - lastPz;
      const fwd = Math.abs(dx * Math.sin(this.heading) + dz * Math.cos(this.heading));
      const lat = Math.abs(dx * Math.cos(this.heading) - dz * Math.sin(this.heading));
      const ang = Math.atan2(lat, fwd);
      skid = Math.min(1, Math.max(0, (ang - 0.14) * 3.2));
      if (this.rearLocked) skid = Math.max(skid, 0.55); // freio de mão travando as traseiras sempre chia
    }
    this.skidSmooth += (skid - this.skidSmooth) * Math.min(1, dt * 10);
    this.engine.update(this.driver !== null, this.seenSpeed, this.x, this.z, this.driver === null ? 0 : this.throttle, this.skidSmooth);
  }

  setPose(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
  }

  private apply(steer: number, dt = 0): void {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    this.spin += (this.speed * dt) / (this.bike ? 0.33 : 0.36);
    if (!this.rearLocked) this.rearSpin = this.spin; // freio de mão: as rodas traseiras ficam travadas
    if (this.bike && this.body) {
      // empina em torno do eixo traseiro e inclina nas curvas
      this.body.rotation.set(-this.tilt, 0, this.lean);
      const a = this.axle;
      this.body.position.copy(a).sub(a.clone().applyEuler(this.body.rotation)).add(this.bodyBase);
    }
    for (const [name, pivot] of Object.entries(this.wheels)) {
      if (name.startsWith('door')) continue;
      const front = name.startsWith('wheel_F');
      pivot.rotation.y = front && !this.bike ? -steer * 0.45 : 0;
      (pivot.children[0] as THREE.Object3D).rotation.x = front ? this.spin : this.rearSpin;
    }
  }
}

export const CARS: Car[] = [];

/** Carro do trânsito da avenida (anda sozinho, ao longo de X). */
export interface Traffic { obj: THREE.Object3D; dir: 1 | -1; speed: number; stopT: number; wobble: number; /** z da pista e desvio lateral atual (contornando carro parado) */ lane: number; off: number }
export const TRAFFIC: Traffic[] = [];

/** Alvo de colisão: 2 círculos por carro. `vel` = velocidade (m/s) no plano; `hit` aplica um empurrão/abalo. */
export interface Hittable {
  circles: [number, number, number][];
  vx: number; vz: number;
  hit: (dx: number, dz: number, strength: number) => void;
}

const trafficCircles = (t: Traffic): [number, number, number][] => [[t.obj.position.x - 1.15, t.obj.position.z, 1.0], [t.obj.position.x + 1.15, t.obj.position.z, 1.0]];


/** Tudo que bate: carros dirigíveis (menos `except`) e o trânsito. */
export function hittables(except?: Car): Hittable[] {
  const out: Hittable[] = [];
  for (const c of CARS) {
    if (c === except || c.driver === 'local') continue;
    out.push({
      circles: c.circles(), vx: Math.sin(c.heading) * c.movingSpeed, vz: Math.cos(c.heading) * c.movingSpeed,
      hit: (dx, dz, st) => c.bump(dx, dz, st),
    });
  }
  for (const t of TRAFFIC) {
    out.push({
      circles: trafficCircles(t), vx: t.stopT > 0 ? 0 : t.dir * t.speed, vz: 0,
      hit: (dx, dz, st) => { t.stopT = Math.max(t.stopT, 0.6 + st * 0.5); t.wobble = Math.max(t.wobble, 0.5 + st * 0.2); void dx; void dz; },
    });
  }
  return out;
}

/**
 * Anda o trânsito: para quando algo (jogador, veículo em movimento) ou outro carro do trânsito está na frente;
 * veículos parados na pista (`parked`) são contornados pelo lado do centro da avenida (se não der, o trânsito espera).
 */
export function updateTraffic(dt: number, blockers: [number, number][], parked: [number, number][] = []): void {
  for (const t of TRAFFIC) {
    const { x } = t.obj.position;
    // contorno: parado à frente, na minha pista, a menos de 14 m → desloca 3,4 m para o centro; senão volta para a pista
    const side = t.lane > 0 ? -1 : 1;
    let target = 0;
    for (const [bx, bz] of parked) {
      const ahead = (bx - x) * t.dir;
      if (ahead > -4 && ahead < 14 && Math.abs(bz - t.lane) < 2.6) { target = side * 3.4; break; }
    }
    t.off += (target - t.off) * Math.min(1, dt * 2.2);
    const zNow = t.lane + t.off;
    let blocked = false;
    const check = (bx: number, bz: number): boolean => {
      const ahead = (bx - x) * t.dir;
      return ahead > 0 && ahead < 7 && Math.abs(bz - zNow) < 2.3;
    };
    for (const [bx, bz] of blockers) if (check(bx, bz)) { blocked = true; break; }
    if (!blocked) for (const [bx, bz] of parked) if (check(bx, bz)) { blocked = true; break; } // não deu para contornar (ainda ou de todo)
    if (!blocked) for (const o of TRAFFIC) if (o !== t && check(o.obj.position.x, o.lane + o.off)) { blocked = true; break; } // fila: não passa por dentro do carro da frente
    if (t.stopT > 0) t.stopT -= dt;
    const go = t.stopT <= 0 && !blocked;
    t.obj.position.x += t.dir * t.speed * (go ? 1 : 0) * dt;
    t.obj.position.z = zNow;
    if (t.obj.position.x > 122) t.obj.position.x = -122;
    if (t.obj.position.x < -122) t.obj.position.x = 122;
    t.wobble = Math.max(0, t.wobble - dt * 2.5);
    t.obj.rotation.z = Math.sin(performance.now() * 0.05) * t.wobble * 0.04;
  }
}

/** Atualiza o som de motor de todos os carros (o ouvinte é o jogador). */
export function updateEngines(dt: number): void {
  for (const c of CARS) c.updateEngine(dt);
}

let carsGroup: THREE.Group | null = null;
/** Veículos pessoais (um por jogador), por id do dono. Também estão em CARS (colisão, motor, entrada). */
export const PERSONAL = new Map<string, Car>();
let nextPersonalId = 100;

/** Cria (ou move/recolore) o veículo pessoal de um jogador. */
export function spawnPersonal(ownerId: string, model: string, look: PaintLook | null, teamId: string, x: number, z: number, heading: number): Car | null {
  if (!carsGroup) return null;
  let car = PERSONAL.get(ownerId);
  if (car && car.model !== model) { despawnPersonal(ownerId); car = undefined; }
  if (!car) {
    car = new Car(nextPersonalId++, x, z, heading, 0xffffff, model, look);
    car.ownerId = ownerId;
    CARS.push(car);
    carsGroup.add(car.root);
    PERSONAL.set(ownerId, car);
  } else {
    if (car.driver === null) car.setPose(x, z, heading); // em uso: a posição vem de quem dirige
    car.recolor(look);
  }
  car.teamId = teamId;
  return car;
}

export function despawnPersonal(ownerId: string): void {
  const car = PERSONAL.get(ownerId);
  if (!car) return;
  PERSONAL.delete(ownerId);
  const i = CARS.indexOf(car);
  if (i >= 0) CARS.splice(i, 1);
  car.root.removeFromParent();
}

/** Procura um lugar livre perto de (px, pz), preferindo a frente de `heading`: sem prédio, árvore, banco ou outro veículo. */
export function findVehicleSpot(px: number, pz: number, heading: number): { x: number; z: number } {
  const free = (x: number, z: number): boolean => {
    if (Math.abs(x) > MAP.halfX - 3 || Math.abs(z) > MAP.halfZ - 3) return false;
    for (const b of COLLIDERS) {
      if (b.top < 0.5 || (b.bottom ?? 0) > 2.2) continue;
      if (x > b.minX - 2.2 && x < b.maxX + 2.2 && z > b.minZ - 2.2 && z < b.maxZ + 2.2) return false;
    }
    for (const o of CARS) if (Math.hypot(o.x - x, o.z - z) < 5.4) return false; // carros têm ~4,5 m: não nasce encostado em outro
    for (const t of TRAFFIC) if (Math.hypot(t.obj.position.x - x, t.obj.position.z - z) < 5) return false;
    return true;
  };
  for (const dist of [5.5, 7, 9, 12]) {
    for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, Math.PI]) {
      const a = heading + da;
      const x = px + Math.sin(a) * dist;
      const z = pz + Math.cos(a) * dist;
      if (free(x, z)) return { x, z };
    }
  }
  return { x: px + Math.sin(heading) * 5.5, z: pz + Math.cos(heading) * 5.5 };
}

/** Cria os carros parados do mapa. */
export function createCars(): THREE.Group {
  CARS.length = 0;
  PERSONAL.clear();
  const group = new THREE.Group();
  carsGroup = group;
  // Viaturas da PM (Buffalo pintado de polícia, `POLICE_LOOK`): sem equipe, paradas e abertas a todos. 4 nas pistas da avenida (pista sul vai para leste, heading π/2;
  // pista norte para oeste, -π/2) e 4 nas calçadas das saídas da cidade, nas pontas da avenida.
  const spawn: [number, number, number][] = [
    [34, -9, Math.PI / 2],
    [-26, -9, Math.PI / 2],
    [10, 9, -Math.PI / 2],
    [-40, 9, -Math.PI / 2],
    [98, -16, Math.PI / 2],
    [98, 16, -Math.PI / 2],
    [-98, -16, Math.PI / 2],
    [-98, 16, -Math.PI / 2],
  ];
  spawn.forEach(([x, z, h], i) => {
    const car = new Car(i, x, z, h, 0xffffff, 'buffalo', POLICE_LOOK);
    CARS.push(car);
    group.add(car.root);
  });
  return group;
}
