import { FOOT_WALK_SPEED } from "./world.js";
import { GRIP_ADDUCT, GRIP_YAW, gripArms, punchPose, strikeArms, strikeEnvelope, strikeLean, strikeTwist, type StrikeKind } from "./strike.js";
import { fallEnvelope, fallLimbs, reactBody } from "./knock.js";
import { AnimationAction, AnimationClip, AnimationMixer, Bone, Group, Object3D, Quaternion, Vector3 } from "three";

/**
 * Animação automática de personagens enviados no admin (.glb): funciona com qualquer modelo, sem preparar nada.
 *  1. Se o arquivo traz clipes (parado/andar/correr, por nome), toca esses, misturando pela velocidade.
 *  2. Senão, anima por código, pelos nomes dos ossos (ou pelo esqueleto do editor): parado com respiração e peso mudando
 *     de perna, andar devagar, correr (corpo inclinado, cotovelos fechados), segurar bandeira, sentar na moto, bater
 *     (golpe de bandeira ou soco), levar golpe e cair.
 * A velocidade vem do deslocamento do próprio modelo no mundo, então vale para o jogador local e para os remotos.
 */

const WALK_RE = /walk|andar|caminh/i;
const RUN_RE = /run|corr/i;
const IDLE_RE = /idle|stand|parad|respir|breath/i;

const DOWN = new Vector3(0, -1, 0);

type Role = "thigh" | "knee" | "foot" | "toe" | "arm" | "forearm" | "hips" | "spine" | "neck" | "head" | "finger";

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
  /** Dedos: eixo de dobra no espaço do próprio osso (já com o sinal que fecha a mão) e falange (1 = base). */
  localAxis?: Vector3;
  level?: number;
  /** Dedos de cada lado: quanto mais para fora do polegar, mais fecha (mindinho fecha mais). */
  curlK?: number;
}

/**
 * Nome do osso normalizado: o three já troca espaços por "_" e tira ":" ("Mia:LeftArm_034" vira "MiaLeftArm_034"), então
 * tira o sufixo de índice "_034", troca separadores por espaço e põe em minúsculas.
 */
function cleanName(name: string): string {
  // "upperarmL" (o three tira o "." de "upperarm.L") vira "upperarm l"; "hand.001" (duplicata) perde o ".001".
  return name
    .replace(/\.\d+$/, "")
    .replace(/([a-z0-9])([LR])$/, "$1 $2")
    .replace(/_\d+$/, "")
    .replace(/[_:\s]+/g, " ")
    .trim()
    .toLowerCase();
}

function sideOf(name: string): 1 | -1 | 0 {
  if (name.includes("left")) return 1;
  if (name.includes("right")) return -1;
  // Sufixo/prefixo curto, como "upperarm_l", "hand.R", "l_foot" (o three troca "." e "_" por espaço aqui).
  const m = / (l|r)$/.exec(name) ?? /^(l|r) /.exec(name);
  return m ? (m[1] === "l" ? 1 : -1) : 0;
}

function roleOf(raw: string): Role | null {
  const name = raw.replace(/ (l|r)$/, "").replace(/^(l|r) /, "");
  // Dedos, rosto e ossos auxiliares (torção, correção) não são movidos: o osso principal já leva a pele.
  if (/(?:^|\s|hand)(?:thumb|index|middle|ring|pinky)|finger|\beye|jaw|brow|\blid\b|eyelid|mouth|tongue|twist|\broll\b|helper|corrective|\bik\b|\bpole\b/.test(name)) return null;
  if (/toe|ball/.test(name)) return /end$|tip/.test(name) ? null : "toe";
  if (/thigh|upleg|upperleg|upper leg/.test(name)) return "thigh";
  if (/(foot|ankle)$/.test(name)) return "foot";
  if (/forearm|lowerarm|lower arm|elbow/.test(name)) return "forearm";
  if (/hips?$/.test(name) && !/ground/.test(name)) return "hips";
  if (/spine/.test(name)) return "spine";
  if (/neck/.test(name)) return "neck";
  if (/head/.test(name) && !/top|end|eye|jaw|brow|mouth|lip/.test(name)) return "head";
  if (/knee|calf|shin|lowerleg|lower leg/.test(name) || /(left|right)leg$/.test(name) || /^leg (left|right)$/.test(name)) return "knee";
  if (/(left|right)arm$/.test(name) || /upperarm|upper arm|shoulder 2/.test(name)) return "arm";
  return null;
}

