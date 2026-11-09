import * as THREE from 'three';

interface GtaTrack { id: number; t: number[]; q: number[] }
interface BoneTrack { bone: string; t: number[]; q: number[] }
interface ClipData<T> { duration: number; tracks: T[] }
type Clips<T> = Record<string, ClipData<T>>;
type Kind = 'gta' | 'carlos';

export type ArmMode = 'swing' | 'up' | 'reach' | 'forward';

/** Clipes que tocam uma vez e param no último quadro. */
const ONCE = new Set(['jump_launch', 'jump_land', 'climb_jump', 'climb_pull', 'climb_stand', 'roll', 'dive']);
export const isOnceClip = (name: string): boolean => ONCE.has(name);

const ARM_MODE: Record<string, ArmMode> = {
  jump_launch: 'up', jump_air: 'up', jump_land: 'swing',
  climb_jump: 'reach', climb_pull: 'reach', climb_stand: 'reach',
  roll: 'forward', dive: 'forward',
};
const BEND: Record<string, number> = { idle: 0.12, walk: 0.3, run: 0.95, sprint: 1.1 };

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

/** Nome do osso (padrão GTA SA, sem sufixo numérico) -> ID usado no ped.ifp. Braços ficam de fora (procedurais). */
const GTA_BONE_IDS: Record<string, number> = {
  pelvis: 1, spine: 2, spine1: 3, neck: 4, head: 5, 'l brow': 6, 'r brow': 7, jaw: 8,
  'l thigh': 41, 'l calf': 42, 'l foot': 43, 'l toe0': 44,
  'r thigh': 51, 'r calf': 52, 'r foot': 53, 'r toe0': 54,
  belly: 201,
};

interface ArmDef {
  upper: string; fore: string; hand: string;
  /** +1 = braço esquerdo do personagem (+X no espaço do personagem), -1 = direito */
  side: 1 | -1;
  /** coxa e joelho opostos, que ditam o balanço */
  thigh: string; knee: string;
}

