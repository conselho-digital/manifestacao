import * as THREE from 'three';
import { rifleGeo, type RifleKind } from './rifles';

interface GtaTrack { id: number; t: number[]; q: number[] }
interface BoneTrack { bone: string; t: number[]; q: number[] }
interface ClipData<T> { duration: number; tracks: T[]; /** descida do corpo (m) ao longo do clipe (mergulho) */ drop?: { t: number[]; y: number[] } }
type Clips<T> = Record<string, ClipData<T>>;
type Kind = 'gta' | 'carlos';

export type Armed = 'none' | 'rifle' | 'aim' | 'pistol' | 'pistol_aim' | 'bat' | 'sign' | 'cricket' | 'baseball' | ExtraMelee;
/** Armas brancas extras (pacote de armas): garrafa quebrada, cano, cutelo, foice e machado. */
export const EXTRA_MELEE_KEYS = ['bottle', 'pipe', 'cleaver', 'sickle', 'axe'] as const;
export type ExtraMelee = (typeof EXTRA_MELEE_KEYS)[number];
export const ARMED_CODE: Record<Armed, number> = { none: 0, rifle: 1, aim: 2, bat: 3, pistol: 4, pistol_aim: 5, sign: 6, cricket: 7, baseball: 8, bottle: 9, pipe: 10, cleaver: 11, sickle: 12, axe: 13 };
export const ARMED_FROM_CODE: Armed[] = ['none', 'rifle', 'aim', 'bat', 'pistol', 'pistol_aim', 'sign', 'cricket', 'baseball', 'bottle', 'pipe', 'cleaver', 'sickle', 'axe'];
/** Armas brancas de duas mãos (bandeira, placa, tacos de críquete e de beisebol): usam os clipes do baseball.ifp. */
export const isBatLike = (a: Armed): boolean => a === 'bat' || a === 'sign' || a === 'cricket' || a === 'baseball' || (EXTRA_MELEE_KEYS as readonly string[]).includes(a);
/** O corpo gira para onde a câmera mira só ao mirar ou atirar (arma levantada). Com a arma baixa a câmera olha livre e o corpo segue o movimento. */
export const facesAim = (a: Armed): boolean => a === 'aim' || a === 'pistol_aim';
const isAimPose = (a: Armed): boolean => a === 'aim' || a === 'pistol_aim';
type Kind3 = 'rifle' | 'pistol' | 'bat';
const kindOf = (a: Armed): Kind3 | null => (a === 'rifle' || a === 'aim' ? 'rifle' : a === 'pistol' || a === 'pistol_aim' ? 'pistol' : isBatLike(a) ? 'bat' : null);

/** Clipes que tocam uma vez e param no último quadro. */
const ONCE = new Set(['kick_1', 'kick_2', 'hitk_1', 'hitk_2', 'hit_1', 'hit_2', 'hit_3', 'block', 'punch_1', 'punch_2', 'punch_3', 'punch_4', 'bat_swing', 'bat_swing2', 'bat_swing3', 'bat_hit_1', 'bat_hit_2', 'bat_hit_3', 'car_getin_l', 'car_getout_l', 'bike_fall', 'ko_front', 'getup_front', 'jump_launch', 'jump_land', 'climb_jump', 'climb_pull', 'climb_stand', 'roll', 'dive']);
export const isOnceClip = (name: string): boolean => ONCE.has(name);

/** Clipes em que o personagem não segura o fuzil (escalar, rolar, mergulhar, emotes). */
const FREE_HANDS = (name: string): boolean => name.startsWith('climb_') || name === 'roll' || name === 'dive' || name.startsWith('e_');

/** Clipes feitos para segurar o fuzil (Gun_stand, GunMove_*, WEAPON_crouch...): os braços vêm do clipe e a arma segue a mão. */
const OWN_HOLD = (name: string): boolean => name.startsWith('gun_') || name.startsWith('crouch_') || name === 'run_armed' || name === 'walk_armed';

