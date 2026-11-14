import * as THREE from 'three';
import { rifleGeo, type RifleKind } from './rifles';

interface GtaTrack { id: number; t: number[]; q: number[] }
interface BoneTrack { bone: string; t: number[]; q: number[] }
/** Deslocamento do corpo (osso Root do IFP) ao longo do clipe, em metros: f para a frente, l para a esquerda, u para cima. */
export interface MoveData { t: number[]; f: number[]; l: number[]; u: number[] }
interface ClipData<T> { duration: number; tracks: T[]; /** descida do corpo (m) ao longo do clipe (mergulho) */ drop?: { t: number[]; y: number[] }; move?: MoveData }
type Clips<T> = Record<string, ClipData<T>>;
type Kind = 'gta' | 'carlos';

export type Armed = 'none' | 'rifle' | 'aim' | 'pistol' | 'pistol_aim' | 'bat' | 'sign' | 'cricket' | 'baseball' | 'spray' | 'spray_aim' | ExtraMelee;
/** Armas brancas extras (pacote de armas): garrafa quebrada, cano, cutelo, foice e machado. */
export const EXTRA_MELEE_KEYS = ['bottle', 'pipe', 'cleaver', 'sickle', 'axe', 'knife'] as const;
export type ExtraMelee = (typeof EXTRA_MELEE_KEYS)[number];
export const ARMED_CODE: Record<Armed, number> = { none: 0, rifle: 1, aim: 2, bat: 3, pistol: 4, pistol_aim: 5, sign: 6, cricket: 7, baseball: 8, bottle: 9, pipe: 10, cleaver: 11, sickle: 12, axe: 13, knife: 22, spray: 20, spray_aim: 21 };
// 14–19 são os fuzis (rifleFromNetCode); 20 e 21 a lata de spray
export const ARMED_FROM_CODE: Armed[] = ['none', 'rifle', 'aim', 'bat', 'pistol', 'pistol_aim', 'sign', 'cricket', 'baseball', 'bottle', 'pipe', 'cleaver', 'sickle', 'axe', 'none', 'none', 'none', 'none', 'none', 'none', 'spray', 'spray_aim', 'knife'];
/** Armas brancas de duas mãos (bandeira, placa, tacos de críquete e de beisebol): usam os clipes do baseball.ifp. */
export const isBatLike = (a: Armed): boolean => a === 'bat' || a === 'sign' || a === 'cricket' || a === 'baseball' || (EXTRA_MELEE_KEYS as readonly string[]).includes(a);
/** O corpo gira para onde a câmera mira só ao mirar ou atirar (arma levantada). Com a arma baixa a câmera olha livre e o corpo segue o movimento. */
/** Armas de uma mão que usam os clipes da faca (knife.ifp): faca e garrafa quebrada. */
export const isKnifeLike = (a: Armed): boolean => a === 'knife' || a === 'bottle' || a === 'cleaver';
export const facesAim = (a: Armed): boolean => a === 'aim' || a === 'pistol_aim' || a === 'spray_aim';
const isAimPose = (a: Armed): boolean => a === 'aim' || a === 'pistol_aim' || a === 'spray_aim';
const isSpray = (a: Armed): boolean => a === 'spray' || a === 'spray_aim';
type Kind3 = 'rifle' | 'pistol' | 'bat';
const kindOf = (a: Armed): Kind3 | null => (a === 'rifle' || a === 'aim' ? 'rifle' : a === 'pistol' || a === 'pistol_aim' || isSpray(a) ? 'pistol' : isBatLike(a) ? 'bat' : null);

/** Clipes que tocam uma vez e param no último quadro. */
/** Clipes em que o corpo cai ou levanta do chão: o corpo é apoiado pelo osso mais baixo (os dados do IFP não têm a altura certa de cada instante). */
const GROUNDED = new Set(['getup', 'getup_front', 'ko', 'ko_front', 'ko_skid_back', 'ko_skid_front', 'hitk_2']);
const LIE_CONTACT = 0.08; // altura do osso mais baixo quando o corpo está deitado (a pele tem ~10 cm de espessura)
const ONCE = new Set(['roll_f', 'roll_fl', 'roll_fr', 'roll_l', 'roll_r', 'roll_b', 'roll_bl', 'roll_br', 'bat_swing4', 'arrestgun', 'knife_1', 'knife_2', 'knife_3', 'knife_4', 'knife_g', 'kill_player', 'kill_ped_damage', 'kill_ped_die', 'kick_1', 'kick_2', 'hitk_1', 'hitk_2', 'hit_1', 'hit_2', 'hit_3', 'block', 'punch_1', 'punch_2', 'punch_3', 'punch_4', 'bat_swing', 'bat_swing2', 'bat_swing3', 'bat_hit_1', 'bat_hit_2', 'bat_hit_3', 'car_getin_l', 'car_getout_l', 'car_open_l', 'car_closedoor_l', 'car_close_l', 'bike_pickup_l', 'bike_pickup_r', 'bike_pullup_l', 'bike_pullup_r', 'bike_fall', 'ko_front', 'getup_front', 'getup', 'ko_skid_back', 'ko_skid_front', 'hitr_front', 'hitr_back', 'hitr_l', 'hitr_r', 'hitr_behind', 'jump_launch', 'jump_land', 'climb_jump', 'climb_pull', 'climb_stand', 'roll', 'dive']);
export const isOnceClip = (name: string): boolean => ONCE.has(name);

/** Clipes em que o personagem não segura o fuzil (escalar, rolar, mergulhar, emotes). */
const FREE_HANDS = (name: string): boolean => name.startsWith('climb_') || name === 'roll' || name.startsWith('roll_') || name === 'dive';

/** Clipes feitos para segurar o fuzil (Gun_stand, GunMove_*, WEAPON_crouch...): os braços vêm do clipe e a arma segue a mão. */
const OWN_HOLD = (name: string): boolean => name.startsWith('gun_') || name.startsWith('crouch_') || name === 'run_armed' || name === 'run_1armed' || name === 'walk_armed';

/** Velocidade de reprodução (1 = original). Os clipes de arma andam um pouco mais rápido que o jogo. */
/** Clipes em que as pernas ficam paradas na pose do 1º quadro (golpes, reações a golpes e as posições de luta): o IFP não guarda o deslocamento do corpo, então os passos do soco/tacada faziam as pernas patinarem com o corpo parado. */
// Os clipes do baseball/fight_e/knife novos (bat_*, kick_*, hit_*, hitk_*) têm passos e deslocamento do corpo e não ficam parados.
const PLANTED = new Set(['punch_1', 'punch_2', 'punch_3', 'combat_idle', 'block']);
const TIME_SCALE: Record<string, number> = { ko: 1.8, getup: 1.1, ko_front: 1.5, getup_front: 1.1, ko_skid_back: 1, ko_skid_front: 1, hitr_front: 1.1, hitr_back: 1.1, hitr_l: 1.1, hitr_r: 1.1, hitr_behind: 1.1, run_armed: 1.15, run_1armed: 1.15, bike_fall: 1.2, car_getin_l: 0.9, car_getout_l: 0.85, car_open_l: 1.25, car_closedoor_l: 1.2, car_close_l: 1.2, bike_pickup_l: 1.15, bike_pickup_r: 1.15, bike_pullup_l: 1, bike_pullup_r: 1, hit_1: 1.8, hit_2: 1.4, hit_3: 2.2, punch_1: 2.2, punch_2: 2.2, punch_3: 2.0, punch_4: 1.6, bat_swing: 1.4, bat_swing2: 1.5, bat_swing3: 1.6, bat_hit_1: 1.3, bat_hit_2: 1.3, bat_hit_3: 1.8, arrestgun: 1.3, knife_1: 1.5, knife_2: 1.5, knife_3: 1.4, knife_4: 1.2, kick_1: 1.3, kick_2: 1.8, hitk_1: 1.4, hitk_2: 2, gun_fwd: 1.2, gun_bwd: 1.0, gun_left: 1.5, gun_right: 1.4, crouch_fwd: 0.6, crouch_bwd: 0.6,
  // andar/correr: o passo do clipe (medido pelo pé de apoio, ver dev/anim-viewer) é bem menor que a velocidade do jogo (andar 2,1 m/s, correr 6,2 m/s) e os pés patinavam; acelera o clipe até ficar perto, sem passar da cadência natural
  walk: 1.6, walk_armed: 1.3, sprint: 1.1, run: 1.1 };

/** Nome do osso (padrão GTA SA, sem sufixo numérico) -> ID usado no ped.ifp. */
const GTA_BONE_IDS: Record<string, number> = {
  pelvis: 1, spine: 2, spine1: 3, neck: 4, head: 5, 'l brow': 6, 'r brow': 7, jaw: 8,
  'l thigh': 41, 'l calf': 42, 'l foot': 43, 'l toe0': 44,
  'r thigh': 51, 'r calf': 52, 'r foot': 53, 'r toe0': 54,
  belly: 201,
  'r clavicle': 21, 'r upperarm': 22, 'r forearm': 23, 'r hand': 24, 'r finger': 25, 'r finger01': 26,
  'l clavicle': 31, 'l upperarm': 32, 'l forearm': 33, 'l hand': 34, 'l finger': 35, 'l finger01': 36,
};

