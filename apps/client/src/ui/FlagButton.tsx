import { useEffect, useRef, useState } from "react";
import type { FlagId } from "@manifestacao/shared";
import { formatClock } from "../game/useFlagTime.js";

interface FlagButtonProps {
  /** Escolha atual (mesmo que o tempo grátis tenha acabado). */
  choice: FlagId;
  onChoose: (f: FlagId) => void;
  /** Imagem da bandeira da equipe; sem ela, a cor. */
  teamImageUrl: string | null;
  teamColor: string;
  teamLabel: string;
  /** Segundos grátis restantes hoje (Infinity = comprou bandeira, sem limite). */
  remaining: number;
  /** A bandeira está à mostra no jogo agora. */
  shown: boolean;
}

/**
 * Botão de bandeira, abaixo do spray (um só retângulo: imagem ao fundo; "Bandeira" ou, com ela ligada, o contador): escolhe "Sem bandeira" ou a bandeira da equipe e mostra o contador do tempo grátis
 * (3 horas por dia, gastas só enquanto a bandeira aparece no jogo).
 */
export function FlagButton({ choice, onChoose, teamImageUrl, teamColor, teamLabel, remaining, shown }: FlagButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const unlimited = !Number.isFinite(remaining);
  const exhausted = !unlimited && remaining <= 0;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const swatch = (url: string | null): React.CSSProperties => ({
    width: 44,
    height: 28,
    flexShrink: 0,
    borderRadius: 4,
    border: "1px solid var(--line)",
    background: url ? `center / cover no-repeat url("${url}"), ${teamColor}` : teamColor,
  });
  const option: React.CSSProperties = {
    minHeight: 44,
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    fontSize: "var(--t-ui)",
    fontWeight: 700,
    borderRadius: "var(--r-sm)",
    border: "1px solid transparent",
    cursor: "pointer",
  };
  const pick = (f: FlagId) => () => {
    onChoose(f);
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <div ref={rootRef} style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Bandeira: ${choice === "nenhuma" ? "sem bandeira" : "da equipe"}${shown && !unlimited ? `, ${formatClock(remaining)} restantes hoje` : ""}`}
        onClick={toggle}
        style={{
          minWidth: 92,
          minHeight: 44,
          padding: "4px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--r-sm)",
          border: `1px solid ${shown ? "var(--accent)" : "var(--line)"}`,
          background:
            choice === "nenhuma"
              ? "var(--scrim)"
              : `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), ${teamImageUrl ? `center / cover no-repeat url("${teamImageUrl}"), ` : ""}${teamColor}`,
          color: choice === "nenhuma" ? "var(--ink)" : "#fff",
          textShadow: choice === "nenhuma" ? "none" : "0 1px 3px rgba(0,0,0,.9)",
          fontSize: "var(--t-ui)",
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        {choice === "nenhuma" || !shown ? (exhausted && choice !== "nenhuma" ? "Acabou" : "Bandeira") : unlimited ? "Ligada" : formatClock(remaining)}
      </button>

      {open && pos && (
        <div
          role="menu"
          aria-label="Bandeira"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            minWidth: 240,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: `calc(100dvh - ${pos.top + 16}px)`,
            overflowY: "auto",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            zIndex: 9,
          }}
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={choice === "time"}
            onClick={pick("time")}
            style={{ ...option, background: choice === "time" ? "var(--accent)" : "var(--surface-2)", color: choice === "time" ? "var(--on-accent)" : "var(--ink)" }}
          >
            <span style={swatch(teamImageUrl)} />
            Bandeira da equipe
            <span style={{ opacity: 0.75, fontWeight: 600 }}>{teamLabel}</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={choice === "nenhuma"}
            onClick={pick("nenhuma")}
            style={{ ...option, background: choice === "nenhuma" ? "var(--accent)" : "var(--surface-2)", color: choice === "nenhuma" ? "var(--on-accent)" : "var(--ink)" }}
          >
            <span style={{ ...swatch(null), background: "transparent", borderStyle: "dashed" }} />
            Sem bandeira
          </button>
          <p style={{ margin: "6px 6px 2px", fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
            {unlimited
              ? "Você tem bandeira comprada: sem limite de tempo."
              : exhausted
                ? "O tempo grátis de hoje acabou. Volta amanhã."
                : `Grátis: 3 horas por dia, contadas só com a bandeira à mostra. Restam ${formatClock(remaining)}.`}
          </p>
        </div>
      )}
    </div>
  );
}
