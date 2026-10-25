import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, CanvasTexture, SRGBColorSpace, Vector3 } from "three";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { clearSolids, setSolids } from "./solids.js";
import {
  currentPlayback,
  embedUrl,
  expectedPosition,
  openParkScreen,
  parseScreenMedia,
  setPlayback,
  thumbnailUrl,
  useParkScreen,
  usePlayback,
  type ScreenConfig,
} from "../config/parkScreen.js";
import { fetchPlayback, subscribePlayback, syncServerClock } from "../net/screenSync.js";

/** Tela do outdoor (m): 16:9, bem acima das árvores (~7,5 m). */
export const SCREEN_W = 24;
export const SCREEN_H = 13.5;
/** Altura da borda de baixo da tela. */
export const SCREEN_BOTTOM = 10;
const LEG_X = SCREEN_W / 2 - 2;
const FRAME = 0.7;
const TEX_W = 1280;
const TEX_H = 720;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Desenha o que aparece no outdoor: miniatura do vídeo (se houver), título e o convite para tocar. */
function draw(ctx: CanvasRenderingContext2D, cfg: ScreenConfig | null, img: HTMLImageElement | null): void {
  const g = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  g.addColorStop(0, "#1a2030");
  g.addColorStop(1, "#3a1d2b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  if (img && img.naturalWidth > 0) {
    const k = Math.max(TEX_W / img.naturalWidth, TEX_H / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (TEX_W - w) / 2, (TEX_H - h) / 2, w, h);
  }
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  if (!cfg) {
    ctx.font = "800 96px system-ui, sans-serif";
    ctx.fillText("OUTDOOR DO PARQUE", TEX_W / 2, TEX_H / 2 - 30);
    ctx.font = "600 44px system-ui, sans-serif";
    ctx.fillText("Em breve", TEX_W / 2, TEX_H / 2 + 60);
    return;
  }
  const video = parseScreenMedia(cfg.url).kind === "youtube";
  // Botão de reproduzir (vídeo) ou convite para abrir (página).
  if (video) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(TEX_W / 2, TEX_H / 2 - 40, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c2263d";
    ctx.beginPath();
    ctx.moveTo(TEX_W / 2 - 38, TEX_H / 2 - 110);
    ctx.lineTo(TEX_W / 2 + 62, TEX_H / 2 - 40);
    ctx.lineTo(TEX_W / 2 - 38, TEX_H / 2 + 30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.font = "800 72px system-ui, sans-serif";
  const title = cfg.title || (video ? "Vídeo do parque" : new URL(cfg.url).hostname);
  const lines = wrapText(ctx, title, TEX_W - 160, 2);
  const startY = video ? TEX_H - 170 : TEX_H / 2 - (lines.length - 1) * 40;
  lines.forEach((l, i) => ctx.fillText(l, TEX_W / 2, startY + i * 84));
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(video ? "Toque para assistir" : "Toque para abrir a página", TEX_W / 2, video ? TEX_H - 50 : startY + lines.length * 84 + 40);
}

const YT_ORIGIN = "https://www.youtube-nocookie.com";
/** Pixels do iframe (16:9); a escala abaixo faz ele cobrir exatamente a tela do outdoor. */
const FRAME_PX_W = 1280;
const FRAME_PX_H = 720;
/** A partir daqui o vídeo some (e o áudio zera); perto, toca com o volume caindo com a distância. */
const VIDEO_RANGE = 150;
const FULL_VOLUME_RANGE = 25;
/** O Html do drei em modo "transform" usa 40 px por unidade do mundo (400 / distanceFactor 10). */
const HTML_PX_PER_UNIT = 40;

/**
 * Vídeo do YouTube tocando NO outdoor (um iframe preso à tela 3D). Segue o que o admin comanda (tocar, pausar, parar,
 * pular — vem do Realtime) e o volume cai com a distância. Só existe perto da tela e de frente para ela.
 */
function OutdoorVideo({ cfg, videoId, cy, x, z }: { cfg: ScreenConfig; videoId: string; cy: number; x: number; z: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const volumeRef = useRef(-1);
  const playback = usePlayback();
  const [src] = useState(() => {
    const pb = currentPlayback();
    return embedUrl({ kind: "youtube", id: videoId }, { ...cfg, controls: false, mute: true, autoplay: pb ? pb.state === "playing" : cfg.autoplay }, true);
  });
  const send = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
  }, []);
  const apply = useCallback(() => {
    const pb = currentPlayback();
    if (!pb || !readyRef.current) return;
    send("seekTo", [pb.state === "stopped" ? 0 : expectedPosition(pb), true]);
    send(pb.state === "playing" ? "playVideo" : "pauseVideo");
  }, [send]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== frameRef.current?.contentWindow || typeof e.data !== "string") return;
      try {
        if ((JSON.parse(e.data) as { event?: string }).event === "onReady") {
          readyRef.current = true;
          volumeRef.current = -1; // o player começa mudo: reaplica o volume
          apply();
        }
      } catch {
        /* mensagem que não é JSON */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [apply]);
  useEffect(() => {
    apply();
  }, [playback, apply]);

  // Volume pela distância (e mudo se o operador marcou "sem som").
  const { camera } = useThree();
  useFrame(() => {
    if (!readyRef.current) return;
    const d = Math.hypot(camera.position.x - x, camera.position.z - z);
    const master = (currentPlayback()?.volume ?? 100) / 100;
    const v = cfg.mute ? 0 : Math.round(100 * master * Math.max(0, Math.min(1, (VIDEO_RANGE - d) / (VIDEO_RANGE - FULL_VOLUME_RANGE))));
    if (Math.abs(v - volumeRef.current) >= 4 || (v === 0) !== (volumeRef.current === 0)) {
      volumeRef.current = v;
      send("setVolume", [v]);
      send(v === 0 ? "mute" : "unMute");
    }
  });
  return (
    <Html
      transform
      position={[0, cy, 0.05]}
      scale={(SCREEN_W / FRAME_PX_W) * HTML_PX_PER_UNIT}
      // "blending": o iframe fica ATRÁS do canvas e a tela vira um buraco nele; o que está na frente da tela (personagem,
      // árvores, prédios) desenha por cima do vídeo. Z negativo = abaixo do canvas.
      occlude="blending"
      zIndexRange={[-1, 0]}
      style={{ pointerEvents: "none" }}
    >
      <iframe
        ref={frameRef}
        title={cfg.title || "Outdoor do parque"}
        src={src}
        onLoad={() => {
          frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGIN);
          window.setTimeout(() => {
            readyRef.current = true;
            volumeRef.current = -1;
            apply();
          }, 2500);
        }}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        style={{ width: FRAME_PX_W, height: FRAME_PX_H, border: 0, background: "#000", display: "block", pointerEvents: "none" }}
      />
    </Html>
  );
}

