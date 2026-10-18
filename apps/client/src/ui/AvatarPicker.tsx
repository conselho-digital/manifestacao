import { useState } from "react";
import {
  MAX_NICKNAME_LENGTH,
  TEAMS,
  TEAM_IDS,
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

function hex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
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
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Entre na avenida</h1>
      <p style={{ margin: 0, opacity: 0.75, fontSize: 15 }}>Escolha o seu lado e o seu apelido.</p>

      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={MAX_NICKNAME_LENGTH}
        placeholder="Seu apelido"
        style={{
          width: "min(320px, 80vw)",
          padding: "12px 14px",
          fontSize: 16,
          borderRadius: 10,
          border: "1px solid #2b3139",
          background: "#0f1216",
          color: "#f5f6f7",
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
              onClick={() => setTeam(id)}
              style={{
                minWidth: 96,
                padding: "12px 16px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 10,
                cursor: "pointer",
                border: `2px solid ${hex(t.color)}`,
                background: selected ? hex(t.color) : "transparent",
                color: selected ? "#0f1216" : "#f5f6f7",
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
          marginTop: 4,
          padding: "14px 32px",
          fontSize: 17,
          fontWeight: 800,
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          background: "#f5f6f7",
          color: "#0f1216",
        }}
      >
        Entrar
      </button>
    </form>
  );
}
