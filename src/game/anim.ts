import * as THREE from 'three';

interface GtaTrack { id: number; t: number[]; q: number[] }
interface BoneTrack { bone: string; t: number[]; q: number[] }
interface ClipData<T> { duration: number; tracks: T[] }
type Clips<T> = Record<string, ClipData<T>>;
type Kind = 'gta' | 'carlos';

export type Armed = 'none' | 'rifle' | 'aim';

/** Clipes que tocam uma vez e param no último quadro. */
const ONCE = new Set(['jump_launch', 'jump_land', 'climb_jump', 'climb_pull', 'climb_stand', 'roll', 'dive']);
export const isOnceClip = (name: string): boolean => ONCE.has(name);

/** Clipes em que o personagem não segura o fuzil (escalar, rolar, mergulhar, emotes). */
const FREE_HANDS = (name: string): boolean => name.startsWith('climb_') || name === 'roll' || name === 'dive' || name.startsWith('e_');

/** Clipes feitos para segurar o fuzil (Gun_stand, GunMove_*, WEAPON_crouch...): os braços vêm do clipe e a arma segue a mão. */
const OWN_HOLD = (name: string): boolean => name.startsWith('gun_') || name.startsWith('crouch_') || name === 'run_armed' || name === 'walk_armed';

/** Velocidade de reprodução (1 = original). Os clipes de arma andam um pouco mais rápido que o jogo. */
const TIME_SCALE: Record<string, number> = { gun_fwd: 1.2, gun_bwd: 1.2, gun_left: 1.2, gun_right: 1.2, crouch_fwd: 1.1, crouch_bwd: 1.1 };

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
  grip: THREE.Vector3;
  curU: THREE.Vector3; curF: THREE.Vector3;
}

interface Spine { mid: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone }

/**
 * Poses do fuzil no espaço do personagem em repouso (x+ = esquerda, y+ = cima, z+ = frente).
 * pos = centro da arma; pitch = cano para baixo (rad); yaw = cano para a esquerda (rad).
 */
const RIFLE_LOW = { pos: new THREE.Vector3(-0.1, 1.26, 0.27), pitch: 0.3, yaw: 0.07 };
// yaw negativo: o cano converge para o ponto da mira (a câmera fica ~0,85 m à direita do personagem)
const RIFLE_AIM = { pos: new THREE.Vector3(-0.12, 1.585, 0.2), pitch: 0, yaw: -0.05 };
/** Empunhadura (traseira) e guarda-mão (frente) no espaço da arma, cano em +Z. */
const GRIP_REAR = new THREE.Vector3(0, -0.115, 0.04);
const GRIP_FRONT = new THREE.Vector3(0, -0.05, 0.33);

export class Animator {
  private current: THREE.AnimationAction | null = null;
  private clipName = '';
  private done = false;
  private armW = 0; // 0 = braços do clipe, 1 = braços segurando o fuzil
  private aimK = 0; // 0 = fuzil baixo, 1 = fuzil no ombro
  private recoil = 0; // coice do último tiro (1 -> 0)
  private crouchK = 0; // 0 em pé, 1 agachado (tronco desce)
  private armed: Armed = 'none';
  private aimPitch = 0;
  private weapon: THREE.Object3D | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly tmpM = new THREE.Matrix4();
  private readonly rootInv = new THREE.Matrix4();
  /** ossos que o código mexe depois do clipe, com a pose limpa do clipe (o mixer só reescreve o que muda) */
  private touched: THREE.Bone[] = [];
  private clean = new Map<THREE.Bone, THREE.Quaternion>();
  private dirty = false;
  private chestRest = { pos: new THREE.Vector3(), q: new THREE.Quaternion() };
  private addClips: (file: Clips<never>) => void = () => undefined;

