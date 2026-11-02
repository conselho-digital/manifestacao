import { useEffect, useMemo, useRef } from "react";
import { TEAMS, hexColor, isTeamId, type TeamId } from "@manifestacao/shared";
import type { CombatStat, FeedEntry, RemotePlayer } from "../net/useAvenueRealtime.js";
import { ARENA_BLOCKS, ARENA_PILLARS, ARENA_RADIUS, blockCorners } from "../game/arena.js";

/** Metros mostrados do centro do minimapa até a borda. */
const RADIUS_M = 34;

/** Altura total ocupada pelo bloco do canto superior esquerdo (minimapa + legenda): o placar/chat descem esse tanto. */
export function arenaHudTopOffset(size: number): number {
  return size + 84;
}

interface Props {
  size: number;
  playersRef: { current: ReadonlyMap<string, RemotePlayer> };
  posRef: { current: { x: number; z: number; rotationY: number } };
  yawRef: { current: number };
  selfId: string;
  selfTeam: TeamId;
  selfNickname: string;
  /** Vida do jogador local, 0..1. */
  hp: number;
  feed: FeedEntry[];
  stats: Record<string, CombatStat>;
  playerCount: number;
}

const teamHex = (t: unknown) => (isTeamId(t) ? hexColor(TEAMS[t].color) : "#999");

/** Interface da arena PvP: minimapa girando com a câmera, vida, jogadores online, feed de quedas e placar de derrubadas. */
export function ArenaHud({ size, playersRef, posRef, yawRef, selfId, selfTeam, selfNickname, hp, feed, stats, playerCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Obstáculos fixos do layout, em metros (caixas e carros como retângulos; pilares como círculos).
  const shapes = useMemo(
    () => ({
      // Cantos de cada bloco já no mundo (os carros são caixas alinhadas aos eixos).
      polys: ARENA_BLOCKS.map(blockCorners),
      circles: ARENA_PILLARS,
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const half = size / 2;
    const scale = half / RADIUS_M;
    const draw = () => {
      const me = posRef.current;
      const yaw = yawRef.current;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      // Mundo -> minimapa: "pra frente da câmera" é para cima; direita da câmera = (-cos, sin).
      const px = (x: number, z: number): [number, number] => {
        const dx = x - me.x;
        const dz = z - me.z;
        return [half + (dx * -cos + dz * sin) * scale, half - (dx * sin + dz * cos) * scale];
      };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, half - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#1b1f25";
      ctx.fillRect(0, 0, size, size);

      // Areia da arena: círculo de raio ARENA_RADIUS, com a borda amarela.
      const [ox, oy] = px(0, 0);
      ctx.beginPath();
      ctx.arc(ox, oy, ARENA_RADIUS * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#6a5c44";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffd12e";
      ctx.stroke();

      ctx.fillStyle = "#c9bba0";
      for (const poly of shapes.polys) {
        ctx.beginPath();
        poly.forEach(([wx, wz], i) => {
          const [x, y] = px(wx, wz);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
      }
      for (const c of shapes.circles) {
        const [x, y] = px(c.x, c.z);
        ctx.beginPath();
        ctx.arc(x, y, c.r * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outros jogadores: ponto na cor do time (os fora do raio ficam presos na borda).
      for (const p of playersRef.current.values()) {
        if (p.x === 0 && p.z === 0) continue;
        let [x, y] = px(p.x, p.z);
        const dx = x - half;
        const dy = y - half;
        const d = Math.hypot(dx, dy);
        const edge = half - 6;
        if (d > edge) {
          x = half + (dx / d) * edge;
          y = half + (dy / d) * edge;
        }
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = teamHex(p.team);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#0008";
        ctx.stroke();
      }
      ctx.restore();

      // Eu: seta no centro, olhando para a direção do personagem relativa à câmera.
      const rel = me.rotationY - yaw;
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(rel);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
    };
    draw();
    const t = window.setInterval(draw, 100);
    return () => window.clearInterval(t);
  }, [size, playersRef, posRef, yawRef, shapes]);

  const board = useMemo(
    () => Object.entries(stats).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 4),
    [stats],
  );
  const hpColor = hp > 0.6 ? "#2ecc71" : hp > 0.3 ? "#f1c40f" : "#e74c3c";
  const shadow = "0 1px 2px #000";

  return (
    <>
      {/* Canto superior esquerdo: minimapa, vida, mapa e jogadores. */}
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: "calc(env(safe-area-inset-left, 0px) + 10px)",
          width: size,
          zIndex: 6,
          pointerEvents: "none",
          userSelect: "none",
          textShadow: shadow,
        }}
      >
        <canvas ref={canvasRef} style={{ width: size, height: size, borderRadius: "50%", border: "3px solid var(--ink)", boxSizing: "border-box", display: "block" }} />
        <div
          role="progressbar"
          aria-label="Vida"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hp * 100)}
          style={{ marginTop: 6, height: 10, borderRadius: 3, background: "var(--scrim)", overflow: "hidden", border: "1px solid var(--line)" }}
        >
          <div style={{ width: `${Math.round(hp * 100)}%`, height: "100%", background: hpColor, transition: "width .2s" }} />
        </div>
        <div style={{ marginTop: 4, fontSize: "var(--t-ui)", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.25, whiteSpace: "nowrap" }}>
          <div style={{ color: teamHex(selfTeam) }}>{selfNickname}</div>
          <div>Arena PvP</div>
          <div style={{ color: "var(--ink-dim)" }}>Jogadores: {playerCount}</div>
        </div>
      </div>

      {/* Canto inferior direito: quedas recentes e placar de derrubadas / quedas. */}
      <div
        style={{
          position: "fixed",
          right: "calc(env(safe-area-inset-right, 0px) + 10px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
          maxWidth: "min(320px, 55vw)",
          zIndex: 6,
          pointerEvents: "none",
          userSelect: "none",
          textAlign: "right",
          fontSize: "var(--t-ui)",
          fontWeight: 800,
          lineHeight: 1.45,
          textShadow: shadow,
        }}
        aria-live="polite"
      >
        {feed.map((f) => (
          <div key={f.key}>
            <span style={{ color: teamHex(f.killerTeam) }}>{f.killer}</span> derrubou <span style={{ color: teamHex(f.victimTeam) }}>{f.victim}</span>
          </div>
        ))}
        {board.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {board.map((b) => (
              <div key={b.id} style={{ outline: b.id === selfId ? "none" : undefined }}>
                <span style={{ color: teamHex(b.team) }}>{b.nickname}</span>: {b.kills} derrubadas / {b.deaths} quedas
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
