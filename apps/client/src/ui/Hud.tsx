import { useEffect, useRef, useState } from "react";
import {
  MAX_CHAT_LENGTH,
  TEAMS,
  TEAM_IDS,
  hexColor,
  isTeamId,
  type TeamId,
} from "@manifestacao/shared";
import type { ChatEntry } from "../net/useAvenueRealtime.js";

interface HudProps {
  online: boolean;
  scores: Record<TeamId, number>;
  chatLog: ChatEntry[];
  onChat: (text: string) => void;
  /** false enquanto um modal (ex.: loja) está aberto — Enter não foca o chat. */
  enterFocusesChat?: boolean;
}

/** Cor de time segura: ignora `team` inválido vindo da rede (defensivo). */
function teamColor(team: unknown): string {
  return isTeamId(team) ? hexColor(TEAMS[team].color) : "var(--ink-dim)";
}

/** Sobreposição 2D: placar por time, estado da conexão e chat efêmero. */
export function Hud({ online, scores, chatLog, onChat, enterFocusesChat = true }: HudProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Enter foca o chat (PC). Ignora se já está digitando ou se o foco está num
  // botão/link (Enter ali ativa o próprio controle).
  useEffect(() => {
    if (!enterFocusesChat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enterFocusesChat]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onChat(text);
    setText("");
  };

  return (
    <>
      {/* Placar */}
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: "calc(env(safe-area-inset-left, 0px) + 10px)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 6,
        }}
      >
        {TEAM_IDS.map((id) => (
          <div
            key={id}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--r-sm)",
              background: "var(--scrim)",
              borderLeft: `3px solid ${hexColor(TEAMS[id].color)}`,
              fontSize: "var(--t-ui)",
              fontWeight: 700,
            }}
          >
            {TEAMS[id].label}: {scores[id]}
          </div>
        ))}
        <span
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--t-ui)",
            color: "var(--ink-dim)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: online ? "var(--accent)" : "var(--line)",
            }}
          />
          {online ? "online" : "offline"}
        </span>
      </div>

      {/* Chat: fica no topo (não embaixo) pra não disputar espaço com a
          bolinha fixa do joystick, que agora ocupa todo o canto inferior
          esquerdo da tela. */}
      <div
        style={{
          position: "fixed",
          left: "calc(env(safe-area-inset-left, 0px) + 10px)",
          top: "calc(env(safe-area-inset-top, 0px) + 54px)",
          width: "min(360px, 80vw)",
          zIndex: 6,
        }}
      >
        <div style={{ maxHeight: 140, overflow: "hidden", marginBottom: 6 }}>
          {chatLog.map((c) => (
            <div key={c.key} style={{ fontSize: "var(--t-ui)", lineHeight: 1.4, textShadow: "0 1px 2px #000" }}>
              <strong style={{ color: teamColor(c.team) }}>{c.nickname}</strong>:{" "}
              {c.text.slice(0, MAX_CHAT_LENGTH)}
            </div>
          ))}
        </div>
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Esc devolve o teclado ao jogo.
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Conversar…"
            aria-label="Mensagem de chat"
            style={{
              width: "100%",
              minHeight: 44,
              padding: "11px 12px",
              fontSize: 16,
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--line)",
              background: "var(--scrim)",
              color: "var(--ink)",
            }}
          />
        </form>
      </div>
    </>
  );
}
