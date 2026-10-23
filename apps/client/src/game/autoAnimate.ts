import { AnimationAction, AnimationClip, AnimationMixer, Bone, Group, Object3D, Quaternion, Vector3 } from "three";

/**
 * Animação automática de personagens enviados no admin (.glb): funciona com qualquer modelo, sem preparar nada.
 *  1. Se o arquivo traz clipes (parado/andar/correr, por nome), toca esses, misturando pela velocidade.
 *  2. Senão, anima por código: esqueleto humanoide reconhecido pelos nomes dos ossos (coxas, joelhos, braços) balança
 *     como numa caminhada; modelo sem esqueleto (malha estática) ganha balanço do corpo todo (quique, inclinação, passo).
 * A velocidade vem do deslocamento do próprio modelo no mundo, então vale para o jogador local e para os remotos.
 */

const WALK_RE = /walk|andar|caminh/i;
const RUN_RE = /run|corr/i;
const IDLE_RE = /idle|stand|parad|respir|breath/i;

const DOWN = new Vector3(0, -1, 0);

type Role = "thigh" | "knee" | "arm";

interface Limb {
  bone: Bone;
  role: Role;
  /** +1 esquerda, -1 direita (só define qual lado vai para a frente primeiro). */
  side: 1 | -1;
  restLocal: Quaternion;
  /** Rotação fixa de repouso no referencial do avatar (braços saem da pose em T para baixo). */
  rest: Quaternion;
  axis: Vector3;
  depth: number;
}

/**
 * Nome do osso normalizado: o three já troca espaços por "_" e tira ":" ("Mia:LeftArm_034" vira "MiaLeftArm_034"), então
 * tira o sufixo de índice "_034", troca separadores por espaço e põe em minúsculas.
 */
function cleanName(name: string): string {
  return name.replace(/_\d+$/, "").replace(/[_:\s]+/g, " ").trim().toLowerCase();
}

function sideOf(name: string): 1 | -1 | 0 {
  if (name.includes("left")) return 1;
  if (name.includes("right")) return -1;
  return 0;
}

function roleOf(name: string): Role | null {
  if (/thigh|upleg|upperleg|upper leg/.test(name)) return "thigh";
  if (/knee|calf|shin|lowerleg|lower leg/.test(name) || /(left|right)leg$/.test(name) || /^leg (left|right)$/.test(name)) return "knee";
  if (/(left|right)arm$/.test(name) || /upperarm|upper arm|shoulder 2/.test(name)) return "arm";
  return null;
}

function depthOf(o: Object3D): number {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
}

function bonesOf(root: Object3D): Bone[] {
  const out: Bone[] = [];
  root.traverse((o) => {
    if ((o as Bone).isBone) out.push(o as Bone);
  });
  return out;
}

export interface AutoAnimator {
  /** Avança um quadro. `walking` = a pé (em veículo o personagem não anda). */
  update(dt: number, walking: boolean): void;
  dispose(): void;
}

/**
 * @param model  cena clonada do .glb.
 * @param frame  grupo que contém `model` e se move/inclina com o corpo (+Z = frente, +Y = cima): os eixos dos balanços
 *               são medidos neste referencial (o .glb do Sketchfab costuma vir girado, por isso não se usa o próprio `model`).
 * @param clips  animações do arquivo.
 */
