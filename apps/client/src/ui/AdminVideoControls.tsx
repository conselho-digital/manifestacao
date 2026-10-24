import { useEffect, useRef, useState } from "react";

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

interface Info {
  time: number;
  duration: number;
  /** -1 não iniciado, 0 terminou, 1 tocando, 2 pausado, 3 carregando, 5 pronto. */
  state: number;
  volume: number;
  muted: boolean;
}

/**
 * Prévia do vídeo do outdoor com os comandos do player (tocar, pausar, parar, linha do tempo, volume), falando com o
 * player do YouTube por postMessage (enablejsapi). É a prévia do admin: o que o público vê continua sendo definido pelas
 * opções salvas abaixo (tocar automaticamente, controles, mudo, repetir).
 */
export function AdminVideoControls({ videoId }: { videoId: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [info, setInfo] = useState<Info>({ time: 0, duration: 0, state: -1, volume: 100, muted: false });
  const [dragging, setDragging] = useState<number | null>(null);

  const send = (func: string, args: unknown[] = []) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);

  const listen = () => ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGIN);

  useEffect(() => {
    setInfo({ time: 0, duration: 0, state: -1, volume: 100, muted: false });
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== ref.current?.contentWindow || typeof e.data !== "string") return;
      let data: { event?: string; info?: Record<string, unknown> };
      try {
        data = JSON.parse(e.data) as typeof data;
      } catch {
        return;
      }
      if (data.event === "onReady") listen();
      const i = data.info;
      if (data.event === "infoDelivery" && i) {
        setInfo((p) => ({
          time: typeof i.currentTime === "number" ? i.currentTime : p.time,
          duration: typeof i.duration === "number" && i.duration > 0 ? i.duration : p.duration,
          state: typeof i.playerState === "number" ? i.playerState : p.state,
          volume: typeof i.volume === "number" ? i.volume : p.volume,
          muted: typeof i.muted === "boolean" ? i.muted : p.muted,
        }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId]);

  const enabled = Boolean(videoId);
  const playing = info.state === 1 || info.state === 3;
  const shown = dragging ?? info.time;
  const stop = () => {
    send("pauseVideo");
    send("seekTo", [0, true]);
    setInfo((p) => ({ ...p, time: 0, state: 5 }));
  };

  return (
    <section aria-label="Controles do player" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 420, aspectRatio: "16 / 9", background: "#000", borderRadius: 8, overflow: "hidden" }}>
        {videoId ? (
          <iframe
            key={videoId}
            ref={ref}
            title="Prévia do vídeo do outdoor"
            src={`${YT_ORIGIN}/embed/${videoId}?enablejsapi=1&controls=0&rel=0&playsinline=1&modestbranding=1&disablekb=1&origin=${encodeURIComponent(window.location.origin)}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            onLoad={listen}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        ) : (
          <p style={{ margin: 0, padding: 12, color: "#c9ced4", fontSize: "var(--t-ui)" }}>Cole o link do YouTube no campo abaixo para ver a prévia e usar os comandos.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!enabled || playing} onClick={() => send("playVideo")} style={{ ...btn, opacity: !enabled || playing ? 0.5 : 1 }} aria-label="Tocar">
          ▶ Tocar
        </button>
        <button type="button" disabled={!enabled || !playing} onClick={() => send("pauseVideo")} style={{ ...btn, opacity: !enabled || !playing ? 0.5 : 1 }} aria-label="Pausar">
          ⏸ Pausar
        </button>
        <button type="button" disabled={!enabled} onClick={stop} style={{ ...btn, opacity: enabled ? 1 : 0.5 }} aria-label="Parar">
          ■ Parar
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => send(info.muted ? "unMute" : "mute")}
          style={{ ...btn, opacity: enabled ? 1 : 0.5 }}
          aria-pressed={info.muted}
          aria-label={info.muted ? "Ligar o som" : "Silenciar"}
        >
          {info.muted ? "🔇 Mudo" : "🔊 Som"}
        </button>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
        <span style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-dim)" }}>
          <span>Linha do tempo</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {clock(shown)} / {clock(info.duration)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(info.duration))}
          step={1}
          value={Math.min(shown, Math.max(1, info.duration))}
          disabled={!enabled || info.duration <= 0}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging !== null) send("seekTo", [dragging, true]);
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging !== null) send("seekTo", [dragging, true]);
            setDragging(null);
          }}
          style={{ width: "100%", minHeight: 32 }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
        <span style={{ color: "var(--ink-dim)" }}>Volume: {Math.round(info.volume)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(info.volume)}
          disabled={!enabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            setInfo((p) => ({ ...p, volume: v }));
            send("setVolume", [v]);
          }}
          style={{ width: "100%", minHeight: 32 }}
        />
      </label>
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>Estes comandos controlam a prévia aqui no painel. Para o público valem as opções salvas mais abaixo.</p>
    </section>
  );
}
