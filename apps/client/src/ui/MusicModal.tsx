import { useState } from "react";
import { MUSIC_RADIUS, type VehicleMusic } from "@manifestacao/shared";
import { parseScreenMedia } from "../config/parkScreen.js";
import { useModal } from "./useModal.js";

/** Intervalo mínimo entre trocas de música (anti-abuso: cada troca faz todo mundo perto recarregar o player). */
export const MUSIC_COOLDOWN_MS = 8000;

/**
 * Música do veículo de som: o motorista cola um link do YouTube e toca o que quiser; só quem está a até
 * MUSIC_RADIUS de distância ouve (volume cai com a distância). Fica ligada enquanto ele estiver no veículo.
 */
export function MusicModal({
  current,
  onPlay,
  onStop,
  onClose,
}: {
  current: VehicleMusic | null;
  onPlay: (id: string) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const dialogRef = useModal<HTMLDivElement>(onClose);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(0);

  const play = (e: React.FormEvent) => {
    e.preventDefault();
    const media = parseScreenMedia(url.trim());
    if (media.kind !== "youtube") {
      setError("Cole um link do YouTube (youtube.com/watch…, youtu.be/…, shorts ou live).");
      return;
    }
    const wait = lastAt + MUSIC_COOLDOWN_MS - Date.now();
    if (wait > 0) {
      setError(`Espere ${Math.ceil(wait / 1000)} s para trocar de música.`);
      return;
    }
    setError(null);
    setLastAt(Date.now());
    onPlay(media.id);
    setUrl("");
  };

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 20, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-title"
        tabIndex={-1}
        style={{
          outline: "none",
          width: "min(440px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="music-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, textTransform: "uppercase" }}>
            Música do veículo
          </h2>
          <button type="button" onClick={onClose} style={{ minHeight: 40, padding: "0 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}>
            Fechar
          </button>
        </div>
        <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
          Cole o link de um vídeo do YouTube. Só quem estiver até {MUSIC_RADIUS} m do seu veículo ouve, mais baixo quanto mais longe. A música para quando você desce do veículo.
        </p>
        <form onSubmit={play} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            inputMode="url"
            autoComplete="off"
            maxLength={200}
            aria-label="Link do YouTube"
            style={{ minHeight: 44, padding: "10px 12px", fontSize: 16, borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          />
          {error && (
            <div role="alert" style={{ fontSize: "var(--t-ui)", color: "var(--danger)" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={!url.trim()} style={{ flex: 1, minHeight: 46, borderRadius: "var(--r-md)", border: "none", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, cursor: "pointer", opacity: url.trim() ? 1 : 0.5 }}>
              Tocar
            </button>
            <button type="button" onClick={onStop} disabled={!current} style={{ minHeight: 46, padding: "0 16px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", fontWeight: 700, cursor: "pointer", opacity: current ? 1 : 0.5 }}>
              Parar
            </button>
          </div>
        </form>
        <div style={{ fontSize: "var(--t-ui)", color: current ? "var(--accent)" : "var(--ink-dim)" }}>{current ? "Tocando agora." : "Nada tocando."}</div>
      </div>
    </div>
  );
}
