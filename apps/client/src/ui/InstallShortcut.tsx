import { useState } from "react";
import { isIos, isMobileDevice, promptInstall, useInstallState } from "./installPrompt.js";

/** Botão da página inicial: põe um atalho do jogo na tela do celular (aviso nativo, ou passo a passo quando não há). */
export function InstallShortcut() {
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  if (state === "installed" || !isMobileDevice()) return null;

  const onClick = () => {
    if (state === "native") void promptInstall();
    else setHelp((h) => !h);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={state === "manual" ? help : undefined}
        style={{
          minHeight: 48,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: "var(--r-md)",
          border: "1px solid var(--accent)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "var(--t-body)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Instalar atalho no celular
      </button>
      {state === "manual" && help && (
        <p style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--ink)", fontSize: "var(--t-ui)" }}>
          {isIos() ? (
            <>No iPhone: toque em <strong>Compartilhar</strong> (o quadrado com a seta) e depois em <strong>Adicionar à Tela de Início</strong>.</>
          ) : (
            <>Abra o menu do navegador (<strong>⋮</strong>) e toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</>
          )}
        </p>
      )}
    </section>
  );
}
