import { useEffect, useRef, useState } from "react";
import { SIGN_ID_RE } from "@manifestacao/shared";
import { fetchActiveSigns } from "../net/signs.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";

export interface SignData {
  text: string;
  color: string;
}

/**
 * Cartazes visíveis na cena. O presence só carrega o ID; o texto vem SEMPRE do
 * banco (só cartazes ativos/pagos são legíveis), então ninguém exibe texto
 * arbitrário — no máximo mostra um cartaz de outra pessoa que já foi aprovado.
 */
export function useSigns(remoteIds: string[], playersRef: { current: Map<string, RemotePlayer> }, ownSignId: string | null) {
  const [signs, setSigns] = useState<Map<string, SignData>>(new Map());
  // IDs já consultados (achados ou não): não repete a consulta.
  const askedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const wanted = new Set<string>();
    if (ownSignId && SIGN_ID_RE.test(ownSignId)) wanted.add(ownSignId);
    for (const id of remoteIds) {
      const sid = playersRef.current.get(id)?.signId;
      if (sid && SIGN_ID_RE.test(sid)) wanted.add(sid);
    }
    const missing = [...wanted].filter((id) => !askedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => askedRef.current.add(id));
    let cancelled = false;
    void fetchActiveSigns(missing).then((rows) => {
      if (cancelled || rows.length === 0) return;
      setSigns((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, { text: r.text, color: r.color });
        return next;
      });
    });
    return () => {
      cancelled = true;
      // Consulta cancelada não conta como feita.
      missing.forEach((id) => askedRef.current.delete(id));
    };
  }, [remoteIds, playersRef, ownSignId]);

  return signs;
}