  private constructor(
    private root: THREE.Object3D,
    private mixer: THREE.AnimationMixer,
    private arms: Arm[],
    private spine: Spine | null,
  ) {
    mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action === this.current) this.done = true;
    });
    this.touched = [...arms.flatMap((a) => [a.u, a.f, a.h, ...(a.c ? [a.c] : [])])];
    if (spine) this.touched.push(spine.mid, spine.chest, spine.neck, spine.head);
    for (const b of this.touched) this.clean.set(b, b.quaternion.clone());
    if (spine) {
      this.updateRoot();
      this.chestRest.pos.copy(this.posIn(spine.chest, new THREE.Vector3()));
      this.quatIn(spine.chest, this.chestRest.q);
    }
  }

  get name(): string { return this.clipName; }
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
    let names: { arm: (p: 'l' | 'r') => [string, string, string, string]; spine: [string, string, string, string] };
    if (isGta) {
      find = (n) => byGta.get(n);
      names = {
        arm: (p) => [`${p} upperarm`, `${p} forearm`, `${p} hand`, `${p} clavicle`],
        spine: ['spine', 'spine1', 'neck', 'head'],
      };
    } else {
      find = (n) => {
        for (const [full, b] of bones) if (full.replace(/_/g, ' ').replace(/ ?\d+$/, '').trim() === n) return b;
        return undefined;
      };
      names = {
        arm: (p) => { const w = p === 'l' ? 'left' : 'right'; return [`arm ${w} shoulder 2`, `arm ${w} elbow`, `arm ${w} wrist`, `arm ${w} shoulder 1`]; },
        spine: ['spine middle', 'spine upper', 'head neck lower', 'head neck upper'],
      };
    }

    const arms = (['l', 'r'] as const).flatMap((p) => {
      const [u, f, h, c] = names.arm(p).map((n) => find(n)) as [THREE.Bone?, THREE.Bone?, THREE.Bone?, THREE.Bone?];
      const arm = u && f && h ? buildArm(p === 'l' ? 1 : -1, u, f, h, c ?? null, root) : null;
      return arm ? [arm] : [];
    });
    const sp = names.spine.map((n) => find(n));
    const spine: Spine | null = sp.every(Boolean) ? { mid: sp[0]!, chest: sp[1]!, neck: sp[2]!, head: sp[3]! } : null;

    const mixer = new THREE.AnimationMixer(root);
    const a = new Animator(root, mixer, arms, spine);
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
    this.aimK = this.armed === 'aim' ? 1 : 0;
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

  /** Segurando o fuzil: braços na empunhadura, fuzil baixo (rifle) ou no ombro (aim). */
  setArmed(a: Armed): void {
    this.armed = a;
  }

  /** Coice: o fuzil recua e sobe um pouco por um instante. */
  kick(): void {
    this.recoil = 1;
  }

  /** O objeto da arma passa a ser posicionado por este animador (seguindo o peito). */
  attachWeapon(anchor: THREE.Object3D): void {
    this.weapon = anchor;
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

  private pose(dt: number): void {
    // braços por IK só quando o clipe não segura o fuzil sozinho (ou ao mirar no ombro)
    const ikTarget = !this.holdsWeapon ? 0 : OWN_HOLD(this.clipName) ? (this.armed === 'aim' ? 1 : 0) : 1;
    this.armW += (ikTarget - this.armW) * Math.min(1, dt * 10);
    this.aimK += ((this.armed === 'aim' ? 1 : 0) - this.aimK) * Math.min(1, dt * 9);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.crouchK += ((this.clipName.startsWith('crouch_') ? 1 : 0) - this.crouchK) * Math.min(1, dt * 8);
    const armed = this.armW >= 0.01;
    const holding = this.holdsWeapon;
    if ((!armed && !holding && this.crouchK < 0.01) || !this.spine) {
      for (const b of this.touched) this.clean.set(b, b.quaternion.clone()); // tudo vem do clipe
      return;
    }
    for (const b of this.touched) this.clean.get(b)!.copy(b.quaternion);
    this.dirty = true;
    this.updateRoot();
    this.bendTorso();
    if (!armed && !holding) return;
    this.updateRoot();
    const frame = this.weaponFrame();
    if (this.weapon) {
      this.weapon.position.copy(frame.pos);
      this.weapon.quaternion.copy(frame.q);
    }
    if (armed) for (const arm of this.arms) this.poseArm(arm, frame, dt);
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
    const pos = RIFLE_LOW.pos.clone().lerp(RIFLE_AIM.pos, k).sub(this.chestRest.pos).applyQuaternion(delta).add(chestPos);
    const pitch = THREE.MathUtils.lerp(RIFLE_LOW.pitch + this.aimPitch * 0.5, this.aimPitch, k) - 0.05 * this.recoil;
    const yaw = THREE.MathUtils.lerp(RIFLE_LOW.yaw, RIFLE_AIM.yaw, k);
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X, pitch));
    // clipe feito para segurar o fuzil: a arma fica entre as duas mãos do clipe (direita na empunhadura, esquerda no guarda-mão)
    const right = this.arms.find((a) => a.side < 0);
    const left = this.arms.find((a) => a.side > 0);
    if (right && left && OWN_HOLD(this.clipName) && k < 0.999) {
      const palm = (arm: Arm): THREE.Vector3 => {
        const hand = this.posIn(arm.h, new THREE.Vector3());
        const elbow = this.posIn(arm.f, new THREE.Vector3());
        return hand.addScaledVector(hand.clone().sub(elbow).normalize(), 0.04);
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
      const mid = GRIP_REAR.clone().add(GRIP_FRONT).multiplyScalar(0.5).applyQuaternion(qh);
      const byHands = hr.clone().add(hl).multiplyScalar(0.5).sub(mid).addScaledVector(axis, 0.07); // um pouco à frente: a coronha não encosta no queixo
      pos.lerp(byHands, 1 - k);
      q.slerp(qh, 1 - k);
    }
    pos.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(q), 0.05 * this.recoil); // recua no coice
    return { pos, q };
  }

  private poseArm(arm: Arm, frame: { pos: THREE.Vector3; q: THREE.Quaternion }, dt: number): void {
    const wrist = arm.grip.clone().applyQuaternion(frame.q).add(frame.pos);
    // clavícula: acompanha um pouco o braço (evita o ombro "rasgar" quando o braço sobe)
    if (arm.c) {
      arm.c.updateMatrixWorld(true);
      const cp = this.posIn(arm.c, new THREE.Vector3());
      const want = wrist.clone().sub(cp).normalize();
      const dirC = arm.cdir0.clone().lerp(want, 0.3).normalize();
      const world = new THREE.Quaternion().setFromUnitVectors(arm.cdir0, dirC).multiply(arm.cq0);
      const parent = this.quatIn(arm.c.parent!, new THREE.Quaternion());
      arm.c.quaternion.slerp(parent.invert().multiply(world), this.armW);
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
      const world = deltas[i]!.clone().multiply(arm.q0[i]!);
      const target = parentQ.invert().multiply(world);
      bone.quaternion.slerp(target, this.armW);
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
    grip: right ? GRIP_REAR : GRIP_FRONT,
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
