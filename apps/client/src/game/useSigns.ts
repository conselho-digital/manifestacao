import { useEffect, useRef, useState } from "react";
import { SIGN_ID_RE } from "@manifestacao/shared";
import { fetchActiveSigns, subscribeSignRefunds } from "../net/signs.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";

export interface SignData {
  text: string;
  color: string;
}

/** Teto de ids consultados guardados (presence forjado com UUIDs aleatórios não cresce a memória sem fim). */
const MAX_ASKED = 200;
/** Quanto esperar antes de consultar de novo um id que não veio (ex.: cartaz recém-pago). */
const RETRY_MS = 15_000;

/**
 * Cartazes visíveis na cena. O presence só carrega o ID; o texto vem SEMPRE do
 * banco (só cartazes ativos/pagos são legíveis), então ninguém exibe texto
 * arbitrário — no máximo mostra um cartaz de outra pessoa que já foi aprovado.
 */
export function useSigns(remoteIds: string[], playersRef: { current: Map<string, RemotePlayer> }, ownSignId: string | null) {
  const [signs, setSigns] = useState<Map<string, SignData>>(new Map());
  // id → quando foi consultado (achado ou não).
  const askedRef = useRef<Map<string, number>>(new Map());
  const [tick, setTick] = useState(0);

  // Chave estável dos ids desejados: o array de ids remotos muda de identidade a cada sync de presence.
  const wanted = new Set<string>();
  if (ownSignId && SIGN_ID_RE.test(ownSignId)) wanted.add(ownSignId);
  for (const id of remoteIds) {
    const sid = playersRef.current.get(id)?.signId;
    if (sid && SIGN_ID_RE.test(sid)) wanted.add(sid);
  }
  const wantedKey = [...wanted].sort().join(",");

  // Reconsulta periodicamente o que ainda não veio (cartaz que acabou de virar ativo).
  const missingKey = [...wanted].filter((id) => !signs.has(id)).join(",");
  useEffect(() => {
    if (!missingKey) return;
    const t = setInterval(() => setTick((n) => n + 1), RETRY_MS);
    return () => clearInterval(t);
  }, [missingKey]);

  useEffect(() => {
    const now = Date.now();
    const missing = wantedKey
      .split(",")
      .filter(Boolean)
      .filter((id) => {
        const at = askedRef.current.get(id);
        return at === undefined || (!signs.has(id) && now - at >= RETRY_MS);
      });
    if (missing.length === 0) return;
    for (const id of missing) askedRef.current.set(id, now);
    // Mantém o teto: descarta os mais antigos.
    while (askedRef.current.size > MAX_ASKED) {
      const oldest = askedRef.current.keys().next().value;
      if (oldest === undefined) break;
      askedRef.current.delete(oldest);
    }
    // Sem cancelar ao mudar a lista (isso acontece a cada entrada/saída de jogador e descartava o resultado):
    // o resultado é sempre guardado — setState após desmontar é inofensivo.
    void fetchActiveSigns(missing).then((rows) => {
      if (rows.length === 0) return;
      setSigns((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, { text: r.text, color: r.color });
        return next;
      });
    });
    // `signs` fica de fora de propósito: só reconsulta quando a lista desejada ou o relógio de retry mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, tick]);

  // Cartaz estornado sai da cena na hora.
  useEffect(
    () =>
      subscribeSignRefunds((id) => {
        askedRef.current.delete(id);
        setSigns((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }),
    [],
  );

  return signs;
}
