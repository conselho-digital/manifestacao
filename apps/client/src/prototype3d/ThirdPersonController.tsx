import { Suspense, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAnimations } from "@react-three/drei";
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { AnimationAction, LoopOnce, LoopRepeat, Object3D, Quaternion, Vector3, type Group } from "three";
import { AssetModel, type LoadedAsset } from "./AssetModel.js";
import { CAMERA, CHARACTER_HEIGHT, CLIPS, FILES, PHYSICS, type Locomotion } from "./config.js";
import { useControls } from "./useControls.js";

const PITCH_RANGE: [number, number] = [CAMERA.minPitch, CAMERA.maxPitch];
const FOOT_OFFSET = PHYSICS.capsuleHalfHeight + PHYSICS.capsuleRadius;

interface Props {
  spawn?: [number, number, number];
  /** Disparado quando o ataque começa (aqui entra a lógica de golpe/dano — no servidor, quando houver). */
  onAttack?: () => void;
}

/** Marcador provisório do personagem (mesmas medidas da cápsula de física). */
function Placeholder() {
  return (
    <mesh position={[0, FOOT_OFFSET, 0]} castShadow>
      <capsuleGeometry args={[PHYSICS.capsuleRadius, PHYSICS.capsuleHalfHeight * 2, 6, 12]} />
      <meshStandardMaterial color="#e5484d" />
    </mesh>
  );
}

