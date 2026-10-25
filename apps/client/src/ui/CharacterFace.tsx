import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, type Bone, type Group, type Object3D, Vector3 } from "three";
import type { CharacterId } from "@manifestacao/shared";
import { AvatarGlyph } from "./AvatarGlyph.js";
import { GlbModel } from "../game/props3d.js";
import { modelUrlFor } from "../game/models.js";
import { Boundary, acquire } from "../shop/ProductThumb.js";

const portraits = new Map<string, string>();

/** Descarta os retratos prontos (após o admin trocar modelos). */
export function clearFacePortraits(): void {
  portraits.clear();
}

const lowName = (o: Object3D) => o.name.replace(/[^a-z]/gi, "").toLowerCase();

/**
 * Acha sozinho onde está o rosto e para que lado ele olha: a cabeça vem do osso "head" e a frente, da direção
 * calcanhar → ponta do pé (os pés apontam para onde o personagem olha). Sem esqueleto, usa o topo do modelo, de frente (+Z).
 */
function locateFace(root: Object3D): { target: Vector3; forward: Vector3; height: number } | null {
  root.updateWorldMatrix(true, true);
  const bones: Object3D[] = [];
  root.traverse((o) => {
    if ((o as Bone).isBone) bones.push(o);
  });
  const head = bones.find((b) => /head$/.test(lowName(b))) ?? bones.find((b) => lowName(b).includes("head") && !/top|end/.test(lowName(b)));
  if (!head) return null;
  const hp = head.getWorldPosition(new Vector3());
  const feet = bones.filter((b) => /foot$/.test(lowName(b)));
  const toes = bones.filter((b) => /toe/.test(lowName(b)) && !/end|top/.test(lowName(b)));
  const forward = new Vector3();
  for (const t of toes) {
    const tp = t.getWorldPosition(new Vector3());
    const f = feet.reduce<Object3D | null>((best, c) => (!best || c.getWorldPosition(new Vector3()).distanceTo(tp) < best.getWorldPosition(new Vector3()).distanceTo(tp) ? c : best), null);
    if (f) forward.add(tp.sub(f.getWorldPosition(new Vector3())).setY(0));
  }
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  const height = Math.max(0.5, hp.y / 0.92); // a cabeça fica a ~92% da altura
  return { target: new Vector3(hp.x, hp.y + 0.05 * height, hp.z), forward, height };
}

/** Enquadra o rosto do modelo (achado automaticamente) e tira a foto uma vez. */
function HeadShot({ group, onShot }: { group: React.RefObject<Group>; onShot: (url: string) => void }) {
  const { camera, gl } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 8 && group.current) {
      const face = locateFace(group.current);
      if (face) {
        camera.position.copy(face.target).addScaledVector(face.forward, face.height * 0.37);
        camera.lookAt(face.target);
      } else {
        const box = new Box3().setFromObject(group.current);
        const h = box.max.y - box.min.y;
        if (h > 0.1) {
          const c = box.getCenter(new Vector3());
          const target = new Vector3(c.x, box.max.y - h * 0.075, c.z);
          camera.position.set(target.x, target.y + h * 0.01, target.z + h * 0.42);
          camera.lookAt(target);
        }
      }
    }
    if (frames.current === 14) onShot(gl.domElement.toDataURL("image/png"));
  });
  return null;
}

function StaticFace({ character, size, border }: { character: CharacterId; size: number; border: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <AvatarGlyph color="#888" character={character} size={size} />;
  return (
    <img
      src={`/faces/${character}.png`}
      alt=""
      width={size}
      height={size}
      onError={() => setBad(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, background: "var(--surface-2)" }}
    />
  );
}

function Portrait({ character, url, size, border }: { character: CharacterId; url: string; size: number; border: string }) {
  const key = `${character}|${url}`;
  const [src, setSrc] = useState<string | null>(portraits.get(key) ?? null);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const group = useRef<Group>(null);

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rel: (() => void) | null = null;
    const finish = () => {
      clearTimeout(timer);
      setActive(false);
      rel?.();
      rel = null;
    };
    void acquire().then((release) => {
      rel = release;
      if (cancelled) return finish();
      setActive(true);
      timer = setTimeout(() => {
        finish();
        setFailed(true);
      }, 15000);
    });
    return () => {
      cancelled = true;
      finish();
    };
  }, [src, key]);

  const box: React.CSSProperties = { width: size, height: size, borderRadius: "50%", overflow: "hidden", border, background: "var(--surface-2)" };
  // Falhou ao montar o retrato do modelo: cai na foto padrão do personagem.
  if (failed) return <StaticFace character={character} size={size} border={border} />;
  if (src) return <img src={src} alt="" width={size} height={size} style={{ ...box, objectFit: "cover" }} />;
  return (
    <div style={box} aria-hidden>
      {active && (
        <Canvas dpr={1} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ position: [0, 1.6, 0.8], fov: 28 }}>
          <ambientLight intensity={1.1} />
          <directionalLight position={[2, 3, 4]} intensity={1.8} />
          <Boundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <group ref={group}>
                <GlbModel url={url} animated />
              </group>
              <HeadShot
                group={group}
                onShot={(data) => {
                  portraits.set(key, data);
                  setSrc(data);
                  setActive(false);
                }}
              />
            </Suspense>
          </Boundary>
        </Canvas>
      )}
    </div>
  );
}

/**
 * Foto do rosto do personagem. Se o admin enviou um modelo 3D para ele, o retrato é tirado desse modelo (o que
 * vale é o enviado); senão usa a foto padrão (public/faces) e, faltando o arquivo, o ícone desenhado.
 */
export function CharacterFace({ color, character, size = 64 }: { color: string; character: CharacterId; size?: number }) {
  const [failed, setFailed] = useState(false);
  // O modelo é o mesmo para qualquer equipe.
  const uploaded = modelUrlFor(character);
  const border = `3px solid ${color}`;
  // Qualquer personagem com modelo 3D (enviado ou que já vem no jogo) tem o retrato tirado do próprio modelo: assim a foto
  // sempre acompanha o modelo atual. A foto padrão (public/faces) só vale para os bonecos geométricos.
  if (uploaded) {
    return <Portrait key={`${character}|${uploaded}`} character={character} url={uploaded} size={size} border={border} />;
  }
  if (failed) return <AvatarGlyph color={color} character={character} size={size} />;
  return (
    <img
      src={`/faces/${character}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, background: "var(--surface-2)" }}
    />
  );
}
