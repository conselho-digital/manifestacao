import { FOOT_WALK_SPEED } from "./world.js";
import { strikeArm, strikeEnvelope, strikeLean, strikeTwist } from "./strike.js";
import { fallEnvelope, fallLimbs, reactBody } from "./knock.js";
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

/** Posição do quadril do piloto na moto (m, a partir da origem da moto; z para a frente). */
export const MOTO_RIDER_HIP_Y = 0.82;
export const MOTO_RIDER_Z = -0.05;

export type AutoPose = "moto" | null;

export interface AutoAnimator {
  /** Avança um quadro. `walking` = a pé (em veículo o personagem não anda); `pose` = sentado na moto. */
  /** `knock`: reação a golpe (0..1, -1 = nenhuma) e segundos de queda (-1 = em pé). */
  update(dt: number, walking: boolean, pose?: AutoPose, strike?: number, knock?: { react: number; fall: number }): void;
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
      update(dt, walking, _pose, _strike, _knock) {
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

  // Altura do quadril em repouso (para sentar na moto) e eixo de inclinação do tronco (o mesmo que balança as pernas).
  const hipsLimb = limbs.find((l) => l.role === "hips");
  const hipY = hipsLimb ? worldPos(hipsLimb.bone, new Vector3()).y : 0.9;
  const leanAxis = (limbs.find((l) => l.role === "thigh") ?? { axis: new Vector3(1, 0, 0) }).axis;
  const rotTwist = new Quaternion();
  const rotLean = new Quaternion();
  const rot = new Quaternion();
  const parentQ = new Quaternion();
  const parentInv = new Quaternion();
  const baseY = frame.position.y;
  const baseZ = frame.position.z;
  let sit = 0; // 0 em pé → 1 sentado na moto
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const smooth = (a: number, b: number, v: number) => {
    const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  let w = 0; // 0 parado → 1 em movimento
  let runK = 0; // 0 andando → 1 correndo

  return {
    update(dt, walking, pose = null, strike = -1, knock = { react: -1, fall: -1 }) {
      t += dt;
      sit += ((pose === "moto" ? 1 : 0) - sit) * Math.min(1, dt * 9);
      const stand = 1 - sit;
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
      // Sentado na moto: o quadril desce até o banco e vai um pouco para trás; sem esqueleto, o corpo todo afunda e inclina.
      const seatDrop = hasRig ? MOTO_RIDER_HIP_Y - hipY : -0.3;
      frame.position.y = baseY + bob * stand + seatDrop * sit;
      frame.position.z = baseZ + MOTO_RIDER_Z * sit;
      frame.rotation.x = forward * (lerp(0.04, 0.24, runK) * w * stand + (hasRig ? 0 : 0.3) * sit);
      frame.rotation.y = !hasRig ? sin * 0.07 * w * stand : 0;
      frame.rotation.z = !hasRig ? sin * 0.06 * w * stand : 0;
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
        // Pose de piloto (mistura com o andar pelo `sit`): coxas à frente, joelhos dobrados, braços no guidão, tronco inclinado.
        if (sit > 0.001) {
          let seated = 0;
          switch (l.role) {
            case "thigh":
              seated = 1.1;
              break;
            case "knee":
              seated = -1.35;
              break;
            case "foot":
              seated = -0.8 * (1.1 - 1.35);
              break;
            case "arm":
              seated = 1.05;
              break;
            case "forearm":
              seated = 0.25;
              break;
          }
          ang = ang * stand + seated * sit;
        }
        // Golpe com a bandeira: o braço da bandeira (esquerdo, lado +x) leva a bandeira; o outro ajuda um pouco.
        const hit = strike >= 0 ? strikeEnvelope(strike) : 0;
        if (hit > 0) {
          if (l.role === "arm") ang = ang * (1 - hit) + strikeArm(strike) * (l.side > 0 ? 1 : 0.6) * hit;
          else if (l.role === "forearm") ang = ang * (1 - hit) + (l.side > 0 ? 0.35 : 0.5) * hit;
          else if (l.role === "hips") ang += -forward * strikeTwist(strike) * hit;
        }
        // Levar golpe (recuo) e cair no chão: os membros seguem a pose, que domina o andar.
        const react = knock.react >= 0 ? reactBody(knock.react) : null;
        const fallEnv = knock.fall >= 0 ? fallEnvelope(knock.fall) : 0;
        const fall = knock.fall >= 0 ? fallLimbs(knock.fall) : null;
        let knockLean = 0;
        if (react) {
          if (l.role === "arm") ang += react.arms;
          knockLean += react.tilt;
        }
        if (fall && fallEnv > 0) {
          switch (l.role) {
            case "arm":
              ang = ang * (1 - fallEnv) + fall.arm * fallEnv;
              break;
            case "forearm":
              ang = ang * (1 - fallEnv) + fall.forearm * fallEnv;
              break;
            case "thigh":
              ang = ang * (1 - fallEnv) + fall.thigh * fallEnv;
              break;
            case "knee":
              ang = ang * (1 - fallEnv) + fall.knee * fallEnv;
              break;
            case "foot":
              ang = ang * (1 - fallEnv);
              break;
          }
          knockLean += fall.lean * fallEnv;
        }
        // ângulo positivo no eixo = balança para a frente
        if (l.role === "spine") {
          rotTwist.setFromAxisAngle(l.axis, ang + (strike >= 0 ? forward * strikeTwist(strike) * hit * 0.6 : 0)); // `ang` já vem misturado com a pose
          const lean = 0.6 * sit + (strike >= 0 ? strikeLean(strike) * hit : 0) + knockLean;
          rotLean.setFromAxisAngle(leanAxis, (-forward * lean) / spineCount); // para cima, o mesmo eixo inclina o tronco ao contrário das pernas
          rot.copy(rotLean).multiply(rotTwist).multiply(l.rest);
        } else {
          rot.setFromAxisAngle(l.axis, ang).multiply(l.rest);
        }
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
      frame.position.z = baseZ;
      frame.rotation.set(0, 0, 0);
      frame.scale.y = 1;
    },
  };
}
