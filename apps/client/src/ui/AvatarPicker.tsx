import { useState } from "react";
import {
  CHARACTERS,
  CHARACTER_IDS,
  FLAGS,
  FLAG_IDS,
  MAX_NICKNAME_LENGTH,
  TEAMS,
  TEAM_IDS,
  flagColor,
  hexColor,
  isCharacterId,
  isFlagId,
  isTeamId,
  type AvatarConfig,
  type CharacterId,
  type FlagId,
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

const chip = (selected: boolean, accent?: string): React.CSSProperties => ({
  minHeight: 40,
  padding: "8px 14px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: "var(--r-md)",
  cursor: "pointer",
  border: `2px solid ${accent ?? "var(--line)"}`,
  background: selected ? (accent ?? "var(--surface-2)") : "var(--surface)",
  color: selected && accent ? "#15181d" : "var(--ink)",
  transition: "transform .08s, background .12s",
});

/** Entrada em 1 clique: time, apelido, personagem e bandeira. */
export function AvatarPicker({ onReady }: { onReady: (a: AvatarConfig) => void }) {
  const saved = loadSaved();
  const [team, setTeam] = useState<TeamId>(isTeamId(saved.team) ? saved.team : TEAM_IDS[0]);
  const [nickname, setNickname] = useState(saved.nickname ?? "");
  const [character, setCharacter] = useState<CharacterId>(
    isCharacterId(saved.character) ? saved.character : "comum",
  );
  const [flag, setFlag] = useState<FlagId>(isFlagId(saved.flag) ? saved.flag : "nenhuma");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim().slice(0, MAX_NICKNAME_LENGTH) || "Anônimo";
    const avatar: AvatarConfig = { team, nickname: name, shirt: TEAMS[team].color, character, flag };
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
        gap: 16,
        padding:
          "max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        textAlign: "center",
        overflowY: "auto",
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

      <Label>Lado</Label>
      <Row>
        {TEAM_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={id === team} onClick={() => setTeam(id)} style={chip(id === team, hexColor(TEAMS[id].color))}>
            {TEAMS[id].label}
          </button>
        ))}
      </Row>

      <Label>Personagem</Label>
      <Row>
        {CHARACTER_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={id === character} onClick={() => setCharacter(id)} style={chip(id === character)}>
            {CHARACTERS[id].label}
          </button>
        ))}
      </Row>

      <Label>Bandeira</Label>
      <Row>
        {FLAG_IDS.map((id) => {
          const accent = id === "nenhuma" ? undefined : hexColor(flagColor(id, TEAMS[team].color));
          return (
            <button key={id} type="button" aria-pressed={id === flag} onClick={() => setFlag(id)} style={chip(id === flag, accent)}>
              {FLAGS[id].label}
            </button>
          );
        })}
      </Row>

      <button
        type="submit"
        style={{
          marginTop: 8,
          minHeight: 48,
          padding: "14px 36px",
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: "min(420px, 92vw)" }}>{children}</div>;
}