export function createAutoAnimator(model: Object3D, frame: Group, clips: AnimationClip[]): AutoAnimator {
  const lastPos = new Vector3();
  const pos = new Vector3();
  let havePos = false;
  let speed = 0;
  let phase = 0;
  let t = 0;

  frame.updateWorldMatrix(true, true);

  // ---- Modo 1: clipes do arquivo ----
  if (clips.length > 0) {
    const mixer = new AnimationMixer(model);
    const play = (c: AnimationClip | undefined): AnimationAction | null => {
      if (!c) return null;
      const a = mixer.clipAction(c);
      a.play();
      a.setEffectiveWeight(0);
      return a;
    };
    const walkClip = clips.find((c) => WALK_RE.test(c.name));
    const runClip = clips.find((c) => RUN_RE.test(c.name));
    const idleClip = clips.find((c) => IDLE_RE.test(c.name));
    // Clipes sem nomes reconhecidos: o primeiro toca sempre, em laço.
    const generic = !walkClip && !runClip && !idleClip;
    const walk = play(generic ? clips[0] : (walkClip ?? runClip));
    const run = runClip && runClip !== walkClip ? play(runClip) : null;
    const idle = play(idleClip);
    return {
      update(dt, walking) {
        model.getWorldPosition(pos);
        if (havePos && dt > 0) speed += (Math.min(12, pos.distanceTo(lastPos) / dt) - speed) * Math.min(1, dt * 10);
        lastPos.copy(pos);
        havePos = true;
        const moving = walking && speed > 0.4;
        const fast = moving && run !== null && speed > 6;
        const fade = Math.min(1, dt * 8);
        const blend = (a: AnimationAction | null, w: number) => a?.setEffectiveWeight(a.getEffectiveWeight() + (w - a.getEffectiveWeight()) * fade);
        blend(walk, generic ? 1 : moving && !fast ? 1 : 0);
        blend(run, fast ? 1 : 0);
        blend(idle, moving ? 0 : 1);
        // Sem clipe de parado, o de andar congela na pose quando o personagem para.
        if (walk && !generic) walk.timeScale = moving ? Math.max(0.6, Math.min(2, speed / 3)) : idle ? 1 : 0;
        mixer.update(dt);
      },
      dispose() {
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
      },
    };
  }

  // ---- Modo 2: procedural ----
  const bones = bonesOf(model);
  const limbs: Limb[] = [];
  const inv = frame.matrixWorld.clone().invert();
  const q = new Quaternion();
  const frameQ = new Quaternion();
  frame.getWorldQuaternion(frameQ);
  const frameInv = frameQ.clone().invert();
  const worldQ = (o: Object3D, out: Quaternion) => o.getWorldQuaternion(out).premultiply(frameInv);
  const worldPos = (o: Object3D, out: Vector3) => o.getWorldPosition(out).applyMatrix4(inv);

  // Para que lado o modelo olha: dedos do pé à frente do tornozelo.
  let forward = 1;
  {
    const a = new Vector3();
    const b = new Vector3();
    for (const bone of bones) {
      const n = cleanName(bone.name);
      if (/toe/.test(n) && !/end$/.test(n) && bone.parent) {
        worldPos(bone, a);
        worldPos(bone.parent, b);
        if (Math.abs(a.z - b.z) > 1e-3) {
          forward = a.z > b.z ? 1 : -1;
          break;
        }
      }
    }
  }
  const fwd = new Vector3(0, 0, forward);

  for (const bone of bones) {
    const n = cleanName(bone.name);
    const role = roleOf(n);
    if (!role) continue;
    const side = sideOf(n);
    if (side === 0) continue;
    const child = bone.children.find((c) => (c as Bone).isBone);
    if (!child) continue;
    const a = worldPos(bone, new Vector3());
    const dir = worldPos(child, new Vector3()).sub(a);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    const rest = new Quaternion();
    if (role === "arm" && Math.abs(dir.y) < 0.6) {
      // Pose em T: baixa o braço (até ~70°) para ele cair ao lado do corpo.
      const axis = new Vector3().crossVectors(dir, DOWN);
      if (axis.lengthSq() > 1e-6) {
        axis.normalize();
        const ang = Math.min(1.2, dir.angleTo(DOWN) - 0.15);
        rest.setFromAxisAngle(axis, ang);
        dir.applyQuaternion(rest);
      }
    }
    const axis = new Vector3().crossVectors(dir, fwd);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    limbs.push({ bone, role, side, restLocal: bone.quaternion.clone(), rest, axis, depth: depthOf(bone) });
  }
  limbs.sort((a, b) => a.depth - b.depth);

  const rot = new Quaternion();
  const parentQ = new Quaternion();
  const parentInv = new Quaternion();
  const baseY = frame.position.y;

  return {
    update(dt, walking) {
      t += dt;
      model.getWorldPosition(pos);
      if (havePos && dt > 0) speed += (Math.min(12, pos.distanceTo(lastPos) / dt) - speed) * Math.min(1, dt * 10);
      lastPos.copy(pos);
      havePos = true;
      const moving = walking && speed > 0.4;
      // w: 0 parado → 1 andando; a cadência cresce com a velocidade.
      const w = moving ? Math.min(1, 0.45 + speed / 8) : 0;
      if (moving) phase += dt * (5 + speed * 0.9);
      else phase += (Math.round(phase / Math.PI) * Math.PI - phase) * Math.min(1, dt * 8);
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      // Corpo todo (vale para qualquer modelo, com ou sem esqueleto).
      const hasRig = limbs.length > 0;
      const bob = moving ? Math.abs(s) * (hasRig ? 0.03 : 0.07) * w : 0;
      frame.position.y = baseY + bob;
      frame.rotation.x = moving ? 0.07 * forward * w : 0;
      frame.rotation.y = !hasRig && moving ? s * 0.07 * w : 0;
      frame.rotation.z = !hasRig && moving ? s * 0.06 * w : 0;
      frame.scale.y = 1 + Math.sin(t * 2.2) * (moving ? 0.004 : 0.012);

      if (!hasRig) return;
      frame.updateWorldMatrix(true, true);
      // O avatar gira com a direção em que anda: os balanços são sempre medidos no referencial ATUAL dele.
      frame.getWorldQuaternion(frameQ);
      frameInv.copy(frameQ).invert();
      for (const l of limbs) {
        const own = l.side * s; // lado esquerdo vai à frente quando s > 0
        let ang = 0;
        if (l.role === "thigh") ang = own * 0.75 * w;
        else if (l.role === "arm") ang = -own * 0.55 * w;
        else ang = -Math.max(0, l.side * c) * 0.9 * w; // joelho dobra (para trás) enquanto a perna avança
        // ângulo positivo no eixo = balança para a frente
        rot.setFromAxisAngle(l.axis, ang).multiply(l.rest);
        // local = P⁻¹ · R · P · restLocal (R no referencial do avatar, P = mundo atual do pai)
        const parent = l.bone.parent;
        if (parent) {
          worldQ(parent, parentQ);
          parentInv.copy(parentQ).invert();
          q.copy(parentInv).multiply(rot).multiply(parentQ).multiply(l.restLocal);
          l.bone.quaternion.copy(q);
        }
        l.bone.updateWorldMatrix(false, true);
      }
    },
    dispose() {
      for (const l of limbs) l.bone.quaternion.copy(l.restLocal);
      frame.position.y = baseY;
      frame.rotation.set(0, 0, 0);
      frame.scale.y = 1;
    },
  };
}
