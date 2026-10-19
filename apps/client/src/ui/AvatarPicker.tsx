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
import { TeamFlagIcon } from "./TeamFlagIcon.js";
import { AvatarGlyph } from "./AvatarGlyph.js";

const STORAGE_KEY = "manifestacao.avatar";

function loadSaved(): Partial<AvatarConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AvatarConfig>) : {};
    // Mesmo truncamento aplicado no submit — um localStorage adulterado
    // manualmente não deveria conseguir pré-popular um apelido fora do limite.
    if (typeof parsed.nickname === "string") {
      parsed.nickname = parsed.nickname.slice(0, MAX_NICKNAME_LENGTH);
    }
    return parsed;
  } catch {
    return {};
  }
}

interface AvatarPickerProps {
  onReady: (a: AvatarConfig) => void;
  session: Session | null;
  authLoading: boolean;
  owned: ReadonlySet<string>;
  onOpenStore: () => void;
}

/**
 * Tela de entrada: logo + conta no topo, seletor de lado, grade de
 * personagens (com bandeira/Premium dentro da mesma seção) e um botão de
 * entrar fixo embaixo. Identidade e nomes são próprios — ver CLAUDE.md §9.
 */
export function AvatarPicker({ onReady, session, authLoading, owned, onOpenStore }: AvatarPickerProps) {
  // Inicializador lazy: lê o localStorage só na primeira renderização, não a
  // cada tecla digitada (useState(saved...) re-rodaria loadSaved() sempre).
  const [saved] = useState(loadSaved);
  const [team, setTeam] = useState<TeamId>(isTeamId(saved.team) ? saved.team : TEAM_IDS[0]);
  const [nickname, setNickname] = useState(saved.nickname ?? "");
  const [character, setCharacter] = useState<CharacterId>(
    isCharacterId(saved.character) ? saved.character : "comum",
  );
  const [flag, setFlag] = useState<FlagId>(isFlagId(saved.flag) ? saved.flag : "nenhuma");
  const [customizing, setCustomizing] = useState(false);

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
  const teamColorHex = hexColor(TEAMS[team].color);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topo: logo + conta */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding:
            "max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left))",
          // Sem linha — separado do conteúdo por um passo de tom, não por
          // uma borda fina (regra de casa: nada de hairlines).
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Manifestação <span style={{ color: "var(--accent)" }}>Online</span>
        </div>

        {isOnlineEnabled && !authLoading && (
          <div style={{ flexShrink: 0 }}>
            {session ? (
              <button type="button" onClick={() => void signOut()} style={smallBtnStyle}>
                Sair
              </button>
            ) : (
              // Texto curto (não "Entrar com Google") pra nunca disputar
              // espaço com a logo em telas estreitas (~360-380px).
              <button type="button" onClick={() => void signInWithGoogle()} style={smallAccentBtnStyle}>
                Entrar
              </button>
            )}
          </div>
        )}
      </header>

      <form
        id="avatar-picker-form"
        onSubmit={submit}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          // Centraliza verticalmente quando sobra altura (desktop/tablet) —
          // evita o conteúdo ficar preso no topo com um vazio grande embaixo.
          justifyContent: "center",
          gap: 28,
          padding: "20px max(16px, env(safe-area-inset-right)) 128px max(16px, env(safe-area-inset-left))",
          width: "min(640px, 100%)",
          margin: "0 auto",
        }}
      >
        {/* Lado */}
        <section>
          <SectionTitle>De que lado você está?</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
            {TEAM_IDS.map((id) => {
              const t = TEAMS[id];
              const selected = id === team;
              const c = hexColor(t.color);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTeam(id)}
                  style={{
                    minHeight: 64,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: "var(--r-md)",
                    border: `2px solid ${selected ? c : "var(--line)"}`,
                    background: selected ? "var(--surface-2)" : "var(--surface)",
                    color: "var(--ink)",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    transition: "transform .08s, border-color .12s",
                  }}
                >
                  <TeamFlagIcon color={c} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Personagem */}
        <section style={cardStyle}>
          <SectionTitle>Escolha seu personagem</SectionTitle>
          <p style={{ margin: "6px 0 0", color: "var(--ink)", fontSize: "var(--t-body)", maxWidth: "48ch" }}>
            Visual e bandeira você personaliza aqui — seu nome aparece pros outros na avenida.
          </p>

          <div style={{ marginTop: 14 }}>
            <Label htmlFor="nickname">Apelido</Label>
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

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
              gap: 10,
            }}
          >
            {CHARACTER_IDS.map((id) => {
              const selected = id === character;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCharacter(id)}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "12px 6px",
                    borderRadius: "var(--r-md)",
                    border: `2px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                    background: selected ? "var(--surface-2)" : "var(--surface)",
                    cursor: "pointer",
                  }}
                >
                  {selected && (
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width={11} height={9} viewBox="0 0 11 9" aria-hidden="true">
                        <path
                          d="M1 4.5L4 7.5L10 1"
                          fill="none"
                          stroke="var(--on-accent)"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  <AvatarGlyph color={teamColorHex} />
                  <span style={{ fontSize: "var(--t-ui)", fontWeight: 700, color: "var(--ink)", textAlign: "center" }}>
                    {CHARACTERS[id].label}
                  </span>
                </button>
              );
            })}

            {isOnlineEnabled && (
              <button
                type="button"
                onClick={onOpenStore}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "12px 6px",
                  borderRadius: "var(--r-md)",
                  border: "2px dashed var(--line)",
                  background: "transparent",
                  color: "var(--ink-dim)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: "var(--t-ui)", fontWeight: 700 }}>Loja</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            aria-expanded={customizing}
            style={{ ...smallBtnStyle, marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Bandeira e Premium
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                transition: "transform .15s",
                transform: customizing ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▾
            </span>
          </button>

          {customizing && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Label>Bandeira</Label>
                <Row>
                  {FLAG_IDS.map((id) => {
                    const accent = id === "nenhuma" ? "var(--accent)" : hexColor(flagColor(id, TEAMS[team].color));
                    const selected = id === flag;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setFlag(id)}
                        style={chip(selected, accent)}
                      >
                        {FLAGS[id].label}
                      </button>
                    );
                  })}
                </Row>
              </div>

              {isOnlineEnabled && (
                // Separado por um passo de tom (var(--surface-2)), não por
                // uma linha — mesma regra aplicada no header.
                <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 12 }}>
                  <div style={{ fontSize: "var(--t-ui)", fontWeight: 700 }}>
                    Premium {hasPremium && <span style={{ color: "var(--accent)" }}>· você tem</span>}
                  </div>
                  <div style={{ fontSize: "var(--t-ui)", color: "var(--ink)", marginTop: 4, maxWidth: "56ch" }}>
                    {premium.description}
                  </div>
                  <button type="button" onClick={onOpenStore} style={{ ...smallAccentBtnStyle, marginTop: 8 }}>
                    {hasPremium ? "Ver loja" : "Comprar na loja"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </form>

      {/* Barra fixa de entrada */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding:
            "12px max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          background: "linear-gradient(to top, var(--bg) 60%, transparent)",
        }}
      >
        <button
          type="submit"
          form="avatar-picker-form"
          style={{
            width: "min(720px, 100%)",
            margin: "0 auto",
            display: "block",
            minHeight: 52,
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
          Entrar na avenida
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
  padding: 16,
};

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: 0,
        // Menor que a logo do header (22px) — título de seção é subordinado
        // à marca, não compete com ela.
        fontFamily: "var(--font-display)",
        fontSize: 18,
        fontWeight: 400,
        letterSpacing: "-0.01em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </h2>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)", fontWeight: 700 }}>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}
