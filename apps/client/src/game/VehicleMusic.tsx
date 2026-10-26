import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { MUSIC_RADIUS, VEHICLES, type VehicleMusic as Music, type VehicleId } from "@manifestacao/shared";
import { currentLocalVolume, serverNow } from "../config/parkScreen.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";
import type { PlayerTransform } from "./Player.js";

const YT_ORIGIN = "https://www.youtube-nocookie.com";
/** Quantos veículos de som tocam ao mesmo tempo para quem escuta (o mais próximo); mais que isso vira bagunça e peso. */
const MAX_AT_ONCE = 1;
const TICK_MS = 400;

interface Source {
  key: string;
  music: Music;
  /** Distância até quem escuta (u); 0 = o próprio veículo. */
  dist: number;
}

/** Volume (0–100) pela distância: cheio ao lado do veículo, some em MUSIC_RADIUS. */
export function musicVolume(dist: number): number {
  if (dist >= MUSIC_RADIUS) return 0;
  const k = 1 - dist / MUSIC_RADIUS;
  return Math.round(100 * (currentLocalVolume() / 100) * Math.pow(k, 1.3));
}

/**
 * Toca, escondido, o vídeo do YouTube de cada veículo de som por perto (o do próprio jogador e os dos outros), com o
 * volume caindo com a distância — só quem está em volta ouve. Cada aparelho carrega o player por conta própria e entra
 * no mesmo ponto da música pelo horário de início (relógio do servidor). Sem imagem: só áudio.
 */
export function VehicleMusicPlayers({
  playersRef,
  posRef,
  selfMusic,
  selfVehicle,
}: {
  playersRef: MutableRefObject<Map<string, RemotePlayer>>;
  posRef: MutableRefObject<PlayerTransform>;
  selfMusic: Music | null;
  selfVehicle: VehicleId;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const distRef = useRef(new Map<string, number>());
  const selfRef = useRef({ selfMusic, selfVehicle });
  selfRef.current = { selfMusic, selfVehicle };

  useEffect(() => {
    const tick = () => {
      const me = posRef.current;
      const found: Source[] = [];
      const { selfMusic: sm, selfVehicle: sv } = selfRef.current;
      if (sm && VEHICLES[sv]?.playsMusic) found.push({ key: "self", music: sm, dist: 0 });
      for (const [id, p] of playersRef.current) {
        if (!p.music || !VEHICLES[p.vehicle]?.playsMusic) continue;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < MUSIC_RADIUS) found.push({ key: id, music: p.music, dist: d });
      }
      found.sort((a, b) => a.dist - b.dist);
      const top = found.slice(0, MAX_AT_ONCE);
      distRef.current = new Map(top.map((s) => [s.key, s.dist]));
      setSources((prev) => {
        const same = prev.length === top.length && prev.every((s, i) => s.key === top[i]!.key && s.music.id === top[i]!.music.id && s.music.t === top[i]!.music.t);
        return same ? prev : top;
      });
    };
    tick();
    const t = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(t);
  }, [playersRef, posRef]);

  return (
    <>
      {sources.map((s) => (
        <YoutubeAudio key={`${s.key}:${s.music.id}:${s.music.t}`} music={s.music} sourceKey={s.key} distRef={distRef} />
      ))}
    </>
  );
}

/** Player do YouTube escondido (1 px, sem eventos): começa no ponto certo e acompanha o volume pela distância. */
function YoutubeAudio({ music, sourceKey, distRef }: { music: Music; sourceKey: string; distRef: MutableRefObject<Map<string, number>> }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const lastVol = useRef(-1);
  const send = (func: string, args: unknown[] = []) => ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
  const src = `${YT_ORIGIN}/embed/${music.id}?enablejsapi=1&autoplay=1&controls=0&loop=1&playlist=${music.id}&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`;

  useEffect(() => {
    let alive = true;
    const start = window.setTimeout(() => {
      if (!alive) return;
      const offset = Math.max(0, (serverNow() - music.t) / 1000);
      send("seekTo", [offset, true]);
      send("playVideo");
    }, 1200);
    const vol = window.setInterval(() => {
      const d = distRef.current.get(sourceKey);
      const v = d === undefined ? 0 : musicVolume(d);
      if (Math.abs(v - lastVol.current) >= 3 || (v === 0) !== (lastVol.current === 0)) {
        lastVol.current = v;
        send("setVolume", [v]);
        send(v === 0 ? "mute" : "unMute");
      }
    }, TICK_MS);
    return () => {
      alive = false;
      window.clearTimeout(start);
      window.clearInterval(vol);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music.id, music.t, sourceKey]);

  return (
    <iframe
      ref={ref}
      title="Música do veículo de som"
      src={src}
      allow="autoplay; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
      aria-hidden
      style={{ position: "fixed", left: 0, bottom: 0, width: 2, height: 2, opacity: 0.01, border: 0, pointerEvents: "none", zIndex: -1 }}
    />
  );
}
