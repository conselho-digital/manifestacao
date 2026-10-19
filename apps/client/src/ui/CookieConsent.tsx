import { useState } from "react";
import { hasAcceptedCookie, recordAccepted } from "../cookies.js";

/**
 * Banner de consentimento de cookies (LGPD — CLAUDE.md §9). Só grava o
 * cookie quando o usuário ACEITA de propósito — recusar só esconde o
 * banner nesta sessão (volta a aparecer na próxima visita, já que nada
 * fica persistido).
 */
export function CookieConsent() {
  // Lazy init: lê o cookie só uma vez, não a cada render.
  const [accepted, setAccepted] = useState(hasAcceptedCookie);
  const [dismissed, setDismissed] = useState(false);

  if (accepted || dismissed) return null;

  const accept = () => {
    // Se o cookie não colar (bloqueado, modo privado restrito), só esconde
    // nesta sessão — sem isso, o banner "funcionava" visualmente mas voltava
    // pra sempre na próxima visita, sem explicar por quê.
    if (recordAccepted()) setAccepted(true);
    else setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      style={{
        // No topo, não embaixo: a faixa inferior já é ocupada pelo joystick,
        // botão de correr (dentro do jogo) e pelo CTA de entrar (na tela de
        // início) — embaixo, o banner ficava maior que essas barras e
        // cobria tudo, inclusive deixando o botão de entrar inacessível.
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        // Menor que o modal da Loja (zIndex 20, shop/Store.tsx) — a Loja já
        // pode ser aberta a partir da tela de entrada, antes de decidir
        // sobre o banner; o banner não deveria disputar espaço com um modal
        // de pagamento. Ainda maior que o resto da UI do jogo (até 6).
        zIndex: 15,
        padding:
          "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left))",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink)", lineHeight: 1.5 }}>
          Usamos cookies essenciais pra manter seu login e sua sessão de jogo. Você pode aceitar ou recusar —
          o jogo funciona nos dois casos.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={accept} style={acceptBtnStyle}>
            Aceitar
          </button>
          <button type="button" onClick={() => setDismissed(true)} style={rejectBtnStyle}>
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

const acceptBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 20px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};

const rejectBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 20px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
};