/** Personagem com animações esqueléticas: o modelo vem de FILES.character e os clipes de CLIPS. */
function CharacterModel({ state }: { state: Locomotion }) {
  const group = useRef<Group>(null);
  const motion = useRef<Group>(null);
  const [asset, setAsset] = useState<LoadedAsset | null>(null);
  const { actions, mixer } = useAnimations(asset?.animations ?? [], group);
  const current = useRef<AnimationAction | null>(null);
  const warned = useRef(new Set<string>());
  // Modelo sem animações (malha estática, sem esqueleto): o movimento é feito no conjunto, por código.
  const staticModel = asset !== null && asset.animations.length === 0;
  const stateRef = useRef(state);
  stateRef.current = state;
  const attackStart = useRef(0);

  useEffect(() => {
    if (state === "attack") attackStart.current = performance.now();
    if (staticModel) return;
    const clipName = CLIPS[state];
    const next = actions[clipName] ?? actions[CLIPS.idle] ?? null;
    if (asset && !actions[clipName] && !warned.current.has(clipName)) {
      warned.current.add(clipName);
      console.warn(`[prototype3d] clipe "${clipName}" não existe no personagem; usando "${CLIPS.idle}". Disponíveis:`, Object.keys(actions));
    }
    if (!next || next === current.current) return;
    const oneShot = state === "attack";
    next.reset();
    next.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
    next.clampWhenFinished = oneShot;
    next.fadeIn(0.15).play();
    current.current?.fadeOut(0.15);
    current.current = next;
  }, [state, actions, asset, staticModel]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  // Movimento procedural para malha estática: balanço ao andar/correr, respiração parado, inclinação ao golpear.
  useFrame(({ clock }) => {
    const m = motion.current;
    if (!m || !staticModel) return;
    const t = clock.elapsedTime;
    const s = stateRef.current;
    let bob = 0, roll = 0, pitch = 0, lunge = 0;
    if (s === "walk") { bob = Math.abs(Math.sin(t * 8)) * 0.05; roll = Math.sin(t * 8) * 0.05; pitch = 0.05; }
    else if (s === "run") { bob = Math.abs(Math.sin(t * 12)) * 0.09; roll = Math.sin(t * 12) * 0.07; pitch = 0.2; }
    else if (s === "aim") { pitch = -0.05; }
    else if (s === "attack") {
      const u = Math.min(1, (performance.now() - attackStart.current) / 600);
      pitch = Math.sin(u * Math.PI) * 0.45;
      lunge = Math.sin(u * Math.PI) * 0.25;
    } else { bob = Math.sin(t * 2) * 0.008; }
    m.position.set(0, bob, lunge);
    m.rotation.set(pitch, 0, roll);
  });

  return (
    <group ref={group} position={[0, -FOOT_OFFSET, 0]}>
      {/* Enquanto não carrega (ou se o arquivo falhar), uma cápsula visível marca onde o personagem está. */}
      <group ref={motion}>
        <AssetModel file={FILES.character} fitHeight={CHARACTER_HEIGHT} onLoaded={setAsset} fallback={<Placeholder />} />
      </group>
    </group>
  );
}

/**
 * Controlador em 3ª pessoa: cápsula de física (Rapier) movida por velocidade, câmera sobre o ombro com
 * "braço de mola" (a câmera encosta e se aproxima quando há parede no caminho) e estados de animação:
 * idle · walk · run · aim (botão direito) · attack (clique esquerdo).
 */
export function ThirdPersonController({ spawn = [0, 2, 0], onAttack }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const { world, rapier } = useRapier();
  const controls = useControls(gl.domElement, CAMERA.sensitivity, PITCH_RANGE);
  const [anim, setAnim] = useState<Locomotion>("idle");
  const attackUntil = useRef(0);
  const facing = useRef(new Quaternion());
  const tmp = useRef({ dir: new Vector3(), want: new Vector3(), arm: new Vector3(), cam: new Vector3(), look: new Vector3(), qy: new Quaternion(), up: new Vector3(0, 1, 0) });
  const visual = useRef<Object3D>(null);

  useFrame((_, rawDelta) => {
    const rb = body.current;
    if (!rb) return;
    const dt = Math.min(rawDelta, 0.1);
    const c = controls.current;
    const t = tmp.current;
    const now = performance.now();

    // Ataque: um pulso do mouse inicia o golpe, que dura 0,6 s e trava a troca de animação.
    if (c.attack) {
      c.attack = false;
      if (now > attackUntil.current) {
        attackUntil.current = now + 600;
        onAttack?.();
      }
    }
    const attacking = now < attackUntil.current;

    // Direção desejada: relativa à câmera (yaw), no plano horizontal.
    t.dir.set(c.x, 0, c.z);
    const moving = t.dir.lengthSq() > 0;
    if (moving) t.dir.normalize().applyAxisAngle(t.up, c.yaw);
    const speed = c.aim ? PHYSICS.aimSpeed : c.run ? PHYSICS.runSpeed : PHYSICS.walkSpeed;

    // Chão: raio curto para baixo a partir do centro (ignora o próprio corpo).
    const p = rb.translation();
    const ray = new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, FOOT_OFFSET + 0.15, true, undefined, undefined, undefined, rb);
    const grounded = hit !== null;

    const v = rb.linvel();
    let vy = v.y;
    if (grounded && c.jump && vy <= 0.1) vy = PHYSICS.jumpSpeed;
    rb.setLinvel({ x: t.dir.x * speed, y: vy, z: t.dir.z * speed }, true);

    // O corpo vira para onde anda (ou para onde a câmera olha, ao mirar/atacar).
    const turnTo = c.aim || attacking ? c.yaw : moving ? Math.atan2(t.dir.x, t.dir.z) : null;
    if (turnTo !== null && visual.current) {
      t.qy.setFromAxisAngle(t.up, turnTo + (c.aim || attacking ? Math.PI : 0));
      facing.current.slerp(t.qy, 1 - Math.pow(0.0005, dt));
      visual.current.quaternion.copy(facing.current);
    }

    // Estado de animação.
    const next: Locomotion = attacking ? "attack" : c.aim ? "aim" : moving ? (c.run ? "run" : "walk") : "idle";
    if (next !== anim) setAnim(next);

    // Câmera sobre o ombro, com braço de mola.
    const dist = c.aim ? CAMERA.aimDistance : CAMERA.distance;
    const cosP = Math.cos(c.pitch);
    t.look.set(p.x, p.y + CAMERA.height - FOOT_OFFSET + 0.4, p.z);
    t.dir.set(Math.sin(c.yaw) * cosP, Math.sin(c.pitch), Math.cos(c.yaw) * cosP); // do alvo PARA a câmera
    t.want.copy(t.look).addScaledVector(t.dir, dist);
    t.want.x += Math.cos(c.yaw) * CAMERA.shoulder;
    t.want.z -= Math.sin(c.yaw) * CAMERA.shoulder;
    const toCam = t.arm.copy(t.want).sub(t.look); // vetor próprio: `t.cam` é reutilizado logo abaixo
    const len = toCam.length();
    toCam.divideScalar(len);
    const sray = new rapier.Ray({ x: t.look.x, y: t.look.y, z: t.look.z }, { x: toCam.x, y: toCam.y, z: toCam.z });
    const wall = world.castRay(sray, len, true, undefined, undefined, undefined, rb);
    const used = wall ? Math.max(0.4, wall.timeOfImpact - 0.2) : len;
    camera.position.lerp(t.cam.copy(t.look).addScaledVector(toCam, used), 1 - Math.pow(0.0001, dt));
    camera.lookAt(t.look);
  });

  return (
    <RigidBody ref={body} position={spawn} colliders={false} lockRotations enabledRotations={[false, false, false]} linearDamping={0.2} canSleep={false}>
      <CapsuleCollider args={[PHYSICS.capsuleHalfHeight, PHYSICS.capsuleRadius]} friction={0} />
      <object3D ref={visual}>
        <Suspense fallback={null}>
          <CharacterModel state={anim} />
        </Suspense>
      </object3D>
    </RigidBody>
  );
}