const cache = new Map<string, Promise<Clips<never>>>();
export function fetchJson(url: string): Promise<Clips<never>> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.json() as Promise<Clips<never>>);
    cache.set(url, p);
  }
  return p;
}

function gtaKey(name: string): string {
  return name.replace(/_\d+$/, '').replace(/_/g, ' ').trim().toLowerCase().replace('bip01 ', '');
}

const FADE = 0.2;
const CURL_AXIS = new THREE.Vector3(0, 0, 1);
const JAB_TIME = 0.42;
/** Distância do osso do pulso até o meio da palma (m): é a palma, não o pulso, que segura o cabo. */
const PALM = 0.1;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

interface Arm {
  /** +1 = braço esquerdo do personagem (+X), -1 = direito */
  side: 1 | -1;
  c: THREE.Bone | null; // clavícula
  cq0: THREE.Quaternion;
  cdir0: THREE.Vector3;
  u: THREE.Bone; f: THREE.Bone; h: THREE.Bone;
  q0: [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion];
  dir0: [THREE.Vector3, THREE.Vector3];
  /** comprimento do braço e do antebraço */
  len: [number, number];
  /** direção do cotovelo (para onde ele aponta) com o fuzil */
  pole: THREE.Vector3;
  /** ponto de empunhadura no fuzil (no espaço da arma) */
  curU: THREE.Vector3; curF: THREE.Vector3;
}

interface Hand { fingers: THREE.Bone[]; side: 1 | -1 }
interface Leg { thigh: THREE.Bone; calf: THREE.Bone; foot: THREE.Bone }

interface Spine { mid: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone }

interface PoseCfg { pos: THREE.Vector3; pitch: number; yaw: number }
/** crouchLow/crouchAim: deslocamento extra (espaço do peito) quando agachado, para a arma não ir parar entre os joelhos */
interface WeaponCfg { low: PoseCfg; aim: PoseCfg; gripR: THREE.Vector3; gripL: THREE.Vector3; crouchLow: THREE.Vector3; crouchAim: THREE.Vector3 }
const P3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
/**
 * Poses das armas no espaço do personagem em repouso (x+ = esquerda, y+ = cima, z+ = frente).
 * pos = centro da arma; pitch = cano para baixo (rad); yaw = cano para a esquerda (rad). Empunhadura/guarda-mão no espaço da arma (cano em +Z).
 */
const CFG: Record<'rifle' | 'pistol', WeaponCfg> = {
  rifle: {
    // referência (foto): o fuzil atravessa o corpo na altura da barriga, cano para a esquerda e levemente para cima
    low: { pos: P3(-0.02, 1.3, 0.2), pitch: -0.06, yaw: 1.1 },
    // coronha no ombro direito, bochecha na coronha; yaw negativo: o cano converge para o ponto da mira (a câmera fica à direita)
    aim: { pos: P3(-0.17, 1.47, 0.24), pitch: 0, yaw: -0.05 },
    gripR: P3(0, -0.055, 0.17), // empunhadura (coronha→cano: a arma tem 0,88 m e começa em z=-0,14)
    gripL: P3(0, -0.02, 0.58), // guarda-mão de madeira (nas fotos a mão de apoio segura na ponta dele, braço quase esticado)
    crouchLow: P3(0, 0.08, -0.04),
    crouchAim: P3(0, -0.04, 0),
  },
  pistol: {
    // fotos: antes de atirar as duas mãos seguram a arma colada ao corpo (cintura/peito), cano para baixo e à frente
    low: { pos: P3(-0.1, 1.1, 0.3), pitch: 0.75, yaw: 0 },
    // ao atirar: braços estendidos à frente, as duas mãos juntas na altura do queixo
    aim: { pos: P3(-0.07, 1.45, 0.6), pitch: 0, yaw: -0.02 },
    gripR: P3(0, -0.07, -0.03),
    gripL: P3(0.025, -0.075, -0.02),
    crouchLow: P3(0, 0.1, 0),
    crouchAim: P3(0, -0.16, -0.08),
  },
};

/** Lata de spray: giro só da mão (graus) para a palma ficar para a frente, e quanto os dedos fecham (mão meio aberta). */
/** giro dos antebraços e mãos (rad) na escalada: palma para baixo sobre a borda */
const CLIMB_ROLL = Math.PI / 2;
const SPRAY_HAND_ROLL = -Math.PI / 2; // palma para baixo...
const SPRAY_HAND_BEND = (70 * Math.PI) / 180; // ...e o pulso dobra para trás: palma para a frente, dedos para cima
const SPRAY_CURL = 0.45;

/** Lata de spray (uma mão só, a direita): abaixada junto ao quadril; ao pintar o braço sobe e estica para a parede (o bico para a frente). */
const CFG_SPRAY: WeaponCfg = {
  low: { pos: P3(-0.2, 1.1, 0.22), pitch: 0, yaw: 0 },
  aim: { pos: P3(-0.1, 1.42, 0.5), pitch: 0, yaw: 0 },
  gripR: P3(0, -0.03, 0.02), // a palma (mão aberta, virada para a frente) fica atrás da lata
  gripL: P3(0, 0, 0),
  crouchLow: P3(0, 0.1, 0),
  crouchAim: P3(0, -0.08, 0),
};

/** Trilha das mãos de uma animação curta de pistola (colt45.ifp): movimento do pulso direito a partir do começo e lugar da mão esquerda em relação ao pulso direito. */
interface HandTrack { duration: number; t: number[]; rp: number[]; rq: number[]; lr: number[] }
let pistolOverlay: Record<string, HandTrack> | null = null;
const overlayLoad = (): Promise<unknown> => (pistolOverlay ? Promise.resolve() : (fetchJson('/anims/pistol-overlay.json') as unknown as Promise<Record<string, HandTrack>>).then((d) => { pistolOverlay = d; }).catch(() => undefined));

