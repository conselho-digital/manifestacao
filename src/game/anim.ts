import * as THREE from 'three';

export type AnimState = 'idle' | 'walk' | 'run';

interface GtaTrack { id: number; t: number[]; q: number[] }
interface BoneTrack { bone: string; t: number[]; q: number[] }
interface Clip<T> { duration: number; tracks: T[] }
type Clips<T> = Record<AnimState, Clip<T>>;

/** Nome do osso (padrão GTA SA, sem sufixo numérico) -> ID usado no ped.ifp. Braços ficam de fora (procedurais). */
const GTA_BONE_IDS: Record<string, number> = {
  pelvis: 1, spine: 2, spine1: 3, neck: 4, head: 5, 'l brow': 6, 'r brow': 7, jaw: 8,
  'l thigh': 41, 'l calf': 42, 'l foot': 43, 'l toe0': 44,
  'r thigh': 51, 'r calf': 52, 'r foot': 53, 'r toe0': 54,
  belly: 201,
};
const GTA_ARM_NAMES = ['upperarm', 'forearm', 'hand'];

interface ArmDef {
  upper: string; fore: string; hand: string;
  /** +1 = braço esquerdo do personagem (+X no espaço do personagem), -1 = direito */
  side: 1 | -1;
  /** coxa e joelho opostos, que ditam o balanço */
  thigh: string; knee: string;
}

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then((r) => r.json() as Promise<T>);
}
let gtaFile: Promise<Clips<GtaTrack>> | null = null;
let carlosFile: Promise<Clips<BoneTrack>> | null = null;

function gtaKey(name: string): string {
  return name.replace(/_\d+$/, '').replace(/_/g, ' ').trim().toLowerCase().replace('bip01 ', '');
}

const FADE = 0.2;
const BEND: Record<AnimState, number> = { idle: 0.12, walk: 0.3, run: 0.95 };
const ARM_GAIN = 0.9;

