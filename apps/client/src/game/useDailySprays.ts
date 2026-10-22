import { useCallback, useEffect, useRef, useState } from "react";
import { SPRAY_DAILY_LIMIT } from "./spray.js";

const KEY = "manifestacao.sprays";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readUsed(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: unknown; used?: unknown } | null;
    if (raw && raw.day === today() && typeof raw.used === "number" && Number.isFinite(raw.used)) {
      return Math.max(0, Math.min(SPRAY_DAILY_LIMIT, Math.floor(raw.used)));
    }
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  return 0;
}

/**
 * Sprays do dia: 15 por dia (zera à meia-noite, no horário do aparelho). Contagem guardada no aparelho — como o resto
 * do jogo no MVP (não autoritativo, CLAUDE.md §4), limpar os dados do navegador devolve os sprays.
 */
export function useDailySprays() {
  const [used, setUsed] = useState(readUsed);
  const usedRef = useRef(used);
  usedRef.current = used;

  // Passou da meia-noite com o jogo aberto: renova.
  useEffect(() => {
    const t = window.setInterval(() => setUsed(readUsed()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /** Gasta um spray; false se já acabaram. */
  const spend = useCallback((): boolean => {
    const current = readUsed();
    if (current >= SPRAY_DAILY_LIMIT) {
      setUsed(current);
      return false;
    }
    const next = current + 1;
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: today(), used: next }));
    } catch {
      /* sem armazenamento */
    }
    setUsed(next);
    return true;
  }, []);

  return { charges: SPRAY_DAILY_LIMIT - used, max: SPRAY_DAILY_LIMIT, spend };
}