/** Baixa os dados de animação de antemão (Law e Carlos). */
export function preloadAnimations(): Promise<unknown> {
  return Promise.all([overlayLoad(), ...['/anims/ped.json', '/anims/ped-extra.json', '/anims/carlos.json', '/anims/carlos-extra.json'].map((u) => fetchJson(u).catch(() => undefined))]);
}

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private clipName = '';
  private readonly moves = new Map<string, MoveData>();
  private done = false;
  isCarlos = false;
  /** giro do antebraço e da mão em torno do próprio eixo (rad): palma para dentro ao segurar */
  armRoll = 0;
  /** giro extra só da mão (rad), em volta do antebraço: lata de spray com a palma para a frente */
  private handRoll = 0;
  /** dobra só do pulso (rad): a mão sobe e a palma vira para a frente */
  private handBend = 0;
  /** escalada: altura da borda em relação aos pés (m) e peso (0..1); as duas mãos vão por IK para cima da borda, palmas para baixo */
  private climbRel: number | null = null;
  private climbW = 0;
  private armW = 0; // 0 = braços do clipe, 1 = braços segurando o fuzil
  private carryW = 0; // 1 = arma branca carregada em pé (andando/correndo): braços por IK, arma para cima
  private aimK = 0; // 0 = fuzil baixo, 1 = fuzil no ombro
  private jabT = -1; // soco em andamento (0..1), -1 = nenhum
  private recoil = 0; // coice do último tiro (1 -> 0)
  private reloadT = -1; // recarregando a pistola: tempo (s) da animação, -1 = nenhuma
  private reloadDur = 1.6;
  private reloadOn = false;
  private drawCrouch = false; // sacou a pistola agachado: usa o colt45_crouchfire
  private drawT = -1; // sacando a pistola até mirar (ARRESTgun): tempo (s), -1 = nenhum
  private drawDur = 0.5;
  /** mão esquerda no recarregar: onde ela vai em relação ao pulso direito (espaço do personagem) e o peso */
  private ovLeft: { lr: THREE.Vector3; w: number } | null = null;
  private flailW = 0; // "ragdoll" falso: braços e pernas balançam soltos (0..1)
  private flailT = 0;
  /** orientação do taco no espaço da mão direita, calibrada no bat_idle (mãos afastadas) */
  private batLocal: THREE.Quaternion | null = null;
  private legK = 0; // andando agachado: dobra mais os joelhos
  private leanK = 0; // sprint e agachado parado: endireita o tronco, que o clipe deixa caído para a esquerda
  private allBones: THREE.Object3D[] | null = null;
  private footRest = 0; // altura do pé mais baixo em repouso (espaço do modelo)
  private groundDrop = 0; // quanto o corpo desce para o pé tocar o chão
  private crouchK = 0; // 0 em pé, 1 agachado (tronco desce)
  private crouchW = 0; // 0 em pé, 1 em qualquer clipe agachado (a arma não acompanha a curvatura do tronco)
  private armed: Armed = 'none';
  private rifleKind: RifleKind = 'ak';
  private aimPitch = 0;
  private weapon: THREE.Object3D | null = null;
  private bat: THREE.Object3D | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly tmpM = new THREE.Matrix4();
  private readonly rootInv = new THREE.Matrix4();
  /** ossos que o código mexe depois do clipe, com a pose limpa do clipe (o mixer só reescreve o que muda) */
  private touched: THREE.Bone[] = [];
  private clean = new Map<THREE.Bone, THREE.Quaternion>();
  private dirty = false;
  private chestRest = { pos: new THREE.Vector3(), q: new THREE.Quaternion() };
  private drops = new Map<string, { t: number[]; y: number[] }>();
  private modelY0: number | null = null;
  private modelZ0 = 0;
  private modelX0 = 0;
  /** piloto sentado: deslocamento do modelo (y já descontando a altura da pélvis) e z */
  private ride: { x: number; y: number; z: number; grips: [THREE.Vector3, THREE.Vector3] | null; lean: number } | null = null;
  private addClips: (file: Clips<never>) => void = () => undefined;

  private constructor(
    private root: THREE.Object3D,
    private mixer: THREE.AnimationMixer,
    private arms: Arm[],
    private spine: Spine | null,
    private legs: Leg[],
    private hands: Hand[],
  ) {
    mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action === this.current) this.done = true;
    });
    this.touched = [...arms.flatMap((a) => [a.u, a.f, a.h, ...(a.c ? [a.c] : [])])];
    if (spine) this.touched.push(spine.mid, spine.chest, spine.neck, spine.head);
    for (const l of legs) this.touched.push(l.thigh, l.calf, l.foot);
    for (const h of hands) this.touched.push(...h.fingers);
    for (const b of this.touched) this.clean.set(b, b.quaternion.clone());
    this.updateRoot();
    this.footRest = this.lowestFoot();
    if (spine) {
      this.chestRest.pos.copy(this.posIn(spine.chest, new THREE.Vector3()));
      this.quatIn(spine.chest, this.chestRest.q);
    }
  }

  get name(): string { return this.clipName; }
  /** Quanto do clipe atual já tocou (0..1, em tempo real, contando o timeScale). */
  get progress(): number {
    if (!this.current) return 0;
    return THREE.MathUtils.clamp(this.current.time / this.current.getClip().duration, 0, 1);
  }
  /** O fuzil está nas mãos (armado e não escalando, rolando ou em emote)? */
  get holdsWeapon(): boolean { return this.armed !== 'none' && !FREE_HANDS(this.clipName); }
  /** true quando um clipe "uma vez" terminou */
  get finished(): boolean { return this.done; }
  has(name: string): boolean { return this.actions.has(name); }

  /** Retorna null se o modelo não tem esqueleto compatível. */
  static async create(root: THREE.Object3D): Promise<Animator | null> {
    root.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    });
    const byGta = new Map<string, THREE.Bone>();
    bones.forEach((b, n) => byGta.set(gtaKey(n), b));
    const bySan = (name: string): THREE.Bone | undefined => bones.get(THREE.PropertyBinding.sanitizeNodeName(name));

    const isGta = Object.keys(GTA_BONE_IDS).filter((k) => byGta.has(k)).length >= 12 && byGta.has('r upperarm');
    const isCarlos = !!bySan('root hips_00');
    if (!isGta && !isCarlos) return null;
    const kind: Kind = isGta ? 'gta' : 'carlos';

    let find: (n: string) => THREE.Bone | undefined;
    let names: { arm: (p: 'l' | 'r') => [string, string, string, string]; spine: [string, string, string, string]; leg: (p: 'l' | 'r') => [string, string, string] };
    if (isGta) {
      find = (n) => byGta.get(n);
      names = {
        arm: (p) => [`${p} upperarm`, `${p} forearm`, `${p} hand`, `${p} clavicle`],
        spine: ['spine', 'spine1', 'neck', 'head'],
        leg: (p) => [`${p} thigh`, `${p} calf`, `${p} foot`],
      };
    } else {
      find = (n) => {
        for (const [full, b] of bones) if (full.replace(/_/g, ' ').replace(/ ?\d+$/, '').trim() === n) return b;
        return undefined;
      };
      names = {
        arm: (p) => { const w = p === 'l' ? 'left' : 'right'; return [`arm ${w} shoulder 2`, `arm ${w} elbow`, `arm ${w} wrist`, `arm ${w} shoulder 1`]; },
        spine: ['spine middle', 'spine upper', 'head neck lower', 'head neck upper'],
        leg: (p) => { const w = p === 'l' ? 'left' : 'right'; return [`leg ${w} thigh`, `leg ${w} knee`, `leg ${w} ankle`]; },
      };
    }

    const arms = (['l', 'r'] as const).flatMap((p) => {
      const [u, f, h, c] = names.arm(p).map((n) => find(n)) as [THREE.Bone?, THREE.Bone?, THREE.Bone?, THREE.Bone?];
      const arm = u && f && h ? buildArm(p === 'l' ? 1 : -1, u, f, h, c ?? null, root) : null;
      return arm ? [arm] : [];
    });
    const sp = names.spine.map((n) => find(n));
    const spine: Spine | null = sp.every(Boolean) ? { mid: sp[0]!, chest: sp[1]!, neck: sp[2]!, head: sp[3]! } : null;

    const legs = (['l', 'r'] as const).flatMap((p) => {
      const [t, c, f] = names.leg(p).map((n) => find(n));
      return t && c && f ? [{ thigh: t, calf: c, foot: f }] : [];
    });

    const hands = (['l', 'r'] as const).map((p): Hand => {
      const names = isGta
        ? [`${p} finger`, `${p} finger01`]
        : (() => { const w = p === 'l' ? 'left' : 'right'; return ['1a', '1b', '1c', '2a', '2b', '2c'].map((k) => `arm ${w} finger ${k}`); })();
      return { side: p === 'l' ? 1 : -1, fingers: names.map((n) => find(n)).filter((b): b is THREE.Bone => !!b) };
    });

    const mixer = new THREE.AnimationMixer(root);
    const a = new Animator(root, mixer, arms, spine, legs, hands);
    a.isCarlos = !isGta;
    // ossos das pernas: nos socos e na tacada ficam parados (ver PLANTED)
    const legNames = new Set(legs.flatMap((l) => [l.thigh.name, l.calf.name, l.foot.name]));
    const planted = (name: string): boolean => PLANTED.has(name);
    // quadril: ancestral comum das pernas e da coluna (GTA: pélvis; Carlos: root_hips) e o osso da coluna logo abaixo dele
    let pelvis: THREE.Bone | undefined;
    let spineRoot: THREE.Bone | undefined;
    if (legs[0] && spine) {
      const isUnder = (o: THREE.Object3D, anc: THREE.Object3D): boolean => { for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n === anc) return true; return false; };
      for (let n = legs[0].thigh.parent; n && !pelvis; n = n.parent) if ((n as THREE.Bone).isBone && isUnder(spine.mid, n)) pelvis = n as THREE.Bone;
      for (let n: THREE.Object3D | null = spine.mid; n && pelvis; n = n.parent) if (n.parent === pelvis) { spineRoot = n as THREE.Bone; break; }
    }
    const keepFeet = (tracks: THREE.KeyframeTrack[], name: string): void => {
      if (!planted(name)) return;
      for (let i = 0; i < tracks.length; i++) {
        const tr = tracks[i]!;
        if (!legNames.has(tr.name.split('.')[0]!)) continue;
        tracks[i] = new THREE.QuaternionKeyframeTrack(tr.name, [0], Array.from(tr.values.slice(0, 4)));
      }
      // quadril também parado (girar o quadril com as pernas rígidas levantava o pé do chão); o giro vai para a coluna, então o tronco se mexe igual
      if (!pelvis || !spineRoot) return;
      const pi = tracks.findIndex((t) => t.name === `${pelvis.name}.quaternion`);
      const si = tracks.findIndex((t) => t.name === `${spineRoot.name}.quaternion`);
      const pt = tracks[pi];
      const st = tracks[si];
      if (!pt || !st || pt.times.length !== st.times.length) return;
      const p0 = new THREE.Quaternion().fromArray(pt.values, 0);
      const p0i = p0.clone().invert();
      const pv = Array.from(pt.values);
      const sv = Array.from(st.values);
      const qp = new THREE.Quaternion();
      const qs = new THREE.Quaternion();
      for (let k = 0; k < pt.times.length; k++) {
        qp.fromArray(pt.values, k * 4);
        qs.fromArray(st.values, k * 4);
        // coluna' = quadril_parado⁻¹ · quadril · coluna (a rotação do peito no mundo não muda)
        qs.premultiply(qp).premultiply(p0i);
        qs.toArray(sv, k * 4);
        p0.toArray(pv, k * 4);
      }
      tracks[pi] = new THREE.QuaternionKeyframeTrack(pt.name, Array.from(pt.times), pv);
      tracks[si] = new THREE.QuaternionKeyframeTrack(st.name, Array.from(st.times), sv);
    };
    a.addClips = (file) => {
      for (const [name, clip] of Object.entries(file)) {
        const tracks: THREE.KeyframeTrack[] = [];
        if (kind === 'gta') {
          const idToBone = new Map<number, THREE.Bone>();
          for (const [k, id] of Object.entries(GTA_BONE_IDS)) {
            const b = byGta.get(k);
            if (b) idToBone.set(id, b);
          }
          for (const tr of (clip as ClipData<GtaTrack>).tracks) {
            const bone = idToBone.get(tr.id);
            if (!bone) continue;
            const inv = tr.id === 1 && bone.parent ? bone.parent.quaternion.clone().invert() : null;
            tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, gtaConvert(tr.q, inv)));
          }
        } else {
          for (const tr of (clip as ClipData<BoneTrack>).tracks) {
            const bone = bySan(tr.bone);
            if (bone) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, tr.q));
          }
        }
        keepFeet(tracks, name);
        const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
        if (clip.drop) a.drops.set(name, clip.drop);
        if (clip.move) a.moves.set(name, clip.move);
        action.timeScale = TIME_SCALE[name] ?? 1;
        if (ONCE.has(name)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        a.actions.set(name, action);
      }
    };
    const base = kind === 'gta' ? '/anims/ped' : '/anims/carlos';
    a.addClips(await fetchJson(`${base}.json`));
    a.play('idle');
    // Animações extras (emotes, estilos de andar) carregam em segundo plano
    void fetchJson(`${base}-extra.json`).then((f) => a.addClips(f)).catch(() => undefined);
    return a;
  }

  /** Toca um clipe (loop, ou uma vez para clipes de ação). */
  play(name: string): void {
    if (name === this.clipName) return;
    const next = this.actions.get(name);
    if (!next) return;
    next.reset().play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, FADE, false);
    else next.fadeIn(FADE);
    this.current = next;
    this.clipName = name;
    this.done = false;
  }

  /** Tempo atual do clipe que está tocando (s do clipe, já com a velocidade). */
  get time(): number { return this.current?.time ?? 0; }

  /** Quanto o clipe dura de verdade (s), com a velocidade dele. */
  length(name: string): number {
    const a = this.actions.get(name);
    return a ? a.getClip().duration / Math.max(0.1, Math.abs(a.timeScale || 1)) : 1;
  }

  hasMotion(name: string): boolean { return this.moves.has(name); }

  /** Deslocamento acumulado do corpo (frente e esquerda, em metros) no tempo `t` do clipe, ou null se o clipe não desloca. */
  motionAt(name: string, t: number): { f: number; l: number } | null {
    const m = this.moves.get(name);
    if (!m) return null;
    const n = m.t.length;
    if (t <= m.t[0]!) return { f: m.f[0]!, l: m.l[0]! };
    if (t >= m.t[n - 1]!) return { f: m.f[n - 1]!, l: m.l[n - 1]! };
    let i = 1;
    while (i < n - 1 && m.t[i]! < t) i++;
    const k = (t - m.t[i - 1]!) / Math.max(1e-6, m.t[i]! - m.t[i - 1]!);
    return { f: m.f[i - 1]! + (m.f[i]! - m.f[i - 1]!) * k, l: m.l[i - 1]! + (m.l[i]! - m.l[i - 1]!) * k };
  }

  /** Duração de um clipe (s). Só para ferramentas de revisão. */
  duration(name: string): number { return this.actions.get(name)?.getClip().duration ?? 1; }

  /** Posa o personagem em um instante exato do clipe, sem transição (ferramenta de revisão). */
  seek(name: string, t: number): void {
    const a = this.actions.get(name);
    if (!a) return;
    this.actions.forEach((o) => { if (o !== a) o.stop(); });
    a.reset().play();
    a.setEffectiveWeight(1);
    this.current = a;
    this.clipName = name;
    this.armW = this.holdsWeapon ? 1 : 0;
    this.aimK = isAimPose(this.armed) ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      this.restoreClean();
      a.time = t;
      this.mixer.update(0);
      this.pose(10);
    }
  }

  /** Inclinação da mira (rad): o tronco, a cabeça e o fuzil acompanham (positivo = olhar para baixo). */
  setAimPitch(p: number): void {
    this.aimPitch = p;
  }

  /** Primeira pessoa: esconde a cabeça (a câmera fica na altura do peito) e devolve a posição do peito no mundo; false se o modelo não tem esqueleto. */
  firstPerson(on: boolean, out: THREE.Vector3): boolean {
    const head = this.spine?.head;
    if (!head) return false;
    head.scale.setScalar(on ? 0.001 : 1);
    if (!on) return false;
    // a câmera fica na altura do peito (e não dos olhos), para a arma aparecer na tela
    const chest = this.spine!.chest;
    chest.updateWorldMatrix(true, false);
    chest.getWorldPosition(out);
    return true;
  }

  /** Escalada: coloca as duas mãos em cima da borda (altura `rel` acima dos pés), palmas para baixo; null desliga. */
  setClimbHands(rel: number | null, w = 1): void {
    this.climbRel = rel;
    this.climbW = rel === null ? 0 : w;
  }

  /** Qual fuzil está na mão (muda onde ficam as mãos: empunhadura e guarda-mão). */
  setRifleKind(k: RifleKind): void {
    this.rifleKind = k;
  }

  /** Posições de arma em uso: poses do fuzil/pistola e, no fuzil, as mãos do modelo atual. */
  private cfgNow(): WeaponCfg {
    if (isSpray(this.armed)) return CFG_SPRAY;
    if (kindOf(this.armed) === 'pistol') return CFG.pistol;
    if (this.rifleKind === 'ak') return CFG.rifle;
    const g = rifleGeo(this.rifleKind);
    return { ...CFG.rifle, gripR: g.gripR, gripL: g.gripL };
  }

  /** Segurando o fuzil: braços na empunhadura, fuzil baixo (rifle) ou no ombro (aim). */
  setArmed(a: Armed): void {
    if (isKnifeLike(a) !== isKnifeLike(this.armed)) this.batLocal = null; // a calibração do taco não serve para a faca (e vice-versa)
    if (a === 'pistol_aim' && this.armed !== 'pistol_aim') { this.drawCrouch = this.crouchW > 0.5 && !!pistolOverlay?.pistol_cdraw; this.drawT = 0; this.drawDur = this.has('arrestgun') ? this.length('arrestgun') : 0.5; }
    if (a !== 'pistol_aim') this.drawT = -1;
    this.armed = a;
  }

  /** Soco direto do boxe (jab): braço da frente estica, o de trás protege o rosto, o tronco gira. */
  jab(): void {
    this.jabT = 0;
  }

  /** Recarregando a pistola: toca o colt45_reload nas mãos (a arma desce e vira, a mão esquerda vai buscar o carregador). */
  setReloading(on: boolean, dur = 1.6): void {
    if (on && !this.reloadOn) { this.reloadT = 0; this.reloadDur = dur; }
    if (!on) this.reloadT = -1;
    this.reloadOn = on;
  }

  /** Coice: o fuzil recua e sobe um pouco por um instante. */
  kick(): void {
    this.recoil = 1;
  }

  /** Corpo solto (jogado da moto): braços e pernas balançam por cima do clipe. w = 0 desliga. */
  setFlail(w: number): void {
    this.flailW = THREE.MathUtils.clamp(w, 0, 1);
  }

  /** O objeto da arma passa a ser posicionado por este animador (seguindo o peito). */
  attachWeapon(anchor: THREE.Object3D): void {
    this.weapon = anchor;
  }

  /** O taco segue a mão direita (o clipe dá o movimento). */
  attachBat(anchor: THREE.Object3D): void {
    this.bat = anchor;
  }

  /** Reinicia o mesmo clipe de ação (ex.: pular de novo). */
  restart(name: string): void {
    this.clipName = '';
    this.play(name);
  }

  update(dt: number): void {
    this.restoreClean();
    this.mixer.update(dt);
    this.pose(dt);
  }

  /** Devolve os ossos mexidos à pose do clipe antes do mixer rodar. */
  private restoreClean(): void {
    if (!this.dirty) return;
    for (const b of this.touched) b.quaternion.copy(this.clean.get(b)!);
    this.dirty = false;
  }

  /**
   * Sentado na moto: a pélvis vai para o assento (seat, no espaço do personagem). null = em pé.
   * `lean` = quanto o tronco deita para alcançar o guidão (0 ereto, 1.5 peito no tanque): custom/cruiser pouco, esportiva muito.
   */
  setRide(seat: THREE.Vector3 | null, grips: [THREE.Vector3, THREE.Vector3] | null = null, lean = 1.5): void {
    this.ride = seat ? { x: seat.x, y: seat.y - 0.97, z: seat.z, grips, lean } : null;
  }

  /** Desloca o modelo (entrando/saindo do carro): x para a esquerda, y para cima (pélvis), z para a frente. */
  setRideRaw(o: { x: number; y: number; z: number } | null): void {
    this.ride = o ? { x: o.x, y: o.y, z: o.z, grips: null, lean: 0 } : null;
  }


  /** Mergulho: o corpo desce até o chão (o IFP tem a altura da raiz, que não usamos como osso). */
  private applyDrop(): void {
    const model = this.root.children[0];
    if (!model) return;
    if (this.modelY0 === null) { this.modelY0 = model.position.y; this.modelZ0 = model.position.z; this.modelX0 = model.position.x; }
    const d = this.drops.get(this.clipName);
    let y = 0;
    if (d && this.current) {
      const t = this.current.time;
      const i = d.t.findIndex((x) => x >= t);
      if (i <= 0) y = d.y[Math.max(i, 0)] ?? 0;
      else y = d.y[i - 1]! + ((d.y[i]! - d.y[i - 1]!) * (t - d.t[i - 1]!)) / Math.max(1e-6, d.t[i]! - d.t[i - 1]!);
      if (i < 0) y = d.y[d.y.length - 1]!;
    }
    if (GROUNDED.has(this.clipName)) y = this.groundedDrop(model, this.modelY0);
    y += this.groundDrop + (this.ride?.y ?? 0);
    model.position.y = this.modelY0 + y;
    model.position.z = this.modelZ0 + (this.ride?.z ?? 0);
    model.position.x = this.modelX0 + (this.ride?.x ?? 0);
  }

  /** Quanto o corpo precisa descer para o osso mais baixo tocar o chão (nunca sobe: em pé fica 0). Cobre cair, ficar deitado e levantar. */
  private groundedDrop(model: THREE.Object3D, y0: number): number {
    if (!this.allBones) {
      this.allBones = [];
      model.traverse((o) => { if ((o as THREE.Bone).isBone && !/eye|lip|mouth|jaw|brow|_rootJoint|root_ground|footsteps/i.test(o.name)) this.allBones!.push(o); });
    }
    model.position.y = y0; // mede sem descida
    this.updateRoot();
    const v = new THREE.Vector3();
    let low = Infinity;
    for (const b of this.allBones) low = Math.min(low, this.posIn(b, v).y);
    return Math.min(0, LIE_CONTACT - low);
  }

  private pose(dt: number): void {
    this.applyDrop();
    // braços por IK só quando o clipe não segura o fuzil sozinho (ou ao mirar no ombro)
    const kind = kindOf(this.armed);
    const dbgRoll = (window as unknown as { __ROLL?: number }).__ROLL;
    // segurando arma: palmas viradas uma para a outra (para dentro); no guidão/volante a palma fica para baixo
    const cr = (window as unknown as { __CROLL?: number }).__CROLL;
    this.armRoll = this.climbRel !== null ? (cr !== undefined ? cr * (Math.PI / 180) : CLIMB_ROLL) : dbgRoll !== undefined ? dbgRoll * (Math.PI / 180) : this.holdsWeapon && kind && !this.ride?.grips ? Math.PI / 2 : 0;
    const hr = (window as unknown as { __HROLL?: number }).__HROLL;
    this.handRoll = hr !== undefined ? hr * (Math.PI / 180) : isSpray(this.armed) ? SPRAY_HAND_ROLL : 0;
    const hb = (window as unknown as { __HBEND?: number }).__HBEND;
    this.handBend = hb !== undefined ? hb * (Math.PI / 180) : isSpray(this.armed) ? SPRAY_HAND_BEND : 0;
    const ikTarget = !this.holdsWeapon || kind === 'bat' || !kind ? 0 : 1; // braços sempre por IK nas empunhaduras (pose da foto de referência)
    this.armW += (ikTarget - this.armW) * Math.min(1, dt * 10);
    this.aimK += ((isAimPose(this.armed) ? 1 : 0) - this.aimK) * Math.min(1, dt * 9);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.reloadT >= 0) { this.reloadT += dt; if (this.reloadT >= this.reloadDur) this.reloadT = -1; }
    if (this.drawT >= 0) { this.drawT += dt; if (this.drawT >= this.drawDur) this.drawT = -1; }
    // agachado parado: tronco desce; andando agachado o clipe já inclina o corpo, então só um pouco
    const crouchT = this.clipName === 'crouch_idle' ? 1 : this.clipName.startsWith('crouch_') ? 0.2 : 0;
    this.crouchK += (crouchT - this.crouchK) * Math.min(1, dt * 8);
    this.crouchW += ((this.clipName.startsWith('crouch_') ? 1 : 0) - this.crouchW) * Math.min(1, dt * 8);
    this.legK += ((this.clipName === 'crouch_fwd' || this.clipName === 'crouch_bwd' ? 1 : 0) - this.legK) * Math.min(1, dt * 8);
    const leanT = this.clipName === 'sprint' || this.clipName === 'run' || this.clipName.startsWith('crouch_') ? 1 : 0;
    this.leanK += (leanT - this.leanK) * Math.min(1, dt * 8);
    let jabW = 0;
    let jabE = 0;
    if (this.jabT >= 0) {
      this.jabT += dt / JAB_TIME;
      if (this.jabT >= 1) this.jabT = -1;
      else {
        const t = this.jabT;
        jabW = THREE.MathUtils.clamp(Math.min(t / 0.12, (1 - t) / 0.22), 0, 1);
        jabE = t < 0.32 ? Math.sin((t / 0.32) * Math.PI * 0.5) : Math.pow(1 - (t - 0.32) / 0.68, 1.6);
      }
    }
    if (this.ride?.grips && (this.clipName === 'bike_ride' || this.clipName === 'car_sit')) {
      for (const b of this.touched) this.clean.get(b)!.copy(b.quaternion);
      this.dirty = true;
      this.updateRoot();
      // deita o tronco para a frente para as mãos alcançarem o guidão (mais nas motos esportivas, onde o guidão é baixo)
      if (this.spine) {
        const lean = this.clipName === 'bike_ride' ? this.ride.lean : 0; // esportiva: peito quase no tanque; custom: quase ereto
        this.rotateBone(this.spine.mid, new THREE.Quaternion().setFromAxisAngle(X, lean * 0.45));
        this.rotateBone(this.spine.chest, new THREE.Quaternion().setFromAxisAngle(X, lean * 0.4));
        this.rotateBone(this.spine.neck, new THREE.Quaternion().setFromAxisAngle(X, -lean * 0.3));
        this.rotateBone(this.spine.head, new THREE.Quaternion().setFromAxisAngle(X, -lean * 0.3));
        this.updateRoot();
      }
      for (const arm of this.arms) this.solveArm(arm, arm.side > 0 ? this.ride.grips[0] : this.ride.grips[1], 1, dt);
      this.curlHand(1, 1);
      this.curlHand(-1, 1);
      return;
    }
    const armed = this.armW >= 0.01;
    const holding = this.holdsWeapon;
    // briga: mãos fechadas em punho; chute 1 ganha um chute de verdade (o clipe original só tem socos)
    const fist = this.clipName.startsWith('punch_') || this.clipName.startsWith('kick_') || this.clipName === 'combat_idle' || this.clipName.startsWith('hit');
    const kickT = this.clipName === 'kick_1' && this.current ? this.current.time / this.current.getClip().duration : -1;
    const kickW = kickT >= 0 ? Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp((kickT - 0.3) / 0.45, 0, 1))) : 0;
    if (kind === 'bat' && holding) this.poseBat();
    // andando/correndo com arma branca o clipe balança os braços e a arma apontaria para o chão (muleta): carrega para cima
    const carry = kind === 'bat' && holding && !isKnifeLike(this.armed) && !this.clipName.startsWith('bat_') && !fist;
    this.carryW = carry ? this.carryW + (1 - this.carryW) * Math.min(1, dt * 10) : 0;
    const flail = this.flailW;
    if (flail > 0) this.flailT += dt;
    if ((!armed && !holding && !fist && kickW === 0 && flail === 0 && this.crouchK < 0.01 && this.legK < 0.01 && this.leanK < 0.01 && jabW === 0 && this.climbRel === null) || !this.spine) {
      this.groundFeet(dt);
      for (const b of this.touched) this.clean.set(b, b.quaternion.clone()); // tudo vem do clipe
      return;
    }
    for (const b of this.touched) this.clean.get(b)!.copy(b.quaternion);
    this.dirty = true;
    this.updateRoot();
    this.bendTorso();
    if (this.legK >= 0.01) this.flexLegs();
    if (this.clipName === 'crouch_idle' && this.crouchK > 0.01) this.openHips(this.crouchK);
    if ((this.legK >= 0.01 || this.leanK >= 0.01)) this.uprightTorso(Math.max(this.legK, this.leanK), this.clipName !== 'crouch_idle', this.clipName === 'crouch_idle' ? 1.5 : 1);
    if (kickW > 0) this.applyKick(kickW);
    if (flail > 0) this.applyFlail(flail);
    if (fist) { this.curlHand(1, 1.4); this.curlHand(-1, 1.4); }
    if (jabW > 0) this.applyJab(jabW, jabE, dt);
    this.updateRoot();
    this.groundFeet(dt);
    if (this.climbRel !== null && this.climbW > 0.01) {
      // mãos na borda: palma para baixo sobre o objeto, um pouco à frente do corpo e uma de cada lado
      const rel = this.climbRel;
      for (const arm of this.arms) this.solveArm(arm, new THREE.Vector3(arm.side * 0.2, rel + 0.03, 0.42), this.climbW, dt);
      this.updateRoot();
    }
    if (!armed && !holding) return;
    if (kind === 'bat' && this.carryW > 0.01) this.carryBat(dt);
    this.updateRoot();
    const frame = this.weaponFrame();
    if (this.weapon) {
      this.weapon.position.copy(frame.pos);
      this.weapon.quaternion.copy(frame.q);
    }
    if (armed) for (const arm of this.arms) this.poseArm(arm, frame, dt);
    if (holding) {
      // mãos fechadas no cabo: fuzil, taco e pistola (duas mãos, também abaixada)
      this.curlHand(-1, isSpray(this.armed) ? SPRAY_CURL : 1);
      this.curlHand(1, isSpray(this.armed) ? 0 : 1);
      // faca, garrafa e cutelo (uma mão): o cabo fica no meio dos dedos já fechados, não acima da mão (o osso da mão + PALM deixava a arma flutuando)
      if (kind === 'bat' && isKnifeLike(this.armed) && this.bat) {
        const fingers = this.hands.find((h) => h.side === -1)?.fingers ?? [];
        if (fingers.length) {
          this.updateRoot();
          const c = new THREE.Vector3();
          const v = new THREE.Vector3();
          for (const f of fingers) c.add(this.posIn(f, v));
          c.divideScalar(fingers.length);
          this.bat.position.copy(c);
        }
      }
    }
  }

  /** Pé mais baixo (altura no espaço do modelo, sem contar o quanto o modelo já desceu). */
  private lowestFoot(): number {
    const model = this.root.children[0];
    let low = Infinity;
    const v = new THREE.Vector3();
    for (const l of this.legs) low = Math.min(low, this.posIn(l.foot, v).y);
    return low - (model?.position.y ?? 0);
  }

  /** Agachado: o corpo desce até o pé mais baixo tocar o chão (sem isso ele fica flutuando). */
  private groundFeet(dt: number): void {
    if (this.legs.length === 0) return;
    const crouching = this.clipName.startsWith('crouch_');
    let target = 0;
    if (crouching) {
      this.updateRoot();
      target = -Math.max(0, this.lowestFoot() - this.footRest);
    }
    this.groundDrop += (target - this.groundDrop) * Math.min(1, dt * 12);
    if (Math.abs(this.groundDrop) < 1e-4) this.groundDrop = 0;
  }

  /** Andando agachado o clipe inclina o tronco para o lado esquerdo: desfaz essa inclinação (roll) para ele andar reto. */
  private uprightTorso(k: number, level = true, gain = 1): void {
    const sp = this.spine!;
    this.updateRoot();
    const head = this.posIn(sp.head, new THREE.Vector3());
    const lean = Math.atan2(head.x, Math.max(0.2, head.y - 0.63)); // + = cabeça para a esquerda do corpo
    const fix = THREE.MathUtils.clamp(lean, -0.4, 0.4) * k * gain;
    // roll em torno do eixo de frente (Z): positivo leva a parte de cima para a direita
    if (!level) {
      // agachado parado: a coluna faz um S (cintura volta para a direita, peito para a esquerda): a cabeça volta ao centro sem inclinar a linha dos ombros
      this.rotateBone(sp.mid, new THREE.Quaternion().setFromAxisAngle(Z, fix));
      this.rotateBone(sp.chest, new THREE.Quaternion().setFromAxisAngle(Z, -fix * 0.9));
      return;
    }
    this.rotateBone(sp.mid, new THREE.Quaternion().setFromAxisAngle(Z, fix * 0.5));
    this.rotateBone(sp.chest, new THREE.Quaternion().setFromAxisAngle(Z, fix * 0.5));
    // linha dos ombros: nivela mais um pouco
    const l = this.arms.find((a) => a.side > 0);
    const r = this.arms.find((a) => a.side < 0);
    if (l && r && level) {
      this.updateRoot();
      const dy = this.posIn(l.u, new THREE.Vector3()).y - this.posIn(r.u, new THREE.Vector3()).y;
      this.rotateBone(sp.chest, new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.clamp(-dy * 2.2, -0.25, 0.25) * k));
    }
  }

  /** Agachado parado: o clipe dobra o quadril além do que a pele aguenta e a malha das nádegas se deforma; abre um pouco o ângulo da coxa. */
  private openHips(k: number): void {
    const thigh = new THREE.Quaternion().setFromAxisAngle(X, 0.3 * k);
    for (const l of this.legs) this.rotateBone(l.thigh, thigh);
  }

  /** Andando agachado: joelhos mais dobrados (coxa para a frente, canela de volta) para o corpo ficar mais baixo. */
  private flexLegs(): void {
    const k = this.legK;
    const thigh = new THREE.Quaternion().setFromAxisAngle(X, -0.7 * k);
    const calf = new THREE.Quaternion().setFromAxisAngle(X, 0.55 * k);
    // o passo do clipe (GunCrouch) vai na diagonal para a esquerda: gira as pernas para o passo seguir em frente
    const straighten = new THREE.Quaternion().setFromAxisAngle(Y, -0.5 * k);
    const unTwist = new THREE.Quaternion().setFromAxisAngle(Y, 0.5 * k);
    for (const l of this.legs) {
      this.rotateBone(l.thigh, straighten.clone().multiply(thigh));
      this.rotateBone(l.calf, calf);
      this.rotateBone(l.foot, unTwist); // os pés voltam a apontar para a frente
    }
  }

  /** Chute procedural: a perna da frente sobe e estica (dura enquanto kickW > 0). */
  private applyKick(w: number): void {
    const leg = this.legs[this.legs.length - 1];
    if (!leg) return;
    this.rotateBone(leg.thigh, new THREE.Quaternion().setFromAxisAngle(X, -1.45 * w));
    this.updateRoot();
    this.rotateBone(leg.calf, new THREE.Quaternion().setFromAxisAngle(X, 0.55 * w));
    // tronco recua um pouco para equilibrar
    if (this.spine) this.rotateBone(this.spine.mid, new THREE.Quaternion().setFromAxisAngle(X, -0.25 * w));
    this.updateRoot();
  }

  /** Ragdoll falso: cada membro balança com uma onda própria (frequências diferentes para não parecer dança). */
  private applyFlail(w: number): void {
    const t = this.flailT;
    const s = (f: number, ph: number): number => Math.sin(t * f + ph);
    const arms = this.arms;
    arms.forEach((arm, i) => {
      const ph = i * 2.1;
      // braço: abre para o lado e para cima; antebraço dobra
      this.rotateBone(arm.u, new THREE.Quaternion().setFromAxisAngle(Z, arm.side * (0.9 + 0.5 * s(9, ph)) * w)
        .multiply(new THREE.Quaternion().setFromAxisAngle(X, (0.5 * s(7, ph + 1)) * w)));
      this.updateRoot();
      this.rotateBone(arm.f, new THREE.Quaternion().setFromAxisAngle(X, (-0.6 - 0.5 * s(11, ph + 2)) * w));
    });
    this.legs.forEach((leg, i) => {
      const ph = i * 1.7 + 0.8;
      this.rotateBone(leg.thigh, new THREE.Quaternion().setFromAxisAngle(X, (-0.5 + 0.5 * s(8, ph)) * w)
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z, (i === 0 ? 1 : -1) * 0.25 * w)));
      this.updateRoot();
      this.rotateBone(leg.calf, new THREE.Quaternion().setFromAxisAngle(X, (0.6 + 0.4 * s(10, ph + 1)) * w));
    });
    if (this.spine) {
      this.rotateBone(this.spine.head, new THREE.Quaternion().setFromAxisAngle(X, 0.35 * s(6, 0.3) * w).multiply(new THREE.Quaternion().setFromAxisAngle(Z, 0.3 * s(5, 2) * w)));
    }
    this.updateRoot();
  }

  private applyJab(w: number, e: number, dt: number): void {
    const sp = this.spine!;
    const turn = new THREE.Quaternion().setFromAxisAngle(Y, -0.32 * e * w);
    this.rotateBone(sp.mid, new THREE.Quaternion().setFromAxisAngle(Y, -0.12 * e * w));
    this.rotateBone(sp.chest, turn);
    this.updateRoot();
    for (const arm of this.arms) {
      const guard = arm.side > 0 ? P3(0.1, 1.37, 0.27) : P3(-0.1, 1.4, 0.25);
      // braço da frente (esquerdo) estica na altura do ombro; o de trás só protege o rosto
      const target = arm.side > 0 ? guard.clone().lerp(P3(0.04, 1.5, 0.78), e) : guard;
      this.solveArm(arm, target, w, dt);
    }
  }

  /** Taco/bandeira com as duas mãos: o mastro passa pelas mãos (a mão direita segura perto da base; a ponta aponta para o lado da mão esquerda). */
  private poseBat(): void {
    const right = this.arms.find((a) => a.side < 0);
    const left = this.arms.find((a) => a.side > 0);
    if (!this.bat || !right || !left) return;
    this.updateRoot();
    const palm = (arm: Arm): THREE.Vector3 => {
      const hand = this.posIn(arm.h, new THREE.Vector3());
      const elbow = this.posIn(arm.f, new THREE.Vector3());
      return hand.addScaledVector(hand.clone().sub(elbow).normalize(), PALM);
    };
    const hr = palm(right);
    const handQ = this.quatIn(right.h, new THREE.Quaternion());
    this.bat.position.copy(hr);
    const knife = isKnifeLike(this.armed);
    if (knife) {
      // arma de uma mão (faca, garrafa): presa à mão direita; a orientação no espaço da mão é calibrada no knife_idle (lâmina para a frente e um pouco para cima)
      const idle = this.clipName === 'knife_idle' && (this.current?.getEffectiveWeight() ?? 0) > 0.98;
      const want = new THREE.Vector3(0, 0.35, 0.94).normalize();
      if (idle) {
        const xA = new THREE.Vector3().crossVectors(Y, want).normalize();
        const yA = new THREE.Vector3().crossVectors(want, xA);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, want));
        this.batLocal = handQ.clone().invert().multiply(q);
      }
      if (this.batLocal) this.bat.quaternion.copy(handQ).multiply(this.batLocal);
      else this.bat.quaternion.copy(handQ.clone().multiply(right.q0[2].clone().invert()).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), want)));
      return;
    }
    // o mastro fica preso à mão direita (como no GTA): a orientação no espaço da mão é calibrada no bat_idle (arma para cima e um pouco para a frente).
    // Antes ela vinha da reta entre as duas mãos, mas no bat_idle as mãos ficam coladas (~14 cm) e a reta virava de cima para baixo a cada poucos quadros (a arma "pulava")
    const settled = this.clipName === 'bat_idle' && (this.current?.getEffectiveWeight() ?? 0) > 0.98;
    const want = new THREE.Vector3(0, 0.88, 0.47).normalize();
    if (settled) {
      const xA = new THREE.Vector3().crossVectors(Y, want).normalize();
      const yA = new THREE.Vector3().crossVectors(want, xA);
      this.batLocal = handQ.clone().invert().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, want)));
    }
    if (this.batLocal) {
      this.bat.quaternion.copy(handQ).multiply(this.batLocal);
      return;
    }
    // ainda sem calibração (primeiros quadros): só a mão direita segura; taco para a frente e para cima
    const delta = handQ.clone().multiply(right.q0[2].clone().invert());
    const rest = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), want);
    this.bat.quaternion.copy(delta.multiply(rest));
  }

  /** Arma branca carregada para cima: mão direita na frente do peito, esquerda mais acima no cabo, arma inclinada para a frente. */
  private carryBat(dt: number): void {
    const right = this.arms.find((a) => a.side < 0);
    const left = this.arms.find((a) => a.side > 0);
    if (!this.bat || !right || !left) return;
    const w = this.carryW;
    const dir = P3(-0.12, 0.9, 0.42).normalize();
    const hr = P3(-0.27, 1.12, 0.3);
    this.solveArm(right, hr, w, dt);
    this.solveArm(left, hr.clone().addScaledVector(dir, 0.22), w, dt);
    this.updateRoot();
    const hand = this.posIn(right.h, new THREE.Vector3());
    const elbow = this.posIn(right.f, new THREE.Vector3());
    this.bat.position.copy(hand.addScaledVector(hand.clone().sub(elbow).normalize(), PALM));
    const xAxis = new THREE.Vector3().crossVectors(Y, dir).normalize();
    const yAxis = new THREE.Vector3().crossVectors(dir, xAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, dir));
    this.bat.quaternion.slerp(q, w);
  }

  /** Fecha a mão em torno do cabo (w: 0 aberta, 1 fechada). Os dedos dobram no eixo local Z do osso. */
  private curlHand(side: 1 | -1, w: number): void {
    if (w < 0.01) return;
    const hand = this.hands.find((h) => h.side === side);
    if (!hand) return;
    const dbg = (window as unknown as { __CURL?: number[] }).__CURL;
    const ax = dbg ? new THREE.Vector3(dbg[0], dbg[1], dbg[2]) : CURL_AXIS;
    const ang = (dbg?.[3] ?? 75) * (Math.PI / 180) * (dbg?.[4] === 0 ? 1 : side) * w;
    hand.fingers.forEach((b, i) => {
      const thumb = this.isCarlos ? i < 2 : false;
      const a = ang * (thumb ? 0.45 : 1) * (this.isCarlos ? 0.75 : 1);
      b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax, a));
      b.updateMatrixWorld(true);
    });
  }

  private updateRoot(): void {
    this.root.updateMatrixWorld(true);
    this.rootInv.copy(this.root.matrixWorld).invert();
  }

  private posIn(bone: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    this.tmpM.multiplyMatrices(this.rootInv, bone.matrixWorld);
    return out.setFromMatrixPosition(this.tmpM);
  }

  private quatIn(obj: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    this.tmpM.multiplyMatrices(this.rootInv, obj.matrixWorld);
    this.tmpM.decompose(new THREE.Vector3(), out, new THREE.Vector3());
    return out;
  }

  /** Gira um osso por uma rotação dada no espaço do personagem (não depende dos eixos do osso). */
  private rotateBone(bone: THREE.Bone, r: THREE.Quaternion): void {
    const q = this.quatIn(bone, new THREE.Quaternion());
    const parent = this.quatIn(bone.parent!, new THREE.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(r.clone().multiply(q)));
    bone.updateMatrixWorld(true);
  }

  /** Agachado: o tronco desce para a frente. Com o fuzil: inclina com a mira, gira um pouco e a cabeça olha para onde mira. */
  private bendTorso(): void {
    const sp = this.spine!;
    const w = this.armW;
    const c = this.crouchK;
    const p = THREE.MathUtils.clamp(this.aimPitch, -1.1, 1.1);
    const turn = 0.12 * this.aimK * w;
    const rot = (pitch: number, yaw: number): THREE.Quaternion =>
      new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X, pitch));
    let err = 0;
    if (w > 0) {
      // o clipe gira o tronco para a pose do estilo GTA: desfaz parte disso para o peito olhar para a mira
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(
        this.quatIn(sp.chest, new THREE.Quaternion()).multiply(this.chestRest.q.clone().invert()),
      );
      err = Math.atan2(f.x, f.z) * w;
    }
    this.rotateBone(sp.mid, rot(p * 0.12 * w + 0.32 * c, turn * 0.4 - err * 0.45));
    this.rotateBone(sp.chest, rot(p * 0.2 * w + 0.3 * c, turn * 0.6 - err * 0.4));
    // cabeça: olha para onde mira e encosta a bochecha na coronha; agachado levanta para olhar à frente
    const roll = new THREE.Quaternion().setFromAxisAngle(Z, 0.16 * this.aimK * w);
    this.rotateBone(sp.head, rot(p * 0.3 * w + 0.08 * this.aimK * w - 0.3 * c, -turn * 0.7).multiply(roll));
  }

  /** Onde fica o fuzil: acompanha o peito e aponta para onde a câmera mira. */
  private weaponFrame(): { pos: THREE.Vector3; q: THREE.Quaternion } {
    const sp = this.spine!;
    const chestPos = this.posIn(sp.chest, new THREE.Vector3());
    const chestQ = this.quatIn(sp.chest, new THREE.Quaternion());
    const delta = chestQ.multiply(this.chestRest.q.clone().invert()); // só o movimento do peito
    const k = this.aimK;
    const cfg = this.cfgNow();
    // só o giro do peito para os lados (sem a curvatura): agachado ou mirando, a arma fica à frente do peito em vez de descer com o tronco
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(delta);
    const flat = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(fwd.x, fwd.z));
    const aimRot = flat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.32 * THREE.MathUtils.clamp(this.aimPitch, -1.1, 1.1)));
    const lowRot = delta.clone().slerp(flat, this.crouchW);
    const rot = lowRot.slerp(aimRot, k);
    const off = cfg.crouchLow.clone().lerp(cfg.crouchAim, k).multiplyScalar(this.crouchW);
    const pos = cfg.low.pos.clone().lerp(cfg.aim.pos, k).sub(this.chestRest.pos).add(off).applyQuaternion(rot).add(chestPos);
    const pitch = THREE.MathUtils.lerp(cfg.low.pitch + this.aimPitch * 0.5, this.aimPitch, k) - 0.05 * this.recoil;
    const yaw = THREE.MathUtils.lerp(cfg.low.yaw, cfg.aim.yaw, k);
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X, pitch));
    // clipe feito para segurar o fuzil: a arma fica entre as duas mãos do clipe (direita na empunhadura, esquerda no guarda-mão)
    const right = this.arms.find((a) => a.side < 0);
    const left = this.arms.find((a) => a.side > 0);
    if (false as boolean && right && left && cfg === CFG.rifle && OWN_HOLD(this.clipName) && k < 0.999) {
      const palm = (arm: Arm): THREE.Vector3 => {
        const hand = this.posIn(arm.h, new THREE.Vector3());
        const elbow = this.posIn(arm.f, new THREE.Vector3());
        return hand.addScaledVector(hand.clone().sub(elbow).normalize(), PALM);
      };
      const hr = palm(right);
      const hl = palm(left);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(delta);
      const axis = hl.clone().sub(hr);
      // o eixo da arma vai da mão direita para a esquerda; se as mãos estão quase juntas, segue a frente do peito
      const len = axis.length();
      axis.normalize().multiplyScalar(THREE.MathUtils.clamp(len / 0.25, 0, 1)).addScaledVector(fwd, 1 - THREE.MathUtils.clamp(len / 0.25, 0, 1)).normalize();
      if (axis.dot(fwd) < 0.2) axis.addScaledVector(fwd, 0.6).normalize(); // nunca aponta para o próprio corpo
      const xAxis = new THREE.Vector3().crossVectors(Y, axis).normalize();
      const yAxis = new THREE.Vector3().crossVectors(axis, xAxis);
      const qh = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, axis));
      const mid = cfg.gripR.clone().add(cfg.gripL).multiplyScalar(0.5).applyQuaternion(qh);
      const byHands = hr.clone().add(hl).multiplyScalar(0.5).sub(mid).addScaledVector(axis, 0.07); // um pouco à frente: a coronha não encosta no queixo
      pos.lerp(byHands, 1 - k);
      q.slerp(qh, 1 - k);
    }
    pos.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(q), 0.05 * this.recoil); // recua no coice
    this.ovLeft = null;
    // animações curtas nas mãos da pistola: recarregar (colt45_reload) e sacar até mirar (ARRESTgun)
    const pistol = kindOf(this.armed) === 'pistol' && !isSpray(this.armed);
    let tr: HandTrack | undefined;
    let ot = 0;
    let od = 1;
    let w = 1;
    if (pistol && this.reloadT >= 0) {
      tr = pistolOverlay?.pistol_reload;
      ot = this.reloadT; od = this.reloadDur;
      w = THREE.MathUtils.clamp(Math.min(ot / 0.12, (od - ot) / 0.15), 0, 1);
    } else if (pistol && this.drawT >= 0) {
      tr = this.drawCrouch ? pistolOverlay?.pistol_cdraw : pistolOverlay?.pistol_draw;
      ot = this.drawT; od = this.drawDur;
      if (this.drawCrouch) od = 0.3; // só a subida do colt45_crouchfire (o resto é segurar e baixar)
      w = THREE.MathUtils.clamp(ot / 0.05, 0, 1); // o clipe termina na pose de mirar: sem peso de saída
    }
    if (tr) {
      const ct = Math.min(1, ot / od) * (tr === pistolOverlay?.pistol_cdraw ? 0.26 : tr.duration);
      let i = 1;
      while (i < tr.t.length - 1 && tr.t[i]! < ct) i++;
      const k = THREE.MathUtils.clamp((ct - tr.t[i - 1]!) / Math.max(1e-6, tr.t[i]! - tr.t[i - 1]!), 0, 1);
      const v3 = (a: number[]): THREE.Vector3 => new THREE.Vector3(a[(i - 1) * 3]!, a[(i - 1) * 3 + 1]!, a[(i - 1) * 3 + 2]!).lerp(new THREE.Vector3(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!), k);
      const rp = v3(tr.rp).multiplyScalar(w).applyQuaternion(flat);
      const qa = new THREE.Quaternion().fromArray(tr.rq, (i - 1) * 4).slerp(new THREE.Quaternion().fromArray(tr.rq, i * 4), k);
      const dq = new THREE.Quaternion().slerp(qa, w); // identidade → giro do clipe, com o peso de entrada e saída
      pos.add(rp);
      q.premultiply(flat.clone().multiply(dq).multiply(flat.clone().invert()));
      this.ovLeft = { lr: v3(tr.lr).applyQuaternion(flat), w };
    }
    return { pos, q };
  }

  private poseArm(arm: Arm, frame: { pos: THREE.Vector3; q: THREE.Quaternion }, dt: number): void {
    const cfgHold = this.cfgNow();
    const w = isSpray(this.armed) && arm.side > 0 ? 0 : this.armW; // lata de spray: só a mão direita segura
    if (w < 0.01) return;
    const wrist = (arm.side < 0 ? cfgHold.gripR : cfgHold.gripL).clone().applyQuaternion(frame.q).add(frame.pos);
    if (arm.side > 0 && this.ovLeft) {
      // recarregando: a mão esquerda segue o colt45_reload em relação ao pulso direito
      const rW = cfgHold.gripR.clone().applyQuaternion(frame.q).add(frame.pos);
      wrist.lerp(rW.add(this.ovLeft.lr), this.ovLeft.w);
    }
    this.solveArm(arm, wrist, w, dt);
  }

  /** Leva a mão do braço até `wrist` (espaço do personagem) com peso `w` sobre o que o clipe fez. */
  private solveArm(arm: Arm, target: THREE.Vector3, w: number, dt: number): void {
    // o alvo é onde a PALMA deve ficar: o pulso fica um pouco antes, na direção do ombro
    const sh0 = this.posIn(arm.u, new THREE.Vector3());
    const wrist = target.clone().addScaledVector(target.clone().sub(sh0).normalize(), -PALM);
    // clavícula: acompanha um pouco o braço (evita o ombro "rasgar" quando o braço sobe)
    if (arm.c) {
      arm.c.updateMatrixWorld(true);
      const cp = this.posIn(arm.c, new THREE.Vector3());
      const want = wrist.clone().sub(cp).normalize();
      const dirC = arm.cdir0.clone().lerp(want, 0.3).normalize();
      const world = new THREE.Quaternion().setFromUnitVectors(arm.cdir0, dirC).multiply(arm.cq0);
      const parent = this.quatIn(arm.c.parent!, new THREE.Quaternion());
      arm.c.quaternion.slerp(parent.invert().multiply(world), w);
      arm.c.updateMatrixWorld(true);
    }
    const shoulder = this.posIn(arm.u, new THREE.Vector3());
    // cotovelo: triângulo ombro-cotovelo-pulso; o lado é dado pelo "pole" (cotovelo para baixo e para fora)
    const to = wrist.clone().sub(shoulder);
    const d = THREE.MathUtils.clamp(to.length(), 0.05, arm.len[0] + arm.len[1] - 0.01);
    const dir = to.normalize();
    const along = (arm.len[0] ** 2 - arm.len[1] ** 2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(arm.len[0] ** 2 - along * along, 0));
    const pole = arm.pole.clone().addScaledVector(dir, -arm.pole.dot(dir)).normalize();
    const elbow = shoulder.clone().addScaledVector(dir, along).addScaledVector(pole, h);
    const tU = elbow.clone().sub(shoulder).normalize();
    const tF = wrist.clone().sub(elbow).normalize();

    const k = Math.min(1, dt * 14);
    arm.curU.lerp(tU, k).normalize();
    arm.curF.lerp(tF, k).normalize();
    const qU = new THREE.Quaternion().setFromUnitVectors(arm.dir0[0], arm.curU);
    const qF = new THREE.Quaternion().setFromUnitVectors(arm.dir0[1], arm.curF);
    const bones = [arm.u, arm.f, arm.h] as const;
    const deltas = [qU, qF, qF] as const;
    const parentQ = new THREE.Quaternion();
    for (let i = 0; i < 3; i++) {
      const bone = bones[i]!;
      this.quatIn(bone.parent!, parentQ);
      let world = deltas[i]!.clone().multiply(arm.q0[i]!);
      if (i > 0 && this.armRoll !== 0) world = new THREE.Quaternion().setFromAxisAngle(arm.curF, this.armRoll * arm.side).multiply(world);
      if (i === 2 && this.handRoll !== 0) world = new THREE.Quaternion().setFromAxisAngle(arm.curF, this.handRoll * arm.side).multiply(world);
      if (i === 2 && this.handBend !== 0) {
        // pulso para trás: a mão gira em volta do eixo esquerda-direita (perpendicular ao antebraço e à vertical), sem mexer no braço
        const axis = new THREE.Vector3().crossVectors(arm.curF, Y).normalize();
        if (axis.lengthSq() > 0.01) world = new THREE.Quaternion().setFromAxisAngle(axis, this.handBend).multiply(world);
      }
      const target = parentQ.invert().multiply(world);
      bone.quaternion.slerp(target, w);
      bone.updateMatrixWorld(true);
    }
  }
}