/** Velocidade de reprodução (1 = original). Os clipes de arma andam um pouco mais rápido que o jogo. */
const TIME_SCALE: Record<string, number> = { ko: 1.8, getup: 1.8, ko_front: 1.5, getup_front: 1.8, bike_fall: 1.2, car_getin_l: 0.62, car_getout_l: 0.62, hit_3: 2, punch_1: 2.2, punch_2: 2.2, punch_3: 2.0, punch_4: 1.6, bat_swing: 1.3, bat_swing2: 1.5, bat_swing3: 1.5, bat_hit_1: 1.5, bat_hit_2: 1.6, bat_hit_3: 1.8, gun_fwd: 1.2, gun_bwd: 1.2, gun_left: 1.2, gun_right: 1.2, crouch_fwd: 0.8, crouch_bwd: 0.8 };

/** Animações disponíveis no menu. */
export const EMOTES: { id: string; label: string }[] = [
  { id: 'e_chat', label: 'Conversar' },
  { id: 'e_tired', label: 'Cansado' },
  { id: 'e_gang', label: 'Gangue' },
  { id: 'e_taxi', label: 'Esperando' },
  { id: 'e_swat', label: 'Alerta' },
  { id: 'e_homeless', label: 'Largado' },
  { id: 'e_latino', label: 'Relaxado' },
  { id: 'e_fight', label: 'Posição de luta' },
  { id: 'e_cower', label: 'Agachado' },
  { id: 'e_old', label: 'Velhinho' },
];
export const SPECIALS: { id: string; label: string }[] = [
  { id: 'roll', label: 'Rolar' },
  { id: 'dive', label: 'Mergulho' },
];
export const WALK_STYLES: { id: string; label: string }[] = [
  { id: 'walk', label: 'Normal' },
  { id: 'w_gang', label: 'Gangue' },
  { id: 'w_drunk', label: 'Bêbado' },
  { id: 'w_old', label: 'Velho' },
  { id: 'w_fat', label: 'Gordo' },
  { id: 'w_limp', label: 'Mancando' },
  { id: 'w_sneak', label: 'Furtivo' },
];

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
    low: { pos: P3(-0.02, 1.15, 0.28), pitch: -0.06, yaw: 1.1 },
    // coronha no ombro direito, bochecha na coronha; yaw negativo: o cano converge para o ponto da mira (a câmera fica à direita)
    aim: { pos: P3(-0.17, 1.47, 0.24), pitch: 0, yaw: -0.05 },
    gripR: P3(0, -0.055, 0.17), // empunhadura (coronha→cano: a arma tem 0,88 m e começa em z=-0,14)
    gripL: P3(0, -0.02, 0.58), // guarda-mão de madeira (nas fotos a mão de apoio segura na ponta dele, braço quase esticado)
    crouchLow: P3(0, 0.08, -0.04),
    crouchAim: P3(0, -0.04, 0),
  },
  pistol: {
    low: { pos: P3(-0.2, 1.02, 0.3), pitch: 0.5, yaw: 0 },
    aim: { pos: P3(-0.07, 1.57, 0.5), pitch: 0, yaw: -0.02 },
    gripR: P3(0, -0.07, -0.03),
    gripL: P3(0.025, -0.075, -0.02),
    crouchLow: P3(0, 0.1, 0),
    crouchAim: P3(0, -0.16, -0.08),
  },
};

