import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeParkScreen,
  currentPlayback,
  embedUrl,
  expectedPosition,
  parseScreenMedia,
  setPlayback,
  useParkScreen,
  useParkScreenOpen,
  usePlayback,
  type ScreenConfig,
} from "../config/parkScreen.js";
import { fetchPlayback, subscribePlayback, syncServerClock } from "../net/screenSync.js";
import { useModal } from "./useModal.js";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

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

function Dialog({ cfg }: { cfg: ScreenConfig }) {
  const { url, title } = cfg;
  const ref = useModal<HTMLDivElement>(closeParkScreen);
  const media = parseScreenMedia(url);
  const playback = usePlayback();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  // O endereço do player fica fixo (se mudasse, o vídeo recarregaria): começa já no estado que o admin deixou.
  const [src] = useState(() => {
    const pb = currentPlayback();
    return embedUrl(media, pb ? { ...cfg, autoplay: pb.state === "playing" } : cfg, true);
  });

  const send = (func: string, args: unknown[] = []) =>
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
  /** Coloca o vídeo onde o admin deixou: tocando (na posição de agora), pausado ou parado. */
  const apply = useCallback(() => {
    const pb = currentPlayback();
    if (!pb || !readyRef.current) return;
    if (pb.state === "stopped") {
      send("seekTo", [0, true]);
      send("pauseVideo");
      return;
    }
    send("seekTo", [expectedPosition(pb), true]);
    send(pb.state === "playing" ? "playVideo" : "pauseVideo");
  }, []);

  // Hora do servidor, estado atual e comandos novos do admin (Realtime) enquanto a janela está aberta.
  useEffect(() => {
    void syncServerClock().then(() => fetchPlayback()).then((pb) => {
      if (pb) setPlayback(pb);
    });
    return subscribePlayback(() => {});
  }, []);
  useEffect(() => {
    if (media.kind !== "youtube") return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== frameRef.current?.contentWindow || typeof e.data !== "string") return;
      try {
        if ((JSON.parse(e.data) as { event?: string }).event === "onReady") {
          readyRef.current = true;
          apply();
        }
      } catch {
        /* mensagem que não é JSON */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [media.kind, apply]);
  useEffect(() => {
    apply();
  }, [playback, apply]);
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
            ref={frameRef}
            title={title || "Outdoor do parque"}
            src={src}
            onLoad={() => {
              frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGIN);
              // Se o "pronto" do player se perder, tenta de novo um pouco depois.
              window.setTimeout(() => {
                readyRef.current = true;
                apply();
              }, 2500);
            }}
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
  return <Dialog cfg={cfg} />;
}
