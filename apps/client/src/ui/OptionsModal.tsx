import { teamIconImageUrl } from "../game/models.js";
import { useRef, useState } from "react";
import { useModal } from "./useModal.js";
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
import { GRAPHICS_LEVELS, type GraphicsLevel } from "../config/graphics.js";
import { CharacterBody } from "./CharacterFace.js";
import { TeamFlagIcon } from "./TeamFlagIcon.js";
import { LegalLinks } from "./LegalPage.js";

interface OptionsModalProps {
  avatar: AvatarConfig;
  onSave: (a: AvatarConfig) => void;
  onClose: () => void;
  /** Sai da conta e volta pra tela inicial. */
  onExit: () => void;
  /** Só passado para contas admin: abre o painel de admin. */
  onOpenAdmin?: () => void;
  /** Só para quem está logado: apaga a conta (LGPD). Rejeita com a mensagem de erro em pt-BR. */
  onDeleteAccount?: () => Promise<void>;
  /** Qualidade gráfica (% da resolução); vale na hora. */
  graphics: GraphicsLevel;
  onGraphics: (l: GraphicsLevel) => void;
}

/**
 * Janela de perfil dentro do jogo: trocar de equipe, personagem e apelido,
 * ou sair da plataforma. As mudanças só valem ao clicar em "Salvar" (evita
 * reentrar no canal em tempo real a cada tecla digitada no apelido).
 */
export function OptionsModal({ avatar, onSave, onClose, onExit, onOpenAdmin, onDeleteAccount, graphics, onGraphics }: OptionsModalProps) {
  const downOnBackdrop = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamId>(avatar.team);
  const [nickname, setNickname] = useState(avatar.nickname);
  const [character, setCharacter] = useState<CharacterId>(avatar.character);

  const dialogRef = useModal<HTMLFormElement>(onClose);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim().slice(0, MAX_NICKNAME_LENGTH) || "Anônimo";
    onSave({ ...avatar, team, nickname: name, shirt: TEAMS[team].color, character });
  };

  const teamColorHex = hexColor(TEAMS[team].color);

  return (
    <div
      // Só fecha se o clique COMEÇA e TERMINA no fundo (arrastar a seleção de um campo para fora não perde o que foi digitado).
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="options-title"
        tabIndex={-1}
        onSubmit={save}
        style={{
          width: "min(480px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          outline: "none",
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2
            id="options-title"
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <select
              aria-label="Gráficos"
              title="Gráficos"
              value={graphics}
              onChange={(e) => onGraphics(Number(e.target.value) as GraphicsLevel)}
              style={{ ...ghostBtn, minWidth: 0, fontSize: 16 }}
            >
              {GRAPHICS_LEVELS.map((l) => (
                <option key={l} value={l}>
                  Gráf. {l}%
                </option>
              ))}
            </select>
            <button type="button" onClick={onClose} style={ghostBtn}>
              Fechar
            </button>
          </div>
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
                    fontSize: "var(--t-ui)",
                    cursor: "pointer",
                  }}
                >
                  <TeamFlagIcon color={c} imageUrl={teamIconImageUrl(id)} />
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
              fontSize: "var(--t-body)",
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
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
                  <CharacterBody color={teamColorHex} character={id} width={132} height={200} />
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
            fontSize: "var(--t-body)",
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

        {onDeleteAccount && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{ ...ghostBtn, color: "var(--ink-dim)", border: "none", textDecoration: "underline" }}
          >
            Excluir minha conta
          </button>
        )}
        {onDeleteAccount && confirmDelete && (
          <div
            role="alertdialog"
            aria-label="Confirmar exclusão da conta"
            style={{ border: "1px solid var(--danger)", borderRadius: "var(--r-md)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <p style={{ margin: 0, fontSize: "var(--t-ui)" }}>
              Isso apaga seu perfil, compras, itens e créditos. Não dá para desfazer.
            </p>
            {deleteError && (
              <p role="alert" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--danger)" }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} style={{ ...ghostBtn, flex: 1 }}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true);
                  setDeleteError(null);
                  onDeleteAccount().catch((e: unknown) => {
                    setDeleteError(e instanceof Error ? e.message : "Não foi possível excluir agora.");
                    setDeleting(false);
                  });
                }}
                style={{ ...ghostBtn, flex: 1, color: "var(--danger)", borderColor: "var(--danger)", fontWeight: 700 }}
              >
                {deleting ? "Excluindo…" : "Excluir de vez"}
              </button>
            </div>
          </div>
        )}
        <LegalLinks />
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
  minHeight: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
};
