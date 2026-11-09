import * as THREE from 'three';

export type AnimState = 'idle' | 'walk' | 'run';

interface TrackData { id: number; t: number[]; q: number[] }
interface ClipData { duration: number; tracks: TrackData[] }
type AnimFile = Record<AnimState, ClipData>;

/** Nome do osso (padrão GTA SA, sem sufixo numérico) -> ID usado no ped.ifp */
const BONE_IDS: Record<string, number> = {
  pelvis: 1, spine: 2, spine1: 3, neck: 4, head: 5, 'l brow': 6, 'r brow': 7, jaw: 8,
  'bip01 r clavicle': 21, 'r upperarm': 22, 'r forearm': 23, 'r hand': 24, 'r finger': 25, 'r finger01': 26,
  'bip01 l clavicle': 31, 'l upperarm': 32, 'l forearm': 33, 'l hand': 34, 'l finger': 35, 'l finger01': 36,
  'l thigh': 41, 'l calf': 42, 'l foot': 43, 'l toe0': 44,
  'r thigh': 51, 'r calf': 52, 'r foot': 53, 'r toe0': 54,
  belly: 201,
};

/** Correção (pós-multiplicada) para ossos do braço cujos eixos diferem do GTA SA. */
const BONE_FIX: Record<number, THREE.Quaternion> = {
  22: new THREE.Quaternion(Math.SQRT1_2, 0, Math.SQRT1_2, 0),
  23: new THREE.Quaternion(0, 0, -Math.SQRT1_2, Math.SQRT1_2),
  32: new THREE.Quaternion(Math.SQRT1_2, 0, -Math.SQRT1_2, 0),
  33: new THREE.Quaternion(0.5, -0.5, 0.5, -0.5),
};

const FADE = 0.2;
let fileCache: Promise<AnimFile> | null = null;

function loadFile(): Promise<AnimFile> {
  fileCache ??= fetch('/anims/ped.json').then((r) => r.json() as Promise<AnimFile>);
  return fileCache;
}

function boneId(name: string): number | undefined {
  const clean = name.replace(/_\d+$/, '').replace(/_/g, ' ').trim().toLowerCase();
  return BONE_IDS[clean];
}

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private state: AnimState | null = null;

  private constructor(
    private mixer: THREE.AnimationMixer,
    private actions: Record<AnimState, THREE.AnimationAction>,
  ) {}

  /** Retorna null se o modelo não tem esqueleto compatível. */
  static async create(model: THREE.Object3D): Promise<Animator | null> {
    const bones = new Map<number, THREE.Bone>();
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        const id = boneId(o.name);
        if (id !== undefined) bones.set(id, o as THREE.Bone);
      }
    });
    if (bones.size < 15) return null;

    const file = await loadFile();
    const mixer = new THREE.AnimationMixer(model);
    const actions = {} as Record<AnimState, THREE.AnimationAction>;
    for (const key of ['idle', 'walk', 'run'] as const) {
      const tracks: THREE.KeyframeTrack[] = [];
      for (const tr of file[key].tracks) {
        const bone = bones.get(tr.id);
        if (!bone) continue;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, tr.t, convert(tr.q, BONE_FIX[tr.id])));
      }
      actions[key] = mixer.clipAction(new THREE.AnimationClip(key, file[key].duration, tracks));
    }
    const a = new Animator(mixer, actions);
    a.set('idle');
    return a;
  }

  set(state: AnimState): void {
    if (state === this.state) return;
    const next = this.actions[state];
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, FADE, false);
    this.current = next;
    this.state = state;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

/** IFP guarda (x, y, z, w); o osso do glTF usa o conjugado. */
function convert(q: number[], fix?: THREE.Quaternion): number[] {
  const out = new Array<number>(q.length);
  const tmp = new THREE.Quaternion();
  for (let i = 0; i < q.length; i += 4) {
    tmp.set(-q[i]!, -q[i + 1]!, -q[i + 2]!, q[i + 3]!);
    if (fix) tmp.multiply(fix);
    out[i] = tmp.x;
    out[i + 1] = tmp.y;
    out[i + 2] = tmp.z;
    out[i + 3] = tmp.w;
  }
  return out;
}
