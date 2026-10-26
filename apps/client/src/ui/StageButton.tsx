import { useEffect, useState } from "react";
import type { StageVoiceUi } from "../net/useStageVoice.js";

interface StageButtonProps {
  voice: StageVoiceUi;
  /** Motivo de a conta não poder falar (silenciada); null = pode. */
  blockedNotice: string | null;
}

const names = (list: { nick: string }[]) => list.map((m) => m.nick || "Alguém").join(" e ");

/**
 * Palanque: dentro do círculo de escuta mostra quem está ao vivo; na plataforma de fala, a vez na fila, o microfone e —
 * para o falante mais antigo — a pergunta de quem sai quando chega alguém novo. Fica embaixo, no centro.
 */
export function StageButton({ voice, blockedNotice }: StageButtonProps) {
  const { state, toggleMute, decide } = voice;
  const [now, setNow] = useState(() => Date.now());
  const prompt = state.prompt;
  useEffect(() => {
    if (!prompt) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [prompt]);

  if (state.stage < 0 && !state.error) return null;

  const live = state.speakers.length ? `Ao vivo: ${names(state.speakers)}` : "Ninguém falando";
  let status: string | null = null;
  if (state.inTalk) {
    if (blockedNotice) status = blockedNotice;
    else if (state.starting) status = "Liberando microfone…";
    else if (state.role === "speaker") status = "Você está ao vivo";
    else if (state.role === "queue") status = state.position > 0 ? `Você é o ${state.position}º da fila` : "Na fila";
    else if (state.role === "dismissed") status = "Você cedeu a vez. Saia da plataforma e entre de novo para voltar à fila.";
    else status = "Entrando na fila…";
  }
  const seconds = prompt ? Math.max(0, Math.ceil((prompt.deadline - now) / 1000)) : 0;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Acima das áreas do joystick e dos botões de direção (que ocupam a parte de baixo, dos dois lados).
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 230px)",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: "min(280px, 88vw)",
        textAlign: "center",
      }}
    >
      {state.stage >= 0 && (
        <span style={pill}>
          Palanque {state.stage + 1} · {live}
        </span>
      )}
      {state.stage >= 0 && !state.inTalk && state.queue.length > 0 && <span style={pill}>Na fila: {names(state.queue)}</span>}
      {status && <span style={{ ...pill, color: state.role === "speaker" ? "var(--accent)" : blockedNotice || state.role === "dismissed" ? "var(--danger)" : "var(--ink)", borderColor: state.role === "speaker" ? "var(--accent)" : "var(--line)" }}>{status}</span>}
      {state.inTalk && state.role === "speaker" && !state.starting && (
        <button type="button" onClick={toggleMute} aria-pressed={state.muted} style={{ ...btn, background: state.muted ? "var(--danger)" : "var(--accent)", borderColor: state.muted ? "var(--danger)" : "var(--accent)", color: state.muted ? "#fff" : "var(--on-accent)" }}>
          {state.muted ? "Microfone desligado" : "Desligar microfone"}
        </button>
      )}
      {prompt && (
        <div style={{ ...pill, display: "flex", flexDirection: "column", gap: 6, width: "100%", boxSizing: "border-box" }}>
          <span>
            {prompt.newcomer.nick || "Alguém"} quer falar. Quem sai? ({seconds}s)
          </span>
          <button type="button" onClick={() => decide("older")} style={btn}>
            Eu saio
          </button>
          <button type="button" onClick={() => decide("newer")} style={btn}>
            Sai {prompt.newer.nick || "o mais novo"}
          </button>
        </div>
      )}
      {state.error && (
        <span role="alert" style={{ ...pill, color: "var(--danger)", borderColor: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </div>
  );
}

const pill: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "var(--scrim)",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
};

const btn: React.CSSProperties = {
  minHeight: 44,
  width: "100%",
  borderRadius: "var(--r-lg)",
  border: "2px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontSize: "var(--t-ui)",
  fontWeight: 800,
  cursor: "pointer",
};
