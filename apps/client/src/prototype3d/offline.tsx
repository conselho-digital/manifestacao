import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Prototype3D } from "./index.js";
import { FILES, setAssetBase } from "./config.js";

/**
 * Versão single-player OFFLINE do protótipo: sem login, sem Supabase, sem multiplayer e sem nenhuma chamada de rede
 * (só carrega os .glb da pasta local `public/offline/`, ignorada pelo git).
 * Abra `/offline.html` com `pnpm --filter @manifestacao/client dev:offline`.
 */
setAssetBase("/offline");

function Hud() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);
  const box: React.CSSProperties = { position: "fixed", color: "#f5f6f7", textShadow: "0 1px 3px #000", pointerEvents: "none", fontSize: 14, lineHeight: 1.5 };
  return (
    <>
      <div style={{ ...box, top: 12, left: 14 }}>
        <strong>Protótipo 3D — offline</strong>
        <div style={{ opacity: 0.8 }}>
          Arquivos em <code>public/offline/</code>: {FILES.city} · {FILES.character}
        </div>
      </div>
      {!locked && (
        <div style={{ ...box, inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", background: "rgba(0,0,0,0.35)" }}>
          <div style={{ fontSize: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Clique para jogar</div>
            WASD anda · Shift corre · Espaço pula<br />
            Mouse olha · botão direito mira · clique esquerdo ataca · Esc solta o mouse
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ width: "100vw", height: "100vh" }}>
      <Prototype3D />
    </div>
    <Hud />
  </StrictMode>,
);
