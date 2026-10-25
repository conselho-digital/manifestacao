import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, type Bone, type Group, type Object3D, Vector3 } from "three";
import type { CharacterId, TeamId } from "@manifestacao/shared";
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
function HeadShot({ group, onShot, onEmpty, variant }: { group: React.RefObject<Group>; onShot: (url: string) => void; onEmpty: () => void; variant: "face" | "body" }) {
  const { camera, gl } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 8 && group.current) {
      const face = locateFace(group.current);
      if (face && variant === "body") {
        // Corpo inteiro, de frente: centro do corpo no meio e distância para caber a altura toda.
        const center = new Vector3(face.target.x, face.height * 0.5, face.target.z);
        camera.position.copy(center).addScaledVector(face.forward, face.height * 2.35);
        camera.lookAt(center);
      } else if (face) {
        camera.position.copy(face.target).addScaledVector(face.forward, face.height * 0.37);
        camera.lookAt(face.target);
      } else {
        const box = new Box3().setFromObject(group.current);
        const h = box.max.y - box.min.y;
        if (box.isEmpty()) return onEmpty(); // o modelo não carregou: não guarda uma foto em branco
        if (h > 0.1) {
          const c = box.getCenter(new Vector3());
          if (variant === "body") {
            camera.position.set(c.x, c.y, c.z + h * 2.35);
            camera.lookAt(c);
          } else {
            const target = new Vector3(c.x, box.max.y - h * 0.075, c.z);
            camera.position.set(target.x, target.y + h * 0.01, target.z + h * 0.42);
            camera.lookAt(target);
          }
        }
      }
    }
    if (frames.current === 14) {
      if (group.current && new Box3().setFromObject(group.current).isEmpty()) return onEmpty();
      onShot(gl.domElement.toDataURL("image/png"));
    }
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

function Portrait({ character, url, size, border, variant = "face", height }: { character: CharacterId; url: string; size: number; border: string; variant?: "face" | "body"; height?: number }) {
  const key = `${character}|${url}|${variant}`;
  const hpx = height ?? size;
  const [src, setSrc] = useState<string | null>(portraits.get(key) ?? null);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const group = useRef<Group>(null);
  const finishRef = useRef<() => void>(() => {});

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
    finishRef.current = finish;
    void acquire().then((release) => {
      rel = release;
      if (cancelled) return finish();
      setActive(true);
      timer = setTimeout(() => {
        finish();
        setFailed(true);
      }, 40000);
    });
    return () => {
      cancelled = true;
      finish();
    };
  }, [src, key]);

  const body = variant === "body";
  const box: React.CSSProperties = { width: size, height: hpx, borderRadius: body ? 12 : "50%", overflow: "hidden", border: body ? "none" : border, background: body ? "transparent" : "var(--surface-2)" };
  // Falhou ao montar o retrato do modelo: cai na foto padrão do personagem.
  if (failed) return body ? <AvatarGlyph color="#888" character={character} size={Math.min(size, hpx)} /> : <StaticFace character={character} size={size} border={border} />;
  if (src) return <img src={src} alt="" width={size} height={hpx} style={{ ...box, objectFit: body ? "contain" : "cover" }} />;
  return (
    <div style={box} aria-hidden>
      {active && (
        <Canvas dpr={body ? Math.min(2, window.devicePixelRatio || 1) : 1} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ position: [0, 1.6, 0.8], fov: 28 }}>
          <ambientLight intensity={1.1} />
          <directionalLight position={[2, 3, 4]} intensity={1.8} />
          <Boundary onError={() => { finishRef.current(); setFailed(true); }}>
            <Suspense fallback={null}>
              <group ref={group}>
                <GlbModel url={url} animated />
              </group>
              <HeadShot
                variant={variant}
                onEmpty={() => { finishRef.current(); setFailed(true); }}
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
export function CharacterFace({ color, character, team, size = 64 }: { color: string; character: CharacterId; team?: TeamId; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uploaded = modelUrlFor(character, team);
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

/** Foto de corpo inteiro do personagem (tirada do modelo 3D; sem modelo, a silhueta desenhada). */
export function CharacterBody({ color, character, team, width = 120, height = 190 }: { color: string; character: CharacterId; team?: TeamId; width?: number; height?: number }) {
  const url = modelUrlFor(character, team);
  if (url) return <Portrait key={`${character}|${url}|body`} character={character} url={url} size={width} height={height} border="none" variant="body" />;
  return (
    <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <AvatarGlyph color={color} character={character} size={Math.min(width, height)} />
    </div>
  );
}