/** Outdoor gigante do parque (de frente para a avenida, +Z). Tocar na tela abre o vídeo/página (ver ParkScreenModal). */
export function ParkScreen({ x, z }: { x: number; z: number }) {
  const cfg = useParkScreen();
  const playback = usePlayback();
  const [hover, setHover] = useState(false);
  const media = cfg ? parseScreenMedia(cfg.url) : null;
  const videoId = media?.kind === "youtube" ? media.id : null;

  // Relógio do servidor, estado atual e comandos do admin (Realtime) enquanto o outdoor existe no mapa.
  useEffect(() => {
    if (!videoId) return;
    void syncServerClock().then(() => fetchPlayback()).then((pb) => {
      if (pb) setPlayback(pb);
    });
    return subscribePlayback(() => {});
  }, [videoId]);

  // O vídeo só existe perto da tela e de frente para ela (o iframe é pesado e, por trás, apareceria espelhado).
  const [live, setLive] = useState(false);
  useFrame(({ camera }) => {
    const d = Math.hypot(camera.position.x - x, camera.position.z - z);
    const next = d < VIDEO_RANGE && camera.position.z > z + 0.5;
    setLive((p) => (p === next ? p : next));
  });
  const showVideo = Boolean(cfg && videoId && live && (playback ? playback.state !== "stopped" : cfg.autoplay));

  const { canvas, tex } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, tex: t };
  }, []);

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx, cfg, null);
    tex.needsUpdate = true;
    // Miniatura do YouTube (CORS: se o navegador recusar, fica o fundo liso).
    const thumb = cfg ? thumbnailUrl(parseScreenMedia(cfg.url)) : null;
    if (!thumb) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      draw(ctx, cfg, img);
      tex.needsUpdate = true;
    };
    img.src = thumb;
    return () => {
      alive = false;
    };
  }, [cfg, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);

  // Colisão: pernas sólidas para quem anda; a câmera não atravessa a tela nem as pernas.
  useEffect(() => {
    setSolids(
      "park-screen",
      [],
      [-LEG_X, LEG_X].map((dx) => ({ x: x + dx, z, r: 0.9 })),
      [],
      SCREEN_BOTTOM + SCREEN_H,
    );
    const top = SCREEN_BOTTOM + SCREEN_H + FRAME;
    setCameraColliders("park-screen", [], [
      new Box3(new Vector3(x - SCREEN_W / 2 - FRAME, SCREEN_BOTTOM - FRAME, z - 0.5), new Vector3(x + SCREEN_W / 2 + FRAME, top, z + 0.5)),
      ...[-LEG_X, LEG_X].map((dx) => new Box3(new Vector3(x + dx - 0.9, 0, z - 0.9), new Vector3(x + dx + 0.9, SCREEN_BOTTOM, z + 0.9))),
    ]);
    return () => {
      clearSolids("park-screen");
      clearCameraColliders("park-screen");
    };
  }, [x, z]);

  const cy = SCREEN_BOTTOM + SCREEN_H / 2;
  return (
    <group position={[x, 0, z]}>
      {/* Pernas */}
      {[-LEG_X, LEG_X].map((dx) => (
        <mesh key={dx} position={[dx, (SCREEN_BOTTOM - FRAME) / 2, -0.3]} castShadow>
          <boxGeometry args={[1.2, SCREEN_BOTTOM - FRAME, 0.6]} />
          <meshStandardMaterial color={0x3a3f47} />
        </mesh>
      ))}
      {/* Estrutura e moldura */}
      <mesh position={[0, cy, -0.3]} castShadow>
        <boxGeometry args={[SCREEN_W + FRAME * 2, SCREEN_H + FRAME * 2, 0.6]} />
        <meshStandardMaterial color={0x1d2026} />
      </mesh>
      {/* Tela: toque/clique abre o conteúdo */}
      <mesh
        position={[0, cy, 0.02]}
        onClick={(e) => {
          e.stopPropagation();
          // Vídeo toca no próprio outdoor; só páginas da internet abrem numa janela.
          if (!videoId) openParkScreen();
        }}
        onPointerOver={() => {
          if (cfg) {
            setHover(true);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={tex} toneMapped={false} color={hover ? 0xffffff : 0xe6e6e6} />
      </mesh>
      {showVideo && cfg && videoId && <OutdoorVideo cfg={cfg} videoId={videoId} cy={cy} x={x} z={z} />}
      {/* Refletores no topo */}
      {[-8, 0, 8].map((dx) => (
        <mesh key={dx} position={[dx, SCREEN_BOTTOM + SCREEN_H + FRAME + 0.25, 0.4]}>
          <boxGeometry args={[1.4, 0.4, 0.5]} />
          <meshStandardMaterial color={0xfff3c4} emissive={0xfff3c4} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}