function buildArm(side: 1 | -1, u: THREE.Bone, f: THREE.Bone, h: THREE.Bone, c: THREE.Bone | null, root: THREE.Object3D): Arm {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const quat = (o: THREE.Object3D): THREE.Quaternion => {
    m.multiplyMatrices(inv, o.matrixWorld);
    const out = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), out, new THREE.Vector3());
    return out;
  };
  const pos = (o: THREE.Object3D): THREE.Vector3 => {
    m.multiplyMatrices(inv, o.matrixWorld);
    return new THREE.Vector3().setFromMatrixPosition(m);
  };
  const pu = pos(u);
  const pf = pos(f);
  const ph = pos(h);
  const right = side < 0;
  return {
    side, u, f, h, c,
    cq0: c ? quat(c) : new THREE.Quaternion(),
    cdir0: c ? pu.clone().sub(pos(c)).normalize() : new THREE.Vector3(side, 0, 0),
    q0: [quat(u), quat(f), quat(h)],
    dir0: [pf.clone().sub(pu).normalize(), ph.clone().sub(pf).normalize()],
    len: [pf.distanceTo(pu), ph.distanceTo(pf)],
    pole: right ? new THREE.Vector3(-0.55, -1, -0.15) : new THREE.Vector3(0.3, -1, -0.25),
    curU: pf.clone().sub(pu).normalize(),
    curF: ph.clone().sub(pf).normalize(),
  };
}

/**
 * O IFP guarda a rotação local de cada osso exatamente como o osso do glTF usa (x, y, z, w), sem inverter.
 * Única exceção: a pélvis. No IFP ela vem no espaço do pai da raiz ("Root"), então tira a rotação do osso Root.
 */
function gtaConvert(q: number[], parentInv: THREE.Quaternion | null): number[] {
  if (!parentInv) return q;
  const out = new Array<number>(q.length);
  const t = new THREE.Quaternion();
  for (let i = 0; i < q.length; i += 4) {
    t.set(q[i]!, q[i + 1]!, q[i + 2]!, q[i + 3]!);
    t.premultiply(parentInv);
    out[i] = t.x; out[i + 1] = t.y; out[i + 2] = t.z; out[i + 3] = t.w;
  }
  return out;
}