/** Baixa os dados de animação de antemão (Law e Carlos). */
export function preloadAnimations(): Promise<unknown> {
  return Promise.all(['/anims/ped.json', '/anims/ped-extra.json', '/anims/carlos.json', '/anims/carlos-extra.json'].map((u) => fetchJson(u).catch(() => undefined)));
}

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private clipName = '';
  private done = false;
  isCarlos = false;
  /** giro do antebraço e da mão em torno do próprio eixo (rad): palma para dentro ao segurar */
  armRoll = 0;
  private armW = 0; // 0 = braços do clipe, 1 = braços segurando o fuzil
  private carryW = 0; // 1 = arma branca carregada em pé (andando/correndo): braços por IK, arma para cima
  private aimK = 0; // 0 = fuzil baixo, 1 = fuzil no ombro
  private jabT = -1; // soco em andamento (0..1), -1 = nenhum
  private recoil = 0; // coice do último tiro (1 -> 0)
  private flailW = 0; // "ragdoll" falso: braços e pernas balançam soltos (0..1)
  private flailT = 0;
  /** orientação do taco no espaço da mão direita, calibrada no bat_idle (mãos afastadas) */
  private batLocal: THREE.Quaternion | null = null;
  private legK = 0; // andando agachado: dobra mais os joelhos
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
        const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
        if (clip.drop) a.drops.set(name, clip.drop);
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

  /** Qual fuzil está na mão (muda onde ficam as mãos: empunhadura e guarda-mão). */
  setRifleKind(k: RifleKind): void {
    this.rifleKind = k;
  }

  /** Posições de arma em uso: poses do fuzil/pistola e, no fuzil, as mãos do modelo atual. */
  private cfgNow(): WeaponCfg {
    if (kindOf(this.armed) === 'pistol') return CFG.pistol;
    if (this.rifleKind === 'ak') return CFG.rifle;
    const g = rifleGeo(this.rifleKind);
    return { ...CFG.rifle, gripR: g.gripR, gripL: g.gripL };
  }

  /** Segurando o fuzil: braços na empunhadura, fuzil baixo (rifle) ou no ombro (aim). */
  setArmed(a: Armed): void {
    this.armed = a;
  }

  /** Soco direto do boxe (jab): braço da frente estica, o de trás protege o rosto, o tronco gira. */
  jab(): void {
    this.jabT = 0;
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
    y += this.groundDrop + (this.ride?.y ?? 0);
    model.position.y = this.modelY0 + y;
    model.position.z = this.modelZ0 + (this.ride?.z ?? 0);
    model.position.x = this.modelX0 + (this.ride?.x ?? 0);
  }

  private pose(dt: number): void {
    this.applyDrop();
    // braços por IK só quando o clipe não segura o fuzil sozinho (ou ao mirar no ombro)
    const kind = kindOf(this.armed);
    const dbgRoll = (window as unknown as { __ROLL?: number }).__ROLL;
    // segurando arma: palmas viradas uma para a outra (para dentro); no guidão/volante a palma fica para baixo
    this.armRoll = dbgRoll !== undefined ? dbgRoll * (Math.PI / 180) : this.holdsWeapon && kind && !this.ride?.grips ? Math.PI / 2 : 0;
    const ikTarget = !this.holdsWeapon || kind === 'bat' || !kind ? 0 : 1; // braços sempre por IK nas empunhaduras (pose da foto de referência)
    this.armW += (ikTarget - this.armW) * Math.min(1, dt * 10);
    this.aimK += ((isAimPose(this.armed) ? 1 : 0) - this.aimK) * Math.min(1, dt * 9);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    // agachado parado: tronco desce; andando agachado o clipe já inclina o corpo, então só um pouco
    const crouchT = this.clipName === 'crouch_idle' ? 1 : this.clipName.startsWith('crouch_') ? 0.2 : 0;
    this.crouchK += (crouchT - this.crouchK) * Math.min(1, dt * 8);
    this.crouchW += ((this.clipName.startsWith('crouch_') ? 1 : 0) - this.crouchW) * Math.min(1, dt * 8);
    this.legK += ((this.clipName === 'crouch_fwd' || this.clipName === 'crouch_bwd' ? 1 : 0) - this.legK) * Math.min(1, dt * 8);
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
    const carry = kind === 'bat' && holding && !this.clipName.startsWith('bat_') && !fist;
    this.carryW = carry ? this.carryW + (1 - this.carryW) * Math.min(1, dt * 10) : 0;
    const flail = this.flailW;
    if (flail > 0) this.flailT += dt;
    if ((!armed && !holding && !fist && kickW === 0 && flail === 0 && this.crouchK < 0.01 && this.legK < 0.01 && jabW === 0) || !this.spine) {
      this.groundFeet(dt);
      for (const b of this.touched) this.clean.set(b, b.quaternion.clone()); // tudo vem do clipe
      return;
    }
    for (const b of this.touched) this.clean.get(b)!.copy(b.quaternion);
    this.dirty = true;
    this.updateRoot();
    this.bendTorso();
    if (this.legK >= 0.01) { this.flexLegs(); this.uprightTorso(); }
    if (kickW > 0) this.applyKick(kickW);
    if (flail > 0) this.applyFlail(flail);
    if (fist) { this.curlHand(1, 1.4); this.curlHand(-1, 1.4); }
    if (jabW > 0) this.applyJab(jabW, jabE, dt);
    this.updateRoot();
    this.groundFeet(dt);
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
      // mãos fechadas no cabo: fuzil e taco nas duas; pistola na direita (e na esquerda ao mirar)
      this.curlHand(-1, 1);
      this.curlHand(1, kind === 'pistol' && this.armed !== 'pistol_aim' ? 0 : 1);
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
  private uprightTorso(): void {
    const sp = this.spine!;
    this.updateRoot();
    const head = this.posIn(sp.head, new THREE.Vector3());
    const lean = Math.atan2(head.x, Math.max(0.2, head.y - 0.63)); // + = cabeça para a esquerda do corpo
    const fix = THREE.MathUtils.clamp(lean, -0.4, 0.4) * this.legK;
    // roll em torno do eixo de frente (Z): positivo leva a parte de cima para a direita
    this.rotateBone(sp.mid, new THREE.Quaternion().setFromAxisAngle(Z, fix * 0.5));
    this.rotateBone(sp.chest, new THREE.Quaternion().setFromAxisAngle(Z, fix * 0.5));
    // linha dos ombros: nivela mais um pouco
    const l = this.arms.find((a) => a.side > 0);
    const r = this.arms.find((a) => a.side < 0);
    if (l && r) {
      this.updateRoot();
      const dy = this.posIn(l.u, new THREE.Vector3()).y - this.posIn(r.u, new THREE.Vector3()).y;
      this.rotateBone(sp.chest, new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.clamp(-dy * 2.2, -0.25, 0.25) * this.legK));
    }
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
    const hl = palm(left);
    const axis = hl.clone().sub(hr);
    const handQ = this.quatIn(right.h, new THREE.Quaternion());
    this.bat.position.copy(hr);
    // o mastro fica preso à mão direita (como no GTA): a orientação no espaço da mão é calibrada uma vez
    // no bat_idle, quando as duas mãos estão afastadas e a reta entre elas dá a direção do mastro
    if (this.batLocal) {
      this.bat.quaternion.copy(handQ).multiply(this.batLocal);
      return;
    }
    if (axis.length() < 0.08) {
      // mãos coladas: só a mão direita segura; taco para a frente e para cima
      const delta = handQ.clone().multiply(right.q0[2].clone().invert());
      const rest = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.55, 0.83).normalize());
      this.bat.quaternion.copy(delta.multiply(rest));
      return;
    }
    axis.normalize();
    const up = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : Y;
    const xAxis = new THREE.Vector3().crossVectors(up, axis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(axis, xAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, axis));
    this.bat.quaternion.copy(q);
    if (this.clipName === 'bat_idle' && axis.length() > 0 && hl.distanceTo(hr) > 0.22) this.batLocal = handQ.clone().invert().multiply(q);
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
    return { pos, q };
  }

  private poseArm(arm: Arm, frame: { pos: THREE.Vector3; q: THREE.Quaternion }, dt: number): void {
    const kind = kindOf(this.armed) === 'pistol' ? 'pistol' : 'rifle';
    const cfgHold = this.cfgNow();
    // pistola abaixada: só a mão direita segura; a esquerda fica com o clipe
    const w = kind === 'pistol' && this.armed === 'pistol' && arm.side > 0 ? 0 : this.armW;
    if (w < 0.01) return;
    const wrist = (arm.side < 0 ? cfgHold.gripR : cfgHold.gripL).clone().applyQuaternion(frame.q).add(frame.pos);
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
