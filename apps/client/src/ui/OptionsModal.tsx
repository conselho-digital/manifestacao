import { useEffect, useState } from "react";
import {
  CHARACTERS,
  CHARACTER_IDS,
  MAX_NICKNAME_LENGTH,
  TEAMS,
  TEAM_IDS,
  hexColor,
  type AvatarConfig,
  type CharacterId,
  type TeamId,
} from "@manifestacao/shared";
import { AvatarGlyph } from "./AvatarGlyph.js";
import { TeamFlagIcon } from "./TeamFlagIcon.js";

interface OptionsModalProps {
  avatar: AvatarConfig;
  onSave: (a: AvatarConfig) => void;
  onClose: () => void;
  /** Sai da conta e volta pra tela inicial. */
  onExit: () => void;
  /** Só passado para contas admin: abre o painel de admin. */
  onOpenAdmin?: () => void;
}

/**
 * Janela de perfil dentro do jogo: trocar de equipe, personagem e apelido,
 * ou sair da plataforma. As mudanças só valem ao clicar em "Salvar" (evita
 * reentrar no canal em tempo real a cada tecla digitada no apelido).
 */
export function OptionsModal({ avatar, onSave, onClose, onExit, onOpenAdmin }: OptionsModalProps) {
  const [team, setTeam] = useState<TeamId>(avatar.team);
  const [nickname, setNickname] = useState(avatar.nickname);
  const [character, setCharacter] = useState<CharacterId>(avatar.character);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim().slice(0, MAX_NICKNAME_LENGTH) || "Anônimo";
    onSave({ ...avatar, team, nickname: name, shirt: TEAMS[team].color, character });
  };

  const teamColorHex = hexColor(TEAMS[team].color);

  return (
    <div
      role="dialog"
      aria-label="Opções do perfil"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        background: "var(--scrim)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={save}
        style={{
          width: "min(480px, 94vw)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              textTransform: "uppercase",
            }}
          >
            Opções
          </h2>
          <button type="button" onClick={onClose} style={ghostBtn}>
            Fechar
          </button>
        </div>

        <section>
          <Label>Equipe</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 6 }}>
            {TEAM_IDS.map((id) => {
              const selected = id === team;
              const c = hexColor(TEAMS[id].color);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTeam(id)}
                  style={{
                    minHeight: 64,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 4px",
                    borderRadius: "var(--r-md)",
                    border: `2px solid ${selected ? c : "var(--line)"}`,
                    background: selected ? "var(--surface-2)" : "var(--surface)",
                    color: "var(--ink)",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <TeamFlagIcon color={c} />
                  {TEAMS[id].label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <Label htmlFor="options-nickname">Apelido</Label>
          <input
            id="options-nickname"
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
        </section>

        <section>
          <Label>Personagem</Label>
          <div
            style={{
              marginTop: 6,
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
                  <AvatarGlyph color={teamColorHex} />
                  <span style={{ fontSize: "var(--t-ui)", fontWeight: 700, color: "var(--ink)", textAlign: "center" }}>
                    {CHARACTERS[id].label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="submit"
          style={{
            minHeight: 48,
            borderRadius: "var(--r-lg)",
            border: "none",
            background: "var(--accent)",
            color: "var(--on-accent)",
            fontSize: 16,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Salvar
        </button>

        {onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            style={{
              minHeight: 44,
              borderRadius: "var(--r-lg)",
              border: "1px solid var(--accent)",
              background: "transparent",
              color: "var(--accent)",
              fontSize: "var(--t-ui)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Painel de admin
          </button>
        )}

        <button
          type="button"
          onClick={onExit}
          style={{
            minHeight: 44,
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--line)",
            background: "transparent",
            color: "var(--danger)",
            fontSize: "var(--t-ui)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sair da plataforma
        </button>
      </form>
    </div>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: "var(--t-ui)",
        color: "var(--ink-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </label>
  );
}

const ghostBtn: React.CSSProperties = {
  minHeight: 36,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
};
