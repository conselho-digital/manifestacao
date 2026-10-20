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
import { useIsTouch } from "./useIsTouch.js";

interface HudProps {
  online: boolean;
  scores: Record<TeamId, number>;
  chatLog: ChatEntry[];
  onChat: (text: string) => void;
  chatOpen: boolean;
  onChatOpenChange: (open: boolean) => void;
  /** false enquanto um modal (ex.: loja) está aberto — Enter não foca o chat. */
  enterFocusesChat?: boolean;
}

/** Cor de time segura: ignora `team` inválido vindo da rede (defensivo). */
function teamColor(team: unknown): string {
  return isTeamId(team) ? hexColor(TEAMS[team].color) : "var(--ink-dim)";
}

/** Sobreposição 2D: placar por time, estado da conexão e chat efêmero. */
export function Hud({ online, scores, chatLog, onChat, chatOpen, onChatOpenChange, enterFocusesChat = true }: HudProps) {
  const [text, setText] = useState("");
  const isTouch = useIsTouch();
  const logRef = useRef<HTMLDivElement>(null);
  const [kbOffset, setKbOffset] = useState(0);

  // Enter abre o chat (PC). Ignora se já está digitando ou se o foco está num
  // botão/link (Enter ali ativa o próprio controle).
  useEffect(() => {
    if (!enterFocusesChat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(t.tagName))) return;
      e.preventDefault();
      onChatOpenChange(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enterFocusesChat, onChatOpenChange]);

  // Mantém a caixa de texto colada acima do teclado do celular.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !chatOpen || !isTouch) {
      setKbOffset(0);
      return;
    }
    const update = () => setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [chatOpen, isTouch]);

  // Aberto no PC: acompanha a mensagem mais recente.
  useEffect(() => {
    const el = logRef.current;
    if (chatOpen && el) el.scrollTop = el.scrollHeight;
  }, [chatOpen, chatLog]);

  // Elemento (não componente): um componente interno remontaria a cada tecla e perderia o foco.
  const chatForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChat(text);
        setText("");
        if (isTouch) onChatOpenChange(false);
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Esc devolve o teclado ao jogo.
          if (e.key === "Escape") onChatOpenChange(false);
        }}
        onBlur={() => {
          if (isTouch) onChatOpenChange(false);
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
  );

  return (
    <>
      {/* Placar */}
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: "calc(env(safe-area-inset-left, 0px) + 10px)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          // Não invade a coluna de botões da direita em telas estreitas.
          maxWidth: "calc(100vw - 230px)",
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
            textShadow: "0 1px 2px #000",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: online ? "var(--accent)" : "var(--danger)",
            }}
          />
          {online ? "online" : "offline"}
        </span>
      </div>

      {/* Área de mensagens: fica no topo esquerdo (não embaixo) pra não disputar
          espaço com a bolinha do joystick. Fechado: só passa as mensagens.
          Aberto (botão Chat): rola, com a caixa de texto logo abaixo. */}
      <div
        style={{
          position: "fixed",
          left: "calc(env(safe-area-inset-left, 0px) + 10px)",
          top: "calc(env(safe-area-inset-top, 0px) + 54px)",
          // Termina antes da coluna de botões da direita (Spray/Veículo), pra não roubar o toque deles.
          width: "min(360px, calc(100vw - 150px))",
          zIndex: 6,
          pointerEvents: chatOpen && !isTouch ? "auto" : "none",
        }}
      >
        <div
          ref={logRef}
          style={{
            maxHeight: chatOpen && !isTouch ? 220 : 140,
            overflowY: chatOpen && !isTouch ? "auto" : "hidden",
            marginBottom: 6,
            pointerEvents: chatOpen && !isTouch ? "auto" : "none",
            background: chatOpen && !isTouch ? "var(--scrim)" : undefined,
            borderRadius: "var(--r-sm)",
          }}
        >
          {chatLog.map((c) => (
            <div key={c.key} style={{ fontSize: "var(--t-ui)", lineHeight: 1.4, textShadow: "0 1px 2px #000" }}>
              <strong style={{ color: teamColor(c.team) }}>{c.nickname}</strong>:{" "}
              {c.text.slice(0, MAX_CHAT_LENGTH)}
            </div>
          ))}
        </div>
        {chatOpen && !isTouch && chatForm}
      </div>
      {chatOpen && isTouch && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: kbOffset,
            padding: "8px 10px calc(env(safe-area-inset-bottom, 0px) + 8px)",
            background: "var(--scrim)",
            zIndex: 8,
          }}
        >
          {chatForm}
        </div>
      )}
    </>
  );
}
