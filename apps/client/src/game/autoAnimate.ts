import { FOOT_WALK_SPEED } from "./world.js";
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

type Role = "thigh" | "knee" | "foot" | "arm" | "forearm" | "hips" | "spine";

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
  if (/toe/.test(name)) return null;
  if (/thigh|upleg|upperleg|upper leg/.test(name)) return "thigh";
  if (/(foot|ankle)$/.test(name)) return "foot";
  if (/forearm|lowerarm|lower arm|elbow/.test(name)) return "forearm";
  if (/hips?$/.test(name) && !/ground/.test(name)) return "hips";
  if (/spine/.test(name)) return "spine";
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
        (frame.parent ?? frame).getWorldPosition(pos);
        if (havePos && dt > 0) speed += (Math.min(24, pos.distanceTo(lastPos) / dt) - speed) * Math.min(1, dt * 10);
        lastPos.copy(pos);
        havePos = true;
        const moving = walking && speed > 0.4;
        const fast = moving && run !== null && speed > FOOT_WALK_SPEED * 1.3;
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
  const UP = new Vector3(0, 1, 0);

  const tmp = new Vector3();
  let legLen = 0.9;
  for (const bone of bones) {
    const n = cleanName(bone.name);
    const role = roleOf(n);
    if (!role) continue;
    const side = sideOf(n);
    const sided = role !== "hips" && role !== "spine";
    if (sided && side === 0) continue;
    const rest = new Quaternion();
    const axis = new Vector3();
    if (role === "hips" || role === "spine") {
      axis.copy(UP); // torção em torno do eixo vertical
    } else if (role === "foot" || role === "forearm") {
      axis.set(0, 0, 0); // vem do osso de cima (coxa/braço do mesmo lado), abaixo
    } else {
      const child = bone.children.find((c) => (c as Bone).isBone);
      if (!child) continue;
      const a = worldPos(bone, new Vector3());
      const dir = worldPos(child, tmp).sub(a);
      if (dir.lengthSq() < 1e-10) continue;
      dir.normalize();
      if (role === "arm" && Math.abs(dir.y) < 0.6) {
        // Pose em T: baixa o braço (até ~70°) para ele cair ao lado do corpo.
        const lower = new Vector3().crossVectors(dir, DOWN);
        if (lower.lengthSq() > 1e-6) {
          lower.normalize();
          rest.setFromAxisAngle(lower, Math.min(1.2, dir.angleTo(DOWN) - 0.15));
          dir.applyQuaternion(rest);
        }
      }
      axis.crossVectors(dir, fwd);
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
      axis.normalize();
    }
    limbs.push({ bone, role, side: side === 0 ? 1 : (side as 1 | -1), restLocal: bone.quaternion.clone(), rest, axis, depth: depthOf(bone) });
  }
  // Cotovelo e pé giram no mesmo eixo do braço/coxa do mesmo lado.
  for (const l of limbs) {
    if (l.role !== "foot" && l.role !== "forearm") continue;
    const src = limbs.find((o) => o.side === l.side && o.role === (l.role === "foot" ? "thigh" : "arm"));
    if (src) l.axis.copy(src.axis);
  }
  const usable = limbs.filter((l) => l.axis.lengthSq() > 0.5);
  limbs.length = 0;
  limbs.push(...usable);
  limbs.sort((a, b) => a.depth - b.depth);
  const spineCount = Math.max(1, limbs.filter((l) => l.role === "spine").length);
  // Comprimento da perna (quadril → tornozelo): para baixar o corpo quando as pernas se abrem e os pés não flutuarem.
  {
    const hip = limbs.find((l) => l.role === "thigh");
    const ankle = limbs.find((l) => l.role === "foot" && hip && l.side === hip.side);
    if (hip && ankle) {
      const d = worldPos(hip.bone, new Vector3()).distanceTo(worldPos(ankle.bone, new Vector3()));
      if (d > 0.2 && d < 3) legLen = d;
    }
  }

  const rot = new Quaternion();
  const parentQ = new Quaternion();
  const parentInv = new Quaternion();
  const baseY = frame.position.y;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const smooth = (a: number, b: number, v: number) => {
    const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  let w = 0; // 0 parado → 1 em movimento
  let runK = 0; // 0 andando → 1 correndo

  return {
    update(dt, walking) {
      t += dt;
      // Velocidade do avatar (pai do grupo): o balanço do próprio corpo não conta.
      (frame.parent ?? frame).getWorldPosition(pos);
      if (havePos && dt > 0) speed += (Math.min(24, pos.distanceTo(lastPos) / dt) - speed) * Math.min(1, dt * 10);
      lastPos.copy(pos);
      havePos = true;
      const moving = walking && speed > 0.4;
      const k = Math.min(1, dt * 9);
      w += ((moving ? 1 : 0) - w) * k;
      runK += ((moving ? smooth(FOOT_WALK_SPEED * 1.12, FOOT_WALK_SPEED * 1.5, speed) : 0) - runK) * k;
      // Cadência (ciclos/s): corre com passos mais rápidos; o ciclo completo = dois passos.
      const freq = lerp(1.0 + 0.1 * speed, 1.5 + 0.05 * speed, runK);
      if (moving) phase += dt * Math.PI * 2 * freq;
      else phase += (Math.round(phase / Math.PI) * Math.PI - phase) * Math.min(1, dt * 8);
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);

      const hasRig = limbs.length > 0;
      // Parâmetros da marcha (andar → correr).
      const thighAmp = lerp(0.62, 1.05, runK);
      const bob = hasRig
        ? // O quadril desce quando as pernas se abrem (pés no chão) e sobe no apoio; na corrida ainda há um impulso.
          -legLen * (1 - Math.cos(0.5 * thighAmp * Math.abs(sin))) * w + runK * 0.05 * (0.5 + 0.5 * Math.cos(2 * phase)) * w
        : (Math.abs(sin) * lerp(0.07, 0.12, runK)) * w;
      frame.position.y = baseY + bob;
      frame.rotation.x = forward * lerp(0.04, 0.24, runK) * w;
      frame.rotation.y = !hasRig ? sin * 0.07 * w : 0;
      frame.rotation.z = !hasRig ? sin * 0.06 * w : 0;
      frame.scale.y = 1 + Math.sin(t * 2.2) * (moving ? 0.004 : 0.012);

      if (!hasRig) return;
      frame.updateWorldMatrix(true, true);
      // O avatar gira com a direção em que anda: os balanços são sempre medidos no referencial ATUAL dele.
      frame.getWorldQuaternion(frameQ);
      frameInv.copy(frameQ).invert();
      for (const l of limbs) {
        // Fase da perna deste lado: a esquerda vai à frente quando sin > 0; o outro lado está meio ciclo adiante.
        const sl = l.side > 0 ? sin : -sin;
        const cl = l.side > 0 ? cos : -cos;
        let ang = 0;
        switch (l.role) {
          case "thigh":
            ang = w * (thighAmp * sl + lerp(0.03, 0.12, runK));
            break;
          case "knee":
            // Dobra (para trás) com a perna passando à frente; na corrida o calcanhar sobe bem mais.
            ang = -w * (lerp(0.1, 0.3, runK) + lerp(0.75, 1.6, runK) * Math.pow(Math.max(0, cl), 1.3));
            break;
          case "foot": {
            // O pé compensa a coxa e o joelho (que o inclinam junto) para ficar quase paralelo ao chão, com a ponta
            // um pouco para cima ao tocar o chão e para baixo na impulsão.
            const thigh = thighAmp * sl + lerp(0.03, 0.12, runK);
            const knee = -(lerp(0.1, 0.3, runK) + lerp(0.75, 1.6, runK) * Math.pow(Math.max(0, cl), 1.3));
            ang = w * (-0.78 * (thigh + knee) + lerp(0.08, 0.12, runK) * sl);
            break;
          }
          case "arm":
            // Braço oposto à perna do mesmo lado.
            ang = -w * lerp(0.5, 0.95, runK) * sl;
            break;
          case "forearm":
            // Cotovelo sempre um pouco dobrado; na corrida, perto de 90°, fechando mais com o braço à frente.
            ang = w * (lerp(0.22, 1.35, runK) + lerp(0.35, 0.3, runK) * Math.max(0, sl));
            break;
          case "hips":
            // Quadril gira com a perna que avança (esquerda à frente = giro para o lado negativo).
            ang = -forward * w * lerp(0.14, 0.22, runK) * sin;
            break;
          case "spine":
            // Coluna contra-gira para o tronco ficar mais estável que o quadril.
            ang = (forward * w * lerp(0.2, 0.32, runK) * sin) / spineCount;
            break;
        }
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
