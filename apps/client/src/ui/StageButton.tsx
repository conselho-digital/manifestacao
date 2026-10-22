import type { StageVoiceUi } from "../net/useStageVoice.js";

interface StageButtonProps {
  voice: StageVoiceUi;
  /** Motivo de a conta não poder falar (silenciada); null = pode. */
  blockedNotice: string | null;
}

/** Palanque: botão de falar dentro da zona e aviso de quem está falando. Fica embaixo, no centro. */
export function StageButton({ voice, blockedNotice }: StageButtonProps) {
  const { state, inZone, toggle } = voice;
  const busyByOther = !!state.speakerId && !state.speaking;
  const showCard = inZone || state.speaking || busyByOther;
  if (!showCard && !state.error) return null;

  const label = state.speaking ? "Parar de falar" : state.starting ? "Liberando microfone…" : busyByOther ? "Palanque ocupado" : "Falar no palanque";
  const disabled = !state.speaking && (busyByOther || state.starting || !!blockedNotice);

  return (
    <div
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
        width: "min(150px, 38vw)",
        textAlign: "center",
      }}
    >
      {busyByOther && (
        <span role="status" style={pill}>
          {state.speakerNick || "Alguém"} está falando
        </span>
      )}
      {state.speaking && (
        <span role="status" style={{ ...pill, color: "var(--accent)", borderColor: "var(--accent)" }}>
          Você está ao vivo
        </span>
      )}
      {inZone && (
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-pressed={state.speaking}
          style={{
            minHeight: 48,
            width: "100%",
            borderRadius: "var(--r-lg)",
            border: `2px solid ${state.speaking ? "var(--danger)" : "var(--accent)"}`,
            background: state.speaking ? "var(--danger)" : "var(--accent)",
            color: state.speaking ? "#fff" : "var(--on-accent)",
            fontSize: "var(--t-ui)",
            fontWeight: 800,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {label}
        </button>
      )}
      {inZone && blockedNotice && <span style={{ ...pill, color: "var(--danger)" }}>{blockedNotice}</span>}
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
