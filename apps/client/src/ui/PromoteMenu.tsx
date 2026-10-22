import { useEffect, useRef, useState } from "react";

interface PromoteMenuProps {
  onBillboards: () => void;
  onSign: () => void;
  onSuperchat: () => void;
}

/**
 * "Divulgar": um botão que abre, na horizontal, as três formas de divulgação (Telões, Cartaz e Superchat).
 * Usado no celular para não ocupar três botões no canto da tela.
 */
export function PromoteMenu({ onBillboards, onSign, onSuperchat }: PromoteMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // A fileira é `fixed` (o painel do canto tem rolagem e cortaria uma lista absoluta).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const optionStyle: React.CSSProperties = {
    minHeight: 44,
    padding: "8px 14px",
    fontSize: "var(--t-ui)",
    fontWeight: 700,
    borderRadius: "var(--r-sm)",
    border: "1px solid var(--line)",
    background: "var(--surface-2)",
    color: "var(--ink)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={rootRef} style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          minHeight: 44,
          minWidth: 148,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: "var(--t-ui)",
          fontWeight: 700,
          borderRadius: "var(--r-sm)",
          border: `1px solid ${open ? "var(--accent)" : "var(--line)"}`,
          background: "var(--scrim)",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        Divulgar
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && pos && (
        <div
          role="menu"
          aria-label="Divulgar"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            maxWidth: "calc(100vw - 16px)",
            display: "flex",
            flexDirection: "row",
            gap: 6,
            padding: 6,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            zIndex: 9,
          }}
        >
          <button type="button" role="menuitem" onClick={choose(onBillboards)} style={optionStyle}>
            Telões
          </button>
          <button type="button" role="menuitem" onClick={choose(onSign)} style={optionStyle}>
            Cartaz
          </button>
          <button type="button" role="menuitem" onClick={choose(onSuperchat)} style={optionStyle}>
            Superchat
          </button>
        </div>
      )}
    </div>
  );
}
