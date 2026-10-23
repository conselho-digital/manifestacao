import { closeParkScreen, embedUrl, parseScreenMedia, useParkScreen, useParkScreenOpen } from "../config/parkScreen.js";
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

function Dialog({ url, title }: { url: string; title: string }) {
  const ref = useModal<HTMLDivElement>(closeParkScreen);
  const media = parseScreenMedia(url);
  const src = embedUrl(media, url);
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
        <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "70dvh", background: "#000", borderRadius: 8, overflow: "hidden" }}>
          <iframe
            title={title || "Outdoor do parque"}
            src={src}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
        {media.kind === "page" && (
          <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
            Alguns sites não deixam ser abertos aqui dentro. Se a página ficar em branco, abra em outra aba.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={btn}>
            Abrir em outra aba
          </a>
        </div>
      </div>
    </div>
  );
}

/** Janela do outdoor do parque: toca o vídeo do YouTube ou mostra a página configurada no admin. */
export function ParkScreenModal() {
  const cfg = useParkScreen();
  const open = useParkScreenOpen();
  if (!open || !cfg) return null;
  return <Dialog url={cfg.url} title={cfg.title} />;
}
