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
          if (alive) setAds(new Map(rows.map((r) => [r.billboard_id, r])));
        });
      },
    );
    return () => {
      alive = false;
      unsubscribe();
      setAds(new Map());
    };
  }, [enabled]);

  return ads;
}
