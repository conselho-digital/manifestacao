import { useEffect, useState } from "react";
import {
  closeParkScreen,
  expectedPosition,
  parseScreenMedia,
  setLocalVolume,
  setPlayback,
  useLocalVolume,
  useParkScreen,
  useParkScreenOpen,
  usePlayback,
  type ScreenConfig,
} from "../config/parkScreen.js";
import { fetchPlayback, subscribePlayback, syncServerClock } from "../net/screenSync.js";
import { useModal } from "./useModal.js";

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const clock = (sec: number) => {
  const t = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s2 = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s2}` : `${m}:${s2}`;
};

/** Vídeo do outdoor: o vídeo toca NO outdoor do mapa; aqui ficam só o estado e o volume deste aparelho. */
function VideoControls() {
  const playback = usePlayback();
  const volume = useLocalVolume();
  const [, tick] = useState(0);
  useEffect(() => {
    void syncServerClock().then(() => fetchPlayback()).then((pb) => {
      if (pb) setPlayback(pb);
    });
    const off = subscribePlayback(() => {});
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, []);
  const status = !playback || playback.state === "stopped" ? "Parado" : playback.state === "playing" ? "Tocando" : "Pausado";
  const time = playback ? expectedPosition(playback) : 0;
  const [prevVolume, setPrevVolume] = useState(100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
        O vídeo passa no outdoor do parque. Chegue perto e olhe para a tela para assistir.
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--t-body)" }}>
        <strong aria-live="polite">{status}</strong>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-dim)" }}>{playback && playback.state !== "stopped" ? clock(time) : "0:00"}</span>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
        <span style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-dim)" }}>
          <span>Volume (só aqui)</span>
          <span>{volume}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          aria-valuetext={`${volume}%`}
          onChange={(e) => setLocalVolume(Number(e.target.value))}
          style={{ width: "100%", minHeight: 32 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={btn}
          aria-pressed={volume === 0}
          onClick={() => {
            if (volume === 0) setLocalVolume(prevVolume || 100);
            else {
              setPrevVolume(volume);
              setLocalVolume(0);
            }
          }}
        >
          {volume === 0 ? "🔇 Ligar o som" : "🔊 Silenciar"}
        </button>
      </div>
    </div>
  );
}

function Dialog({ cfg }: { cfg: ScreenConfig }) {
  const { url, title } = cfg;
  const ref = useModal<HTMLDivElement>(closeParkScreen);
  const media = parseScreenMedia(url);
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && closeParkScreen()}
      style={{ position: "fixed", inset: 0, zIndex: 30, display: "grid", placeItems: "center", background: "rgba(0,0,0,.72)", padding: 12 }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Outdoor do parque"}
        tabIndex={-1}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 12,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          color: "var(--ink)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <strong style={{ fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>{title || "Outdoor do parque"}</strong>
          <button type="button" onClick={closeParkScreen} style={btn}>
            Fechar
          </button>
        </div>
        {media.kind === "youtube" ? (
          <VideoControls />
        ) : (
          <>
            <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "70dvh", background: "#000", borderRadius: 8, overflow: "hidden" }}>
              <iframe
                title={title || "Outdoor do parque"}
                src={url}
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              />
            </div>
            <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
              Alguns sites não deixam ser abertos aqui dentro. Se a página ficar em branco, abra em outra aba.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={btn}>
                Abrir em outra aba
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Janela do outdoor do parque: toca o vídeo do YouTube ou mostra a página configurada no admin. */
export function ParkScreenModal() {
  const cfg = useParkScreen();
  const open = useParkScreenOpen();
  if (!open || !cfg) return null;
  return <Dialog cfg={cfg} />;
}
