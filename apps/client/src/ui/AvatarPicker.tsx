import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CHARACTERS,
  CHARACTER_IDS,
  FLAGS,
  FLAG_IDS,
  MAX_NICKNAME_LENGTH,
  PASSES,
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
import { signInWithGoogle, signOut } from "../auth/useAuth.js";
import { isOnlineEnabled } from "../config/env.js";

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
  minHeight: 44,
  padding: "8px 14px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: "var(--r-md)",
  cursor: "pointer",
  border: `2px solid ${selected && accent ? accent : "var(--line)"}`,
  background: selected ? (accent ?? "var(--surface-2)") : "var(--surface)",
  color: selected && accent ? "var(--on-accent)" : "var(--ink)",
  transition: "transform .08s, background .12s",
});

interface AvatarPickerProps {
  onReady: (a: AvatarConfig) => void;
  session: Session | null;
  authLoading: boolean;
  owned: ReadonlySet<string>;
  onOpenStore: () => void;
}

/**
 * Tela de entrada: time, apelido e (opcionais) personagem/bandeira, conta e
 * Premium. Layout responsivo em duas colunas (empilha sozinho em telas
 * estreitas via CSS grid — sem JS de breakpoint).
 */
export function AvatarPicker({ onReady, session, authLoading, owned, onOpenStore }: AvatarPickerProps) {
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

  const premium = PASSES.premium;
  const hasPremium = owned.has("pass:premium");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        padding:
          "max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
      }}
    >
      <header style={{ textAlign: "center", maxWidth: 560 }}>
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
          Manifestação Online
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--ink-dim)", fontSize: "var(--t-body)" }}>
          Escolha o seu lado e entre na avenida.
        </p>
      </header>

      <form
        onSubmit={submit}
        style={{
          width: "min(760px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Coluna: lado */}
        <section style={cardStyle}>
          <Label>Lado</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {TEAM_IDS.map((id) => {
              const t = TEAMS[id];
              const selected = id === team;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTeam(id)}
                  style={{ ...chip(selected, hexColor(t.color)), textAlign: "left", width: "100%" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Coluna: entrada */}
        <section style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label htmlFor="nickname">Seu apelido</Label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="Como te chamamos?"
              style={{
                marginTop: 6,
                width: "100%",
                minHeight: 44,
                padding: "12px 14px",
                fontSize: 16,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink)",
              }}
            />
          </div>

          {isOnlineEnabled && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: "var(--t-ui)", fontWeight: 700 }}>Conta opcional</div>
                <div style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
                  Jogue sem login. Entre para guardar compras e visual.
                </div>
              </div>
              {!authLoading &&
                (session ? (
                  <button type="button" onClick={() => void signOut()} style={smallBtnStyle}>
                    Sair
                  </button>
                ) : (
                  <button type="button" onClick={() => void signInWithGoogle()} style={smallAccentBtnStyle}>
                    Entrar
                  </button>
                ))}
            </div>
          )}

          <details style={detailsStyle}>
            <summary style={summaryStyle}>
              Personalizar personagem <span style={{ color: "var(--ink-dim)", fontWeight: 400 }}>Opcional</span>
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <div>
                <Label>Personagem</Label>
                <Row>
                  {CHARACTER_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={id === character}
                      onClick={() => setCharacter(id)}
                      style={chip(id === character, "var(--accent)")}
                    >
                      {CHARACTERS[id].label}
                    </button>
                  ))}
                </Row>
              </div>
              <div>
                <Label>Bandeira</Label>
                <Row>
                  {FLAG_IDS.map((id) => {
                    const accent = id === "nenhuma" ? "var(--accent)" : hexColor(flagColor(id, TEAMS[team].color));
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={id === flag}
                        onClick={() => setFlag(id)}
                        style={chip(id === flag, accent)}
                      >
                        {FLAGS[id].label}
                      </button>
                    );
                  })}
                </Row>
              </div>
            </div>
          </details>

          {isOnlineEnabled && (
            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                Premium e passes{" "}
                <span style={{ color: "var(--ink-dim)", fontWeight: 400 }}>
                  {hasPremium ? "Você tem" : "Ver benefícios"}
                </span>
              </summary>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>{premium.description}</div>
                <button
                  type="button"
                  onClick={onOpenStore}
                  style={{ ...smallAccentBtnStyle, alignSelf: "flex-start" }}
                >
                  {hasPremium ? "Ver loja" : "Comprar na loja"}
                </button>
              </div>
            </details>
          )}
        </section>
      </div>

        <button
          type="submit"
          style={{
            minHeight: 48,
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
          Entrar no jogo
        </button>
      </form>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
  padding: 16,
};

const detailsStyle: React.CSSProperties = {
  borderTop: "1px solid var(--line)",
  paddingTop: 10,
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  display: "flex",
  justifyContent: "space-between",
  listStyle: "none",
};

const smallBtnStyle: React.CSSProperties = {
  minHeight: 36,
  padding: "8px 14px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
};

const smallAccentBtnStyle: React.CSSProperties = {
  minHeight: 36,
  padding: "8px 14px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}
    >
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}
