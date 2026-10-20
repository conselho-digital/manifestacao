import { useEffect, useRef, useState } from "react";
import { superchatDisplayMs, superchatTier, type Superchat } from "@manifestacao/shared";
import { subscribePaidSuperchats } from "../net/superchat.js";

/** Fundo e texto por faixa de valor (contraste ≥ 4,5:1). */
const TIERS = [
  { bg: "#1f7a52", fg: "#fff" },
  { bg: "#e0a800", fg: "#1a1a1a" },
  { bg: "#c2410c", fg: "#fff" },
  { bg: "#be185d", fg: "#fff" },
] as const;
/** Fila máxima esperando vez; passou disso, descarta os mais baratos. */
const MAX_QUEUE = 20;

/**
 * Destaque dos superchats pagos: um por vez, no topo central, pelo tempo
 * proporcional ao valor. Chegam pelo Realtime (só linhas 'paid' passam no RLS).
 */
export function SuperchatBanner({ enabled }: { enabled: boolean }) {
  const [current, setCurrent] = useState<Superchat | null>(null);
  const queueRef = useRef<Superchat[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<Superchat | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const next = () => {
      const s = queueRef.current.shift() ?? null;
      currentRef.current = s;
      setCurrent(s);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (s) timerRef.current = setTimeout(next, superchatDisplayMs(s.amount_cents));
    };
    const unsubscribe = subscribePaidSuperchats((s) => {
      const q = queueRef.current;
      q.push(s);
      if (q.length > MAX_QUEUE) {
        q.sort((a, b) => b.amount_cents - a.amount_cents);
        q.length = MAX_QUEUE;
      }
      if (!currentRef.current) next();
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      queueRef.current = [];
      currentRef.current = null;
      setCurrent(null);
    };
  }, [enabled]);

  if (!current) return null;
  const tier = TIERS[superchatTier(current.amount_cents)];
  const color = tier.bg;
  return (
    <div
      key={current.id}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        // Abaixo da faixa de botões/placar do topo, pra não cobrir controles em 380px.
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(420px, calc(100vw - 32px))",
        zIndex: 7,
        pointerEvents: "none",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        background: "var(--surface)",
        border: `2px solid ${color}`,
        boxShadow: "0 6px 24px rgba(0,0,0,.45)",
      }}
    >
      <div style={{ background: color, color: tier.fg, padding: "6px 12px", display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: "var(--t-ui)" }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.name}</span>
        <span style={{ whiteSpace: "nowrap", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>R$ {(current.amount_cents / 100).toFixed(2).replace(".", ",")}</span>
      </div>
      <p style={{ margin: 0, padding: "8px 12px 10px", fontSize: "var(--t-body)", lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {current.message}
      </p>
    </div>
  );
}
