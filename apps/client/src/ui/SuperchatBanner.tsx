import { useEffect, useRef, useState } from "react";
import { superchatDisplayMs, superchatTier, type Superchat } from "@manifestacao/shared";
import { subscribePaidSuperchats } from "../net/superchat.js";

const TIER_COLOR = ["#2f9e6b", "#e0a800", "#e8590c", "#d6336c"] as const;
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
  const color = TIER_COLOR[superchatTier(current.amount_cents)];
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
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
      <div style={{ background: color, color: "#fff", padding: "6px 12px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "var(--t-ui)" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.name}</span>
        <span>R$ {(current.amount_cents / 100).toFixed(2).replace(".", ",")}</span>
      </div>
      <p style={{ margin: 0, padding: "8px 12px 10px", fontSize: "var(--t-body)", lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {current.message}
      </p>
    </div>
  );
}
