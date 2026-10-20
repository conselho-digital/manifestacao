import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import {
  TEAMS,
  TEAM_IDS,
  flagColor,
  isCharacterId,
  isFlagId,
  isVehicleId,
  type FlagId,
  type VehicleId,
} from "@manifestacao/shared";
import { Flag3D, GlbModel, ProceduralVehicle } from "../game/props3d.js";
import { flagModelUrl, modelUrlFor, sprayModelUrl, vehicleModelUrl } from "../game/models.js";
import { sprayOptionById } from "../config/sprays.js";

const SIZE = 64;

// Só um Canvas WebGL por vez (os navegadores limitam contextos simultâneos e
// o jogo já usa um): cada miniatura espera a vez, renderiza UMA vez, vira
// imagem estática (PNG) e libera o contexto.
let queue: Promise<void> = Promise.resolve();
function acquire(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const turn = queue.then(() => release);
  queue = queue.then(() => mine);
  return turn;
}

const cache = new Map<string, string>();

/** Descarta as fotos prontas (após o admin mudar modelos/produtos). */
export function clearProductThumbs(): void {
  cache.clear();
}

/** Conteúdo 3D do produto, ou null se o item não tem objeto (ex.: passe). */
function ProductModel({ itemId }: { itemId: string }) {
  const [kind, slug] = itemId.split(":");
  if (kind === "vehicle" && isVehicleId(slug) && slug !== "nenhum") {
    const url = vehicleModelUrl(slug as VehicleId);
    return url ? <GlbModel url={url} /> : <ProceduralVehicle vehicle={slug as VehicleId} />;
  }
  if (kind === "character" && isCharacterId(slug)) {
    const url = modelUrlFor(slug);
    if (url) return <GlbModel url={url} />;
    const color = TEAMS[TEAM_IDS[0]!].color;
    return (
      <group>
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.35, 0.8, 4, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.28, 16, 16]} />
          <meshStandardMaterial color={0xf2d2b6} />
        </mesh>
      </group>
    );
  }
  if (kind === "spray" && slug) {
    const url = sprayModelUrl(slug);
    if (url) return <GlbModel url={url} />;
    // Sem modelo: uma bola da cor do spray (ou da equipe, se a opção não tem cor).
    const color = sprayOptionById(slug).color ?? TEAMS[TEAM_IDS[0]!].color;
    return (
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 24, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  if (kind === "flag" && isFlagId(slug) && slug !== "nenhuma") {
    const url = flagModelUrl(slug as FlagId);
    if (url) return <GlbModel url={url} />;
    return <Flag3D color={flagColor(slug as FlagId, TEAMS[TEAM_IDS[0]!].color)} />;
  }
  return null;
}

/** Espera alguns frames (o Bounds enquadra no 1º) e tira a foto do canvas. */
function Snapshot({ onShot }: { onShot: (dataUrl: string) => void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 10) onShot(gl.domElement.toDataURL("image/png"));
  });
  return null;
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Quadradinho com a imagem 3D do produto, ao lado do nome. Usado SÓ na loja —
 * no mapa não há foto de produto. Itens sem objeto (passe) não mostram nada.
 */
export function ProductThumb({ itemId }: { itemId: string }) {
  const [kind] = itemId.split(":");
  const hasObject = kind === "vehicle" || kind === "character" || kind === "flag" || kind === "spray";
  const [src, setSrc] = useState<string | null>(cache.get(itemId) ?? null);
  const [active, setActive] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const finishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!hasObject || src) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void acquire().then((release) => {
      releaseRef.current = release;
      if (cancelled) return finish();
      setActive(true);
      // Se o modelo não carregar, não trava a fila.
      timer = setTimeout(finish, 15000);
    });
    finishRef.current = finish;
    function finish() {
      clearTimeout(timer);
      setActive(false);
      releaseRef.current?.();
      releaseRef.current = null;
    }
    return () => {
      cancelled = true;
      finish();
    };
  }, [hasObject, src, itemId]);

  if (!hasObject) return null;

  const box: React.CSSProperties = {
    width: SIZE,
    height: SIZE,
    flexShrink: 0,
    borderRadius: "var(--r-sm)",
    background: "var(--surface)",
    overflow: "hidden",
  };

  if (src) return <img src={src} alt="" width={SIZE} height={SIZE} style={box} />;
  return (
    <div style={box} aria-hidden>
      {active && (
        <Canvas
          frameloop="always"
          dpr={1}
          gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
          camera={{ position: [3, 2.2, 4], fov: 40 }}
        >
          <ambientLight intensity={0.9} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} />
          <Boundary onError={() => finishRef.current?.()}>
            <Suspense fallback={null}>
              <Bounds fit clip observe margin={1.25} maxDuration={0.001}>
                <ProductModel itemId={itemId} />
              </Bounds>
              <Snapshot
                onShot={(url) => {
                  cache.set(itemId, url);
                  setSrc(url);
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