interface Arm {
  def: ArmDef;
  u: THREE.Bone; f: THREE.Bone; h: THREE.Bone;
  thigh: THREE.Bone; knee: THREE.Bone;
  q0: [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion];
  dir0: [THREE.Vector3, THREE.Vector3];
}

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private state: AnimState = 'idle';
  private bend = BEND.idle;
  private readonly tmpM = new THREE.Matrix4();
  private readonly rootInv = new THREE.Matrix4();

  private constructor(
    private root: THREE.Object3D,
    private mixer: THREE.AnimationMixer,
    private actions: Record<AnimState, THREE.AnimationAction>,
    private arms: Arm[],
  ) {}

  /** Retorna null se o modelo não tem esqueleto compatível. */
  static async create(root: THREE.Object3D): Promise<Animator | null> {
    root.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    });
    const byGta = new Map<string, THREE.Bone>();
    bones.forEach((b, n) => byGta.set(gtaKey(n), b));
    const bySan = (name: string): THREE.Bone | undefined =>
      bones.get(THREE.PropertyBinding.sanitizeNodeName(name));

    let durations: Record<AnimState, number>;
    let armDefs: ArmDef[];
    let arms: Arm[] = [];

    const isGta = [...Object.keys(GTA_BONE_IDS)].filter((k) => byGta.has(k)).length >= 12 && byGta.has('r upperarm');
    const isCarlos = !!bySan('root hips_00');
    if (!isGta && !isCarlos) return null;

    const tracks: Record<AnimState, THREE.KeyframeTrack[]> = { idle: [], walk: [], run: [] };
    const states = ['idle', 'walk', 'run'] as const;
    durations = { idle: 0, walk: 0, run: 0 };

    if (isGta) {
      gtaFile ??= fetchJson<Clips<GtaTrack>>('/anims/ped.json');
      const file = await gtaFile;
      const idToBone = new Map<number, THREE.Bone>();
      for (const [k, id] of Object.entries(GTA_BONE_IDS)) {
        const b = byGta.get(k);
        if (b) idToBone.set(id, b);
      }
      for (const s of states) {
        durations[s] = file[s].duration;
        for (const tr of file[s].tracks) {
          const bone = idToBone.get(tr.id);
          if (bone) tracks[s].push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, gtaConvert(tr.q)));
        }
      }
      armDefs = (['l', 'r'] as const).map((p) => ({
        upper: `${p} ${GTA_ARM_NAMES[0]}`, fore: `${p} ${GTA_ARM_NAMES[1]}`, hand: `${p} ${GTA_ARM_NAMES[2]}`,
        side: p === 'l' ? 1 : -1,
        thigh: `${p === 'l' ? 'r' : 'l'} thigh`, knee: `${p === 'l' ? 'r' : 'l'} calf`,
      }));
      arms = armDefs.flatMap((d) => {
        const a = buildArm(d, (n) => byGta.get(n), root);
        return a ? [a] : [];
      });
    } else {
      carlosFile ??= fetchJson<Clips<BoneTrack>>('/anims/carlos.json');
      const file = await carlosFile;
      for (const s of states) {
        durations[s] = file[s].duration;
        for (const tr of file[s].tracks) {
          const bone = bySan(tr.bone);
          if (bone) tracks[s].push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, tr.q));
        }
      }
      armDefs = (['left', 'right'] as const).map((p) => {
        const opp = p === 'left' ? 'right' : 'left';
        return {
          upper: `arm ${p} shoulder 2`, fore: `arm ${p} elbow`, hand: `arm ${p} wrist`,
          side: p === 'left' ? 1 : -1,
          thigh: `leg ${opp} thigh`, knee: `leg ${opp} knee`,
        };
      });
      const byPrefix = (n: string): THREE.Bone | undefined => {
        for (const [full, b] of bones) if (full.replace(/_/g, ' ').replace(/ ?\d+$/, '').trim() === n) return b;
        return undefined;
      };
      arms = armDefs.flatMap((d) => {
        const a = buildArm(d, byPrefix, root);
        return a ? [a] : [];
      });
    }
    const mixer = new THREE.AnimationMixer(root);
    const actions = {} as Record<AnimState, THREE.AnimationAction>;
    for (const s of states) {
      actions[s] = mixer.clipAction(new THREE.AnimationClip(s, durations[s], tracks[s]));
    }
    const a = new Animator(root, mixer, actions, arms);
    a.set('idle');
    return a;
  }

  set(state: AnimState): void {
    if (state === this.state && this.current) return;
    const next = this.actions[state];
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, FADE, false);
    this.current = next;
    this.state = state;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (this.arms.length === 0) return;
    this.bend += (BEND[this.state] - this.bend) * Math.min(1, dt * 8);
    this.root.updateMatrixWorld(true);
    this.rootInv.copy(this.root.matrixWorld).invert();
    for (const arm of this.arms) this.poseArm(arm);
  }

  private posIn(bone: THREE.Bone, out: THREE.Vector3): THREE.Vector3 {
    this.tmpM.multiplyMatrices(this.rootInv, bone.matrixWorld);
    return out.setFromMatrixPosition(this.tmpM);
  }

  private quatIn(obj: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    this.tmpM.multiplyMatrices(this.rootInv, obj.matrixWorld);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.tmpM.decompose(p, out, s);
    return out;
  }

  private poseArm(arm: Arm): void {
    const { def } = arm;
    // Balanço: braço vai à frente quando a perna oposta vai à frente
    const a = this.posIn(arm.thigh, new THREE.Vector3());
    const b = this.posIn(arm.knee, new THREE.Vector3());
    const v = b.sub(a);
    const legAngle = Math.atan2(v.z, -v.y);
    const theta = THREE.MathUtils.clamp(legAngle * ARM_GAIN, -1.2, 1.2);
    const beta = this.bend + 0.3 * Math.max(0, Math.sin(theta));

    const dirU = new THREE.Vector3(def.side * 0.12, -Math.cos(theta), Math.sin(theta)).normalize();
    const dirF = new THREE.Vector3(def.side * 0.06, -Math.cos(theta + beta), Math.sin(theta + beta)).normalize();
    const qU = new THREE.Quaternion().setFromUnitVectors(arm.dir0[0], dirU);
    const qF = new THREE.Quaternion().setFromUnitVectors(arm.dir0[1], dirF);

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
