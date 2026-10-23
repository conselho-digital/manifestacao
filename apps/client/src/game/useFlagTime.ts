import { useCallback, useEffect, useRef, useState } from "react";

/** Tempo grátis de bandeira por dia: 3 horas, contadas só enquanto a bandeira está sendo exibida no jogo. */
export const FREE_FLAG_SECONDS = 3 * 60 * 60;
const KEY = "manifestacao.flagtime";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readStored(day: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: unknown; used?: unknown } | null;
    if (raw && raw.day === day && typeof raw.used === "number" && Number.isFinite(raw.used)) {
      return Math.max(0, Math.min(FREE_FLAG_SECONDS, Math.floor(raw.used)));
    }
  } catch {
    /* sem armazenamento: vale a contagem em memória */
  }
  return 0;
}

/**
 * Relógio da bandeira grátis. `active` = há bandeira à mostra; `unlimited` = quem comprou bandeira não gasta tempo.
 * A contagem fica em memória e é gravada no aparelho (vale o maior dos dois); zera à meia-noite.
 * Como o resto do MVP (CLAUDE.md §4), é do cliente: limpar os dados do navegador devolve o tempo.
 */
export function useFlagTime(active: boolean, unlimited: boolean) {
  const mem = useRef({ day: today(), used: 0 });
  const current = useCallback((): number => {
    const day = today();
    if (mem.current.day !== day) mem.current = { day, used: 0 };
    mem.current.used = Math.max(mem.current.used, readStored(day));
    return mem.current.used;
  }, []);
  const [used, setUsed] = useState(current);

  const running = active && !unlimited;
  useEffect(() => {
    if (!running) return;
    let ticks = 0;
    const t = window.setInterval(() => {
      const n = Math.min(FREE_FLAG_SECONDS, current() + 1);
      mem.current.used = n;
      setUsed(n);
      if (++ticks % 5 === 0 || n >= FREE_FLAG_SECONDS) {
        try {
          localStorage.setItem(KEY, JSON.stringify({ day: mem.current.day, used: n }));
        } catch {
          /* sem armazenamento */
        }
      }
    }, 1000);
    return () => {
      window.clearInterval(t);
      try {
        localStorage.setItem(KEY, JSON.stringify({ day: mem.current.day, used: mem.current.used }));
      } catch {
        /* sem armazenamento */
      }
    };
  }, [running, current]);

  // Virada do dia / outra aba: relê ao voltar.
  useEffect(() => {
    const sync = () => setUsed(current());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [current]);

  const remaining = unlimited ? Infinity : Math.max(0, FREE_FLAG_SECONDS - used);
  return { remaining, exhausted: !unlimited && remaining <= 0 };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const rr = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
}