/**
 * O arquivo já traz um esqueleto humanoide que o jogo entende (braços, antebraços, coxas, joelhos e pés dos dois lados)?
 * Se sim, esse esqueleto e a pele já feitos no arquivo valem mais que os pontos marcados à mão.
 */
export function hasHumanoidSkeleton(root: Object3D): boolean {
  const seen = new Set<string>();
  for (const b of bonesOf(root)) {
    const n = cleanName(b.name);
    const role = roleOf(n);
    const side = sideOf(n);
    if (role && side !== 0 && ["arm", "forearm", "thigh", "knee", "foot"].includes(role)) seen.add(`${role}${side}`);
  }
  return ["arm", "forearm", "thigh", "knee", "foot"].every((r) => seen.has(`${r}1`) && seen.has(`${r}-1`));
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

/** O que está acontecendo com o personagem neste quadro (além de andar). */
export interface AnimContext {
  /** Sentado na moto. */
  pose?: AutoPose;
  /** Golpe em andamento: tipo e progresso 0..1. */
  strike?: { kind: StrikeKind; p: number } | null;
  /** Reação a golpe (0..1, -1 = nenhuma) e segundos de queda (-1 = em pé). */
  knock?: { react: number; fall: number };
  /** Segurando a bandeira (a pé). */
  carry?: boolean;
}

export interface AutoAnimator {
  /** Avança um quadro. `walking` = a pé (em veículo o personagem não anda). */
  update(dt: number, walking: boolean, ctx?: AnimContext): void;
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
  // Cada personagem tem um jeito próprio de andar (±10% na cadência, ±12% na amplitude), como os pedestres de GTA.
  const gaitFreq = 0.9 + Math.random() * 0.2;
  const gaitAmp = 0.88 + Math.random() * 0.24;
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
    const sided = role !== "hips" && role !== "spine" && role !== "neck" && role !== "head";
    if (sided && side === 0) continue;
    const rest = new Quaternion();
    const axis = new Vector3();
    if (!sided) {
      axis.copy(UP); // torção em torno do eixo vertical
    } else if (role === "foot" || role === "forearm" || role === "toe") {
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
          rest.setFromAxisAngle(lower, Math.min(1.45, dir.angleTo(DOWN) - 0.06));
          dir.applyQuaternion(rest);
        }
      }
      axis.crossVectors(dir, fwd);
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
      axis.normalize();
    }
    limbs.push({ bone, role, side: side === 0 ? 1 : (side as 1 | -1), restLocal: bone.quaternion.clone(), rest, axis, depth: depthOf(bone) });
  }
  // ---- Dedos: dobram em torno da linha dos nós dos dedos (índice → mindinho), para o lado da palma ----
  {
    const armL = limbs.find((l) => l.role === "arm");
    const armChild = armL?.bone.children.find((c) => (c as Bone).isBone);
    // Braço aberto (pose em T) ou caído? No arquivo, antes de baixarmos o braço.
    const tLike = armL && armChild ? Math.abs(worldPos(armChild, new Vector3()).sub(worldPos(armL.bone, new Vector3())).normalize().y) < 0.6 : true;
    const hipsB = bones.find((b) => roleOf(cleanName(b.name)) === "hips");
    const hipsX = hipsB ? worldPos(hipsB, new Vector3()).x : 0;
    const info = (b: Bone) => {
      const n = cleanName(b.name);
      const m = /(?:^|\s|hand)(thumb|index|middle|ring|pinky)/.exec(n);
      const lvl = /(\d+)(?: [lr])?$/.exec(n);
      const side = sideOf(n);
      if (!m || !lvl || m[1] === "thumb" || side === 0 || !b.children.some((c) => (c as Bone).isBone)) return null;
      return { finger: m[1]!, level: Number(lvl[1]), side };
    };
    for (const side of [1, -1] as const) {
      const mine = bones.map((b) => ({ b, i: info(b) })).filter((x) => x.i && x.i.side === side && x.i.level >= 1 && x.i.level <= 3);
      const base = (f: string) => mine.find((x) => x.i!.finger === f && x.i!.level === 1)?.b;
      const idx = base("index");
      const pin = base("pinky");
      if (!idx || !pin) continue;
      const across = worldPos(idx, new Vector3()).sub(worldPos(pin, new Vector3()));
      if (across.lengthSq() < 1e-10) continue;
      across.normalize();
      for (const { b, i } of mine) {
        const child = b.children.find((c) => (c as Bone).isBone)!;
        const d = worldPos(child, new Vector3()).sub(worldPos(b, new Vector3()));
        if (d.lengthSq() < 1e-10) continue;
        d.normalize();
        // Lado da palma: para baixo se o braço está aberto (pose em T); para dentro (rumo ao corpo) se está caído.
        const palm = tLike ? new Vector3(0, -1, 0) : new Vector3(-Math.sign(worldPos(b, new Vector3()).x - hipsX || side), 0, 0.2);
        const sign = new Vector3().crossVectors(across, d).dot(palm) >= 0 ? 1 : -1;
        const local = across.clone().multiplyScalar(sign).applyQuaternion(worldQ(b, new Quaternion()).invert());
        const k = i!.finger === "pinky" ? 1.2 : i!.finger === "ring" ? 1.1 : i!.finger === "index" ? 0.9 : 1;
        limbs.push({ bone: b, role: "finger", side, restLocal: b.quaternion.clone(), rest: new Quaternion(), axis: new Vector3(1, 0, 0), depth: depthOf(b), localAxis: local, level: i!.level, curlK: k });
      }
    }
  }
  // Cotovelo, pé e dedos giram no mesmo eixo do braço/coxa do mesmo lado.
  for (const l of limbs) {
    if (l.role !== "foot" && l.role !== "forearm" && l.role !== "toe") continue;
    const src = limbs.find((o) => o.side === l.side && o.role === (l.role === "forearm" ? "arm" : "thigh"));
    if (src) l.axis.copy(src.axis);
  }
  const usable = limbs.filter((l) => l.axis.lengthSq() > 0.5);
  limbs.length = 0;
  limbs.push(...usable);
  limbs.sort((a, b) => a.depth - b.depth);
  const count = (r: Role) => Math.max(1, limbs.filter((l) => l.role === r).length);
  const spineCount = count("spine");
  const neckCount = count("neck");
  // Comprimento da perna (quadril → tornozelo): para baixar o corpo quando as pernas se abrem e os pés não flutuarem.
  {
    const hip = limbs.find((l) => l.role === "thigh");
    const ankle = limbs.find((l) => l.role === "foot" && hip && l.side === hip.side);
    if (hip && ankle) {
      const d = worldPos(hip.bone, new Vector3()).distanceTo(worldPos(ankle.bone, new Vector3()));
      if (d > 0.2 && d < 3) legLen = d;
    }
  }
  // Altura do quadril em repouso (para sentar na moto) e eixo de inclinação (o mesmo que balança as pernas).
  const hipsLimb = limbs.find((l) => l.role === "hips");
  const hipY = hipsLimb ? worldPos(hipsLimb.bone, new Vector3()).y : 0.9;
  const leanAxis = (limbs.find((l) => l.role === "thigh") ?? { axis: new Vector3(1, 0, 0) }).axis;

  const rot = new Quaternion();
  const rotA = new Quaternion();
  const rotB = new Quaternion();
  const rotC = new Quaternion();
  const parentQ = new Quaternion();
  const parentInv = new Quaternion();
  const baseY = frame.position.y;
  const baseZ = frame.position.z;
  const baseX = frame.position.x;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const smooth = (a: number, b: number, v: number) => {
    const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  let w = 0; // 0 parado → 1 em movimento
  let runK = 0; // 0 andando → 1 correndo
  let sit = 0; // 0 em pé → 1 sentado na moto
  let carryK = 0; // 0 mãos livres → 1 segurando a bandeira

  /** Pitch de um osso que aponta para cima (tronco, pescoço): o mesmo eixo que balança as pernas inclina ao contrário. */
  const pitchAxisAngle = (lean: number) => -forward * lean;

  return {
    update(dt, walking, ctx = {}) {
      const pose = ctx.pose ?? null;
      const strike = ctx.strike ?? null;
      const knock = ctx.knock ?? { react: -1, fall: -1 };
      t += dt;
      sit += ((pose === "moto" ? 1 : 0) - sit) * Math.min(1, dt * 9);
      carryK += ((ctx.carry && pose === null ? 1 : 0) - carryK) * Math.min(1, dt * 8);
      const stand = 1 - sit;
      // Velocidade do avatar (pai do grupo): o balanço do próprio corpo não conta.
      (frame.parent ?? frame).getWorldPosition(pos);
      if (havePos && dt > 0) speed += (Math.min(24, pos.distanceTo(lastPos) / dt) - speed) * Math.min(1, dt * 10);
      lastPos.copy(pos);
      havePos = true;
      const moving = walking && speed > 0.4;
      const k = Math.min(1, dt * 9);
      w += ((moving ? 1 : 0) - w) * k;
      runK += ((moving ? smooth(FOOT_WALK_SPEED * 1.25, FOOT_WALK_SPEED * 1.9, speed) : 0) - runK) * k;
      // Cadência (ciclos/s): andar devagar (~2 passos/s); correr com passos mais rápidos. O ciclo completo = dois passos.
      const freq = lerp(0.62 + 0.1 * speed, 1.35 + 0.05 * speed, runK) * gaitFreq;
      if (moving) phase += dt * Math.PI * 2 * freq;
      else phase += (Math.round(phase / Math.PI) * Math.PI - phase) * Math.min(1, dt * 6);
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);

      const hasRig = limbs.length > 0;
      const idle = (1 - w) * stand;
      // Amplitudes da marcha (andar → correr).
      const thighAmp = lerp(0.46, 0.85, runK) * gaitAmp;
      const armAmp = lerp(0.4, 0.72, runK) * gaitAmp;
      const bob = hasRig
        ? // O quadril desce quando as pernas se abrem (pés no chão) e sobe no apoio; na corrida ainda há um impulso.
          -legLen * (1 - Math.cos(0.5 * thighAmp * Math.abs(sin))) * w + runK * 0.05 * (0.5 + 0.5 * Math.cos(2 * phase)) * w
        : (Math.abs(sin) * lerp(0.05, 0.12, runK)) * w;
      // Sentado na moto: o quadril desce até o banco e vai um pouco para trás; sem esqueleto, o corpo todo afunda e inclina.
      const seatDrop = hasRig ? 0.82 - hipY : -0.3;
      frame.position.y = baseY + bob * stand + seatDrop * sit;
      frame.position.z = baseZ + -0.05 * sit;
      frame.position.x = baseX + 0.025 * Math.sin(phase) * w * stand * (hasRig ? 1 : 0);
      frame.rotation.x = forward * (lerp(0.03, 0.24, runK) * w * stand + (hasRig ? 0 : 0.3) * sit);
      frame.rotation.y = !hasRig ? sin * 0.07 * w * stand : 0;
      // Parado: o corpo todo balança de leve, como respirando e mudando o peso de perna.
      frame.rotation.z = !hasRig ? sin * 0.06 * w * stand + Math.sin(t * 0.7) * 0.012 * idle : 0;
      frame.scale.y = 1 + Math.sin(t * 2.2) * (moving ? 0.003 : 0.008);

      if (!hasRig) return;
      frame.updateWorldMatrix(true, true);
      // O avatar gira com a direção em que anda: os balanços são sempre medidos no referencial ATUAL dele.
      frame.getWorldQuaternion(frameQ);
      frameInv.copy(frameQ).invert();

      const sp = strike ? strikeEnvelope(strike.p) : 0;
      const flagHit = strike && strike.kind === "flag" ? strike : null;
      const punch = strike && strike.kind === "punch" ? punchPose(strike.p) : null;
      const sArms = flagHit ? strikeArms(flagHit.p) : null;
      const grips = carryK > 0.001 ? gripArms(flagHit ? flagHit.p : null, sp) : null;
      const react = knock.react >= 0 ? reactBody(knock.react) : null;
      const fallEnv = knock.fall >= 0 ? fallEnvelope(knock.fall) : 0;
      const fall = knock.fall >= 0 ? fallLimbs(knock.fall) : null;
      const breathe = Math.sin(t * 2.2);
      const sway = Math.sin(t * 0.55); // peso passando de uma perna para a outra
      // Parado: de tempos em tempos olha em volta (cabeça gira rápido, segura e volta), como pedestre esperando.
      const lookCycle = (t * 0.22 + gaitFreq * 7) % 1;
      const glance = lookCycle < 0.18 ? Math.sin((lookCycle / 0.18) * Math.PI) : 0;
      const look = Math.sin(t * 0.31) * 0.5 + glance * (Math.floor(t * 0.22 + gaitFreq * 7) % 2 ? 1 : -1) * 1.6;

      // Mão: levemente fechada ao andar e parado; punho fechado ao socar; fechada na haste da bandeira.
      const fist = Math.max(punch ? sp : 0, carryK > 0.001 ? 0.75 * carryK : 0);
      for (const l of limbs) {
        if (l.role === "finger") {
          const relaxed = [0, 0.3, 0.45, 0.35][l.level!] ?? 0.3;
          const closed = [0, 1.25, 1.55, 1.05][l.level!] ?? 1.2;
          const a = (relaxed + (closed - relaxed) * fist) * (l.curlK ?? 1);
          l.bone.quaternion.copy(l.restLocal).multiply(rotA.setFromAxisAngle(l.localAxis!, a));
          continue; // as matrizes do mundo se atualizam na cadeia dos pais / ao desenhar

        }
        const sl = l.side > 0 ? sin : -sin; // a esquerda vai à frente quando sin > 0
        const cl = l.side > 0 ? cos : -cos;
        const isLeft = l.side > 0;
        // ── ângulo principal (positivo = para a frente) e, nos ossos do tronco, torção/inclinação/giro lateral ──
        let ang = 0;
        let twist = 0;
        let lean = 0;
        let roll = 0;
        switch (l.role) {
          case "thigh": {
            const idleA = 0.03 + 0.025 * (isLeft ? sway : -sway);
            ang = idleA * (1 - w) + w * (thighAmp * sl + lerp(0.02, 0.12, runK));
            break;
          }
          case "knee": {
            const idleA = -(0.05 + 0.03 * Math.max(0, isLeft ? sway : -sway));
            const gait = -(lerp(0.1, 0.3, runK) + lerp(0.95, 1.6, runK) * Math.pow(Math.max(0, cl), 1.3));
            ang = idleA * (1 - w) + w * gait;
            break;
          }
          case "foot": {
            const thigh = thighAmp * sl + lerp(0.02, 0.12, runK);
            const knee = -(lerp(0.1, 0.3, runK) + lerp(0.95, 1.6, runK) * Math.pow(Math.max(0, cl), 1.3));
            ang = w * (-0.78 * (thigh + knee) + lerp(0.08, 0.12, runK) * sl);
            break;
          }
          case "toe":
            // Os dedos dobram na impulsão (perna atrás).
            ang = w * lerp(0.5, 0.6, runK) * Math.max(0, -sl);
            break;
          case "arm": {
            const idleA = 0.05 + 0.012 * Math.sin(t * 1.6 + l.side);
            ang = idleA * (1 - w) + w * (-armAmp * sl + 0.06);
            break;
          }
          case "forearm": {
            const idleA = 0.3 + 0.025 * Math.sin(t * 1.9 + l.side);
            const gait = lerp(0.2, 1.35, runK) + lerp(0.3, 0.3, runK) * Math.max(0, sl);
            ang = idleA * (1 - w) + w * gait;
            break;
          }
          case "hips":
            // Quadril gira com a perna que avança e pende para o lado do apoio; parado, muda o peso devagar.
            twist = -forward * (w * lerp(0.08, 0.2, runK) * sin + 0.035 * Math.sin(t * 0.4) * (1 - w));
            roll = w * 0.045 * sin + 0.03 * sway * (1 - w);
            break;
          case "spine":
            // Coluna contra-gira e respira.
            twist = (forward * w * lerp(0.07, 0.3, runK) * sin) / spineCount;
            lean = (0.025 + 0.012 * breathe * (1 - w * 0.5)) / spineCount;
            roll = (-0.02 * sway * (1 - w)) / spineCount;
            break;
          case "neck":
            twist = (0.09 * look * (1 - w) - 0.35 * forward * w * lerp(0.07, 0.3, runK) * sin) / neckCount;
            lean = (0.03 + 0.02 * Math.cos(2 * phase) * w) / neckCount;
            roll = (0.02 * Math.sin(t * 0.35) * (1 - w)) / neckCount;
            break;
          case "head":
            twist = 0.05 * look * (1 - w);
            lean = 0.015 + 0.015 * Math.cos(2 * phase) * w;
            break;
        }

        // ── segurar a bandeira com as duas mãos: a direita onde a esquerda segurava, a esquerda desliza haste abaixo ──
        let adduct = 0;
        let yaw = 0;
        if (carryK > 0.001 && (l.role === "arm" || l.role === "forearm")) {
          const g = grips ?? gripArms(null, 0);
          const t = l.role === "arm" ? (isLeft ? g.lower.arm : g.upper.arm) : isLeft ? g.lower.forearm : g.upper.forearm;
          ang = lerp(ang, t + (l.role === "arm" ? 0.03 * Math.sin(2 * phase) * w : 0), carryK);
          if (l.role === "arm") adduct = GRIP_ADDUCT * carryK;
          else yaw = GRIP_YAW * carryK; // antebraço gira para dentro: as mãos se encontram na haste sem o braço entrar no corpo
        }

        // ── sentado na moto (mistura com o andar): coxas à frente, joelhos dobrados, braços no guidão, tronco inclinado ──
        if (sit > 0.001) {
          let seated = ang;
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
            case "toe":
              seated = 0;
              break;
            case "arm":
              seated = 1.05;
              break;
            case "forearm":
              seated = 0.25;
              break;
          }
          ang = lerp(ang, seated, sit);
          if (l.role === "spine") lean = lerp(lean, 0.6 / spineCount, sit);
          if (l.role === "neck") lean = lerp(lean, -0.25 / neckCount, sit);
          if (l.role === "hips") {
            twist *= stand;
            roll *= stand;
          }
        }

        // ── golpe com a bandeira ──
        if (flagHit && sArms) {
          if (l.role === "hips") twist += -forward * strikeTwist(flagHit.p) * sp;
          else if (l.role === "spine") {
            twist += (forward * strikeTwist(flagHit.p) * sp * 0.6) / spineCount;
            lean += (strikeLean(flagHit.p) * sp) / spineCount;
          }
        }
        // ── soco (sem bandeira): braço direito soca, esquerdo na guarda, corpo gira e a perna esquerda dá um passo ──
        if (punch) {
          if (l.role === "arm") ang = lerp(ang, isLeft ? punch.lArm : punch.rArm, sp);
          else if (l.role === "forearm") ang = lerp(ang, isLeft ? punch.lFore : punch.rFore, sp);
          else if (l.role === "hips") twist += forward * punch.twist * 0.6 * sp;
          else if (l.role === "spine") {
            twist += (forward * punch.twist * 0.7 * sp) / spineCount;
            lean += (punch.lean * sp) / spineCount;
          } else if (l.role === "thigh") ang += (isLeft ? punch.step : -punch.step * 0.4) * sp;
          else if (l.role === "knee") ang += (isLeft ? -punch.step * 0.5 : 0) * sp;
        }

        // ── levar golpe (recuo) e cair no chão ──
        if (react) {
          if (l.role === "arm") ang += react.arms;
          if (l.role === "spine") lean += react.tilt / spineCount;
          if (l.role === "neck") lean += react.tilt * 0.5;
        }
        if (fall && fallEnv > 0) {
          switch (l.role) {
            case "arm":
              ang = lerp(ang, fall.arm, fallEnv);
              break;
            case "forearm":
              ang = lerp(ang, fall.forearm, fallEnv);
              break;
            case "thigh":
              ang = lerp(ang, fall.thigh, fallEnv);
              break;
            case "knee":
              ang = lerp(ang, fall.knee, fallEnv);
              break;
            case "foot":
            case "toe":
              ang = lerp(ang, 0, fallEnv);
              break;
            case "spine":
              lean = lerp(lean, fall.lean / spineCount, fallEnv);
              twist *= 1 - fallEnv;
              roll *= 1 - fallEnv;
              break;
            case "neck":
              lean = lerp(lean, fall.head / neckCount, fallEnv);
              break;
            case "hips":
              twist *= 1 - fallEnv;
              roll *= 1 - fallEnv;
              break;
          }
        }

        // ── monta a rotação no referencial do avatar ──
        if (l.role === "hips" || l.role === "spine" || l.role === "neck" || l.role === "head") {
          rotA.setFromAxisAngle(l.axis, twist); // torção (eixo vertical)
          rotB.setFromAxisAngle(leanAxis, pitchAxisAngle(lean)); // inclinação para a frente/trás
          rotC.setFromAxisAngle(fwd, roll); // inclinação para os lados
          rot.copy(rotC).multiply(rotB).multiply(rotA).multiply(l.rest);
        } else {
          // ângulo positivo no eixo = balança para a frente
          rot.setFromAxisAngle(l.axis, ang).multiply(l.rest);
          // Braços se fecham para o centro (as duas mãos na haste): giro em torno do eixo da frente, antes do balanço.
          if (adduct > 0) {
            // Fecha o braço primeiro e balança depois (rot = balanço · fechar · repouso): vale em qualquer altura do braço.
            rotC.setFromAxisAngle(fwd, -l.side * adduct);
            rot.setFromAxisAngle(l.axis, ang).multiply(rotC).multiply(l.rest);
          }
          if (yaw > 0) {
            rotC.setFromAxisAngle(UP, -l.side * yaw);
            rot.premultiply(rotC);
          }
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
      frame.position.x = baseX;
      frame.rotation.set(0, 0, 0);
      frame.scale.y = 1;
    },
  };
}
