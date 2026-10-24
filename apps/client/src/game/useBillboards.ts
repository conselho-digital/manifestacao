import { useEffect, useState } from "react";
import type { BillboardAd } from "@manifestacao/shared";
import { fetchActiveBids, subscribeBids } from "../net/billboards.js";

/** Lance no ar de cada telão (chave = billboard_id). Carrega ao entrar e segue o Realtime. */
export function useBillboards(enabled: boolean): Map<string, BillboardAd> {
  const [ads, setAds] = useState<Map<string, BillboardAd>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // Assina primeiro e carrega no SUBSCRIBED (e a cada reconexão): o carregamento SUBSTITUI o mapa,
    // então um lance superado não reaparece e eventos perdidos são recuperados.
    const unsubscribe = subscribeBids(
      (ad) => setAds((prev) => new Map(prev).set(ad.billboard_id, ad)),
      (id) =>
        setAds((prev) => {
          const entry = [...prev.entries()].find(([, v]) => v.id === id);
          if (!entry) return prev;
          const next = new Map(prev);
          next.delete(entry[0]);
          return next;
        }),
      () => {
        void fetchActiveBids().then((rows) => {
          if (alive && rows) setAds(new Map(rows.map((r) => [r.billboard_id, r])));
        });
      },
    );
    // Passou das 12 h: o anúncio sai do telão (checa a cada 30 s).
    const expiry = setInterval(() => {
      const now = Date.now();
      setAds((prev) => {
        const gone = [...prev.entries()].filter(([, a]) => a.expires_at && Date.parse(a.expires_at) <= now);
        if (gone.length === 0) return prev;
        const next = new Map(prev);
        for (const [k] of gone) next.delete(k);
        return next;
      });
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(expiry);
      unsubscribe();
      setAds(new Map());
    };
  }, [enabled]);

  return ads;
}