const cache = new Map<string, Promise<Clips<never>>>();
function fetchJson(url: string): Promise<Clips<never>> {
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
const ARM_GAIN = 0.9;

interface Arm {
  def: ArmDef;
  u: THREE.Bone; f: THREE.Bone; h: THREE.Bone;
  thigh: THREE.Bone; knee: THREE.Bone;
  q0: [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion];
  dir0: [THREE.Vector3, THREE.Vector3];
  curU: THREE.Vector3; curF: THREE.Vector3;
}

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private clipName = '';
  private done = false;
  private time = 0;
  private bend = BEND.idle!;
  private armMode: ArmMode = 'swing';
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly tmpM = new THREE.Matrix4();
  private readonly rootInv = new THREE.Matrix4();
  private addClips: (file: Clips<never>) => void = () => undefined;

  private constructor(private root: THREE.Object3D, private mixer: THREE.AnimationMixer, private arms: Arm[]) {
    mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action === this.current) this.done = true;
    });
  }

  get name(): string { return this.clipName; }
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

    let arms: Arm[];
    if (isGta) {
      arms = (['l', 'r'] as const).flatMap((p) => {
        const a = buildArm({
          upper: `${p} upperarm`, fore: `${p} forearm`, hand: `${p} hand`, side: p === 'l' ? 1 : -1,
          thigh: `${p === 'l' ? 'r' : 'l'} thigh`, knee: `${p === 'l' ? 'r' : 'l'} calf`,
        }, (n) => byGta.get(n), root);
        return a ? [a] : [];
      });
    } else {
      const byPrefix = (n: string): THREE.Bone | undefined => {
        for (const [full, b] of bones) if (full.replace(/_/g, ' ').replace(/ ?\d+$/, '').trim() === n) return b;
        return undefined;
      };
      arms = (['left', 'right'] as const).flatMap((p) => {
        const opp = p === 'left' ? 'right' : 'left';
        const a = buildArm({
          upper: `arm ${p} shoulder 2`, fore: `arm ${p} elbow`, hand: `arm ${p} wrist`, side: p === 'left' ? 1 : -1,
          thigh: `leg ${opp} thigh`, knee: `leg ${opp} knee`,
        }, byPrefix, root);
        return a ? [a] : [];
      });
    }

    const mixer = new THREE.AnimationMixer(root);
    const a = new Animator(root, mixer, arms);
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
            if (bone) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, gtaConvert(tr.q)));
          }
        } else {
          for (const tr of (clip as ClipData<BoneTrack>).tracks) {
            const bone = bySan(tr.bone);
            if (bone) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, tr.q));
          }
        }
        const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
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
    this.armMode = ARM_MODE[name] ?? 'swing';
  }

  /** Reinicia o mesmo clipe de ação (ex.: pular de novo). */
  restart(name: string): void {
    this.clipName = '';
    this.play(name);
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.time += dt;
    if (this.arms.length === 0) return;
    const baseBend = BEND[this.clipName] ?? (this.clipName.startsWith('w_') ? 0.3 : 0.15);
    this.bend += (baseBend - this.bend) * Math.min(1, dt * 8);
    this.root.updateMatrixWorld(true);
    this.rootInv.copy(this.root.matrixWorld).invert();
    for (const arm of this.arms) this.poseArm(arm, dt);
  }

  private posIn(bone: THREE.Bone, out: THREE.Vector3): THREE.Vector3 {
    this.tmpM.multiplyMatrices(this.rootInv, bone.matrixWorld);
    return out.setFromMatrixPosition(this.tmpM);
  }

  private quatIn(obj: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    this.tmpM.multiplyMatrices(this.rootInv, obj.matrixWorld);
    this.tmpM.decompose(new THREE.Vector3(), out, new THREE.Vector3());
    return out;
  }

  private poseArm(arm: Arm, dt: number): void {
    const { def } = arm;
    const s = def.side;
    const tU = new THREE.Vector3();
    const tF = new THREE.Vector3();
    switch (this.armMode) {
      case 'up':
        tU.set(s * 0.45, 0.45, 0.8); tF.set(s * 0.3, 0.7, 0.65); break;
      case 'forward':
        tU.set(s * 0.15, 0.1, 1); tF.set(s * 0.1, 0.1, 1); break;
      case 'reach': {
        const alt = 0.5 + 0.5 * Math.sin(this.time * 6 + (s > 0 ? 0 : Math.PI));
        tU.set(s * 0.15, -0.3 + 1.3 * alt, 0.45); tF.set(s * 0.1, -0.1 + 1.2 * alt, 0.55); break;
      }
      default: {
        // Balanço: braço vai à frente quando a perna oposta vai à frente
        const a = this.posIn(arm.thigh, new THREE.Vector3());
        const b = this.posIn(arm.knee, new THREE.Vector3());
        const v = b.sub(a);
        const theta = THREE.MathUtils.clamp(Math.atan2(v.z, -v.y) * ARM_GAIN, -1.2, 1.2);
        const beta = this.bend + 0.3 * Math.max(0, Math.sin(theta));
        tU.set(s * 0.12, -Math.cos(theta), Math.sin(theta));
        tF.set(s * 0.06, -Math.cos(theta + beta), Math.sin(theta + beta));
      }
    }
    const k = Math.min(1, dt * 12);
    arm.curU.lerp(tU.normalize(), k).normalize();
    arm.curF.lerp(tF.normalize(), k).normalize();

    const qU = new THREE.Quaternion().setFromUnitVectors(arm.dir0[0], arm.curU);
    const qF = new THREE.Quaternion().setFromUnitVectors(arm.dir0[1], arm.curF);
    const bones = [arm.u, arm.f, arm.h] as const;
    const deltas = [qU, qF, qF] as const;
    const parentQ = new THREE.Quaternion();
    for (let i = 0; i < 3; i++) {
      const bone = bones[i]!;
      this.quatIn(bone.parent!, parentQ);
      const world = deltas[i]!.clone().multiply(arm.q0[i]!);
      bone.quaternion.copy(parentQ.invert().multiply(world));
      bone.updateMatrixWorld(true);
    }
  }
}

function buildArm(
  def: ArmDef,
  find: (name: string) => THREE.Bone | undefined,
  root: THREE.Object3D,
): Arm | null {
  const u = find(def.upper);
  const f = find(def.fore);
  const h = find(def.hand);
  const thigh = find(def.thigh);
  const knee = find(def.knee);
  if (!u || !f || !h || !thigh || !knee) return null;

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
  return {
    def, u, f, h, thigh, knee,
    q0: [quat(u), quat(f), quat(h)],
    dir0: [pf.clone().sub(pu).normalize(), ph.clone().sub(pf).normalize()],
    curU: new THREE.Vector3(def.side * 0.12, -1, 0).normalize(),
    curF: new THREE.Vector3(def.side * 0.06, -1, 0.1).normalize(),
  };
}

/** IFP guarda (x, y, z, w); o osso do glTF usa o conjugado. */
function gtaConvert(q: number[]): number[] {
  const out = new Array<number>(q.length);
  for (let i = 0; i < q.length; i += 4) {
    out[i] = -q[i]!;
    out[i + 1] = -q[i + 1]!;
    out[i + 2] = -q[i + 2]!;
    out[i + 3] = q[i + 3]!;
  }
  return out;
}
