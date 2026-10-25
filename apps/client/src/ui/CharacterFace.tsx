import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, Vector3 } from "three";
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

/** Enquadra a cabeça do modelo (topo ~13% da altura) e tira a foto uma vez. */
function HeadShot({ group, onShot }: { group: React.RefObject<Group>; onShot: (url: string) => void }) {
  const { camera, gl } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 8 && group.current) {
      const box = new Box3().setFromObject(group.current);
      const h = box.max.y - box.min.y;
      if (h > 0.1) {
        const c = box.getCenter(new Vector3());
        const target = new Vector3(c.x, box.max.y - h * 0.075, c.z);
        camera.position.set(target.x, target.y + h * 0.01, target.z + h * 0.42);
        camera.lookAt(target);
      }
    }
    if (frames.current === 14) onShot(gl.domElement.toDataURL("image/png"));
  });
  return null;
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
  if (failed) return <AvatarGlyph color="#888" character={character} size={size} />;
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
export function CharacterFace({ color, character, team, size = 64 }: { color: string; character: CharacterId; team?: TeamId; size?: number }) {
  const [failed, setFailed] = useState(false);
  // Vale o modelo enviado para este personagem NA equipe escolhida (senão o geral do personagem).
  const uploaded = modelUrlFor(character, team);
  const border = `3px solid ${color}`;
  if (uploaded && !uploaded.startsWith("/models/")) {
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
