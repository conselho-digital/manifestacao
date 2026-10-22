import { useCallback, useEffect, useRef, useState } from "react";
import { SPRAY_DAILY_LIMIT } from "./spray.js";

const KEY = "manifestacao.sprays";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readStored(day: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: unknown; used?: unknown } | null;
    if (raw && raw.day === day && typeof raw.used === "number" && Number.isFinite(raw.used)) {
      return Math.max(0, Math.min(SPRAY_DAILY_LIMIT, Math.floor(raw.used)));
    }
  } catch {
    /* sem armazenamento: vale a contagem em memória */
  }
  return 0;
}

/**
 * Sprays do dia: 15 por dia (zera à meia-noite, no horário do aparelho). A contagem fica em memória e é gravada no
 * aparelho; valem o maior dos dois, então mesmo sem armazenamento (aba anônima) o limite vale na sessão. Como o resto
 * do jogo no MVP (não autoritativo, CLAUDE.md §4), limpar os dados do navegador devolve os sprays.
 */
export function useDailySprays() {
  const mem = useRef({ day: today(), used: 0 });
  const current = useCallback((): number => {
    const day = today();
    if (mem.current.day !== day) mem.current = { day, used: 0 };
    mem.current.used = Math.max(mem.current.used, readStored(day));
    return mem.current.used;
  }, []);
  const [used, setUsed] = useState(current);

  // Passou da meia-noite com o jogo aberto, ou outra aba gastou: relê ao voltar e a cada 15 s.
  useEffect(() => {
    const sync = () => setUsed(current());
    const t = window.setInterval(sync, 15_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [current]);

  const write = useCallback((n: number) => {
    mem.current.used = n;
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: mem.current.day, used: n }));
    } catch {
      /* sem armazenamento */
    }
    setUsed(n);
  }, []);

  /** Gasta um spray; false se já acabaram (relê antes de negar: pode ter virado o dia). */
  const spend = useCallback((): boolean => {
    const n = current();
    if (n >= SPRAY_DAILY_LIMIT) {
      setUsed(n);
      return false;
    }
    write(n + 1);
    return true;
  }, [current, write]);

  /** Devolve um spray (o envio foi descartado depois de gastar). */
  const refund = useCallback(() => write(Math.max(0, current() - 1)), [current, write]);

  return { charges: SPRAY_DAILY_LIMIT - used, max: SPRAY_DAILY_LIMIT, spend, refund };
}
