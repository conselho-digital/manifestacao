import { useState } from "react";
import {
  MAX_NICKNAME_LENGTH,
  TEAMS,
  TEAM_IDS,
  hexColor,
  isTeamId,
  type AvatarConfig,
  type TeamId,
} from "@manifestacao/shared";

const STORAGE_KEY = "manifestacao.avatar";

function loadSaved(): Partial<AvatarConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AvatarConfig>) : {};
  } catch {
    return {};
  }
}

/** Entrada em 1 clique: escolher lado e apelido. Visual salvo no localStorage. */
export function AvatarPicker({ onReady }: { onReady: (a: AvatarConfig) => void }) {
  const saved = loadSaved();
  const [team, setTeam] = useState<TeamId>(isTeamId(saved.team) ? saved.team : TEAM_IDS[0]);
  const [nickname, setNickname] = useState(saved.nickname ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim().slice(0, MAX_NICKNAME_LENGTH) || "Anônimo";
    const avatar: AvatarConfig = { team, nickname: name, shirt: TEAMS[team].color };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
    } catch {
      /* modo privado: segue sem persistir */
    }
    onReady(avatar);
  };

  return (
    <form
      onSubmit={submit}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding:
          "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-display)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 0.95,
          textTransform: "uppercase",
        }}
      >
        Entre na avenida
      </h1>
      <p style={{ margin: 0, color: "var(--ink-dim)", fontSize: "var(--t-body)" }}>
        Escolha o seu lado e o seu apelido.
      </p>

      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={MAX_NICKNAME_LENGTH}
        placeholder="Seu apelido"
        aria-label="Apelido"
        style={{
          width: "min(320px, 80vw)",
          minHeight: 44,
          padding: "12px 14px",
          fontSize: 16,
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
        }}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {TEAM_IDS.map((id) => {
          const t = TEAMS[id];
          const selected = id === team;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => setTeam(id)}
              style={{
                minWidth: 96,
                minHeight: 44,
                padding: "12px 16px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                border: `2px solid ${hexColor(t.color)}`,
                background: selected ? hexColor(t.color) : "var(--surface)",
                color: selected ? "#15181d" : "var(--ink)",
                transition: "transform .08s, background .12s",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <button
        type="submit"
        style={{
          minHeight: 44,
          padding: "14px 32px",
          fontSize: 17,
          fontWeight: 800,
          borderRadius: "var(--r-lg)",
          border: "none",
          cursor: "pointer",
          background: "var(--accent)",
          color: "var(--on-accent)",
          transition: "transform .08s",
        }}
      >
        Entrar
      </button>
    </form>
  );
}
