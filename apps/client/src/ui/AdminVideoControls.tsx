import { useEffect, useRef, useState } from "react";
import { publishPlayback } from "../config/adminApi.js";
import { expectedPosition, serverNow, setPlayback, usePlayback, type PlaybackState } from "../config/parkScreen.js";
import { fetchPlayback, subscribePlayback, syncServerClock } from "../net/screenSync.js";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

const btn: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  cursor: "pointer",
};

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/**
 * Controle remoto do vídeo do outdoor: o vídeo toca NO outdoor do mapa (game/ParkScreen.tsx) e aqui só ficam os comandos.
 * Tocar, pausar, parar e pular viram o estado compartilhado (game_config.screen_playback) que todos os jogadores seguem.
 * Um player invisível, mudo e parado serve só para descobrir a duração do vídeo.
 */
export function AdminVideoControls({ videoId, defaultAutoplay = false, live = false }: { videoId: string | null; defaultAutoplay?: boolean; live?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const playback = usePlayback();
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    void syncServerClock().then(() => fetchPlayback()).then((pb) => {
      if (pb) setPlayback(pb);
    });
    return subscribePlayback(() => {});
  }, []);
  // Relógio da linha do tempo: o tempo vem do estado compartilhado, não de um player local.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const volume = playback?.volume ?? 100;
  const [volDrag, setVolDrag] = useState<number | null>(null);
  const publish = (state: PlaybackState, position: number, vol: number = volume, at?: number) => {
    setPubError(null);
    publishPlayback(state, position, vol, at)
      .then(() => setPlayback({ state, position, at: at ?? serverNow(), volume: vol }))
      .catch((e: unknown) => setPubError(e instanceof Error ? e.message : "Não consegui avisar os jogadores."));
  };

  const listen = () => ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGIN);
  useEffect(() => {
    setDuration(0);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== ref.current?.contentWindow || typeof e.data !== "string") return;
      let data: { event?: string; info?: Record<string, unknown> };
      try {
        data = JSON.parse(e.data) as typeof data;
      } catch {
        return;
      }
      if (data.event === "onReady") listen();
      const d = data.info?.duration;
      if (data.event === "infoDelivery" && typeof d === "number" && d > 0) setDuration(d);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId]);

  const enabled = Boolean(videoId);
  const current = playback ? expectedPosition(playback) : 0;
  const time = duration > 0 ? Math.min(current, duration) : current;
  const playing = playback?.state === "playing";
  const shown = dragging ?? time;
  const status = !playback || playback.state === "stopped" ? "Parado" : playing ? "Tocando no outdoor" : "Pausado";

  return (
    <section aria-label="Controles do outdoor" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {videoId && (
        // Invisível: não toca nem faz barulho (autoplay desligado, mudo); só informa a duração.
        <iframe
          key={videoId}
          ref={ref}
          title="Duração do vídeo"
          aria-hidden="true"
          tabIndex={-1}
          src={`${YT_ORIGIN}/embed/${videoId}?enablejsapi=1&controls=0&autoplay=0&mute=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin"
          onLoad={listen}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0 }}
        />
      )}
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
        {enabled ? (
          <>
            O vídeo toca no outdoor do parque, não aqui. Estado: <strong style={{ color: "var(--ink)" }}>{status}</strong>.
          </>
        ) : (
          "Cole o link do YouTube no campo abaixo, salve e use os comandos."
        )}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!enabled || playing} onClick={() => publish("playing", time)} style={{ ...btn, opacity: !enabled || playing ? 0.5 : 1 }} aria-label="Tocar">
          ▶ Tocar
        </button>
        <button type="button" disabled={!enabled || !playing} onClick={() => publish("paused", time)} style={{ ...btn, opacity: !enabled || !playing ? 0.5 : 1 }} aria-label="Pausar">
          ⏸ Pausar
        </button>
        <button type="button" disabled={!enabled} onClick={() => publish("stopped", 0)} style={{ ...btn, opacity: enabled ? 1 : 0.5 }} aria-label="Parar">
          ■ Parar
        </button>
      </div>

      {live ? (
        <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
          <strong style={{ color: "var(--danger)" }}>● AO VIVO</strong> — transmissão sem linha do tempo: o jogo toca no ponto atual da live. Tocar e pausar
          valem para todos; ao tocar de novo, entra direto no ao vivo.
        </p>
      ) : duration <= 0 && enabled ? (
        <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
          Linha do tempo indisponível (o YouTube não informou a duração). Se este link é uma live, marque "É uma transmissão ao vivo" abaixo e salve.
        </p>
      ) : (
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
        <span style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-dim)" }}>
          <span>Linha do tempo</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {clock(shown)} / {clock(duration)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.min(shown, Math.max(1, duration))}
          disabled={!enabled || duration <= 0}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging !== null) publish(playing ? "playing" : "paused", dragging);
            setDragging(null);
          }}
          onPointerCancel={() => setDragging(null)}
          onBlur={() => setDragging(null)}
          onKeyUp={() => {
            if (dragging !== null) publish(playing ? "playing" : "paused", dragging);
            setDragging(null);
          }}
          style={{ width: "100%", minHeight: 32 }}
        />
      </label>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
        <span style={{ color: "var(--ink-dim)" }}>Volume do outdoor: {Math.round(volDrag ?? volume)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volDrag ?? volume)}
          disabled={!enabled}
          onChange={(e) => setVolDrag(Number(e.target.value))}
          onPointerUp={() => {
            if (volDrag !== null) {
              // Só o volume muda: repete posição e hora do último comando, para ninguém dar seek.
              if (playback) publish(playback.state, playback.position, volDrag, playback.at);
              else publish(defaultAutoplay ? "playing" : "stopped", 0, volDrag);
            }
            setVolDrag(null);
          }}
          onKeyUp={() => {
            if (volDrag !== null) {
              // Só o volume muda: repete posição e hora do último comando, para ninguém dar seek.
              if (playback) publish(playback.state, playback.position, volDrag, playback.at);
              else publish(defaultAutoplay ? "playing" : "stopped", 0, volDrag);
            }
            setVolDrag(null);
          }}
          style={{ width: "100%", minHeight: 32 }}
        />
      </label>
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
        Os comandos valem para o vídeo salvo. Quem está perto do outdoor vê e ouve na hora; o volume cai com a distância.
      </p>
      {pubError && (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          {pubError}
        </p>
      )}
    </section>
  );
}
