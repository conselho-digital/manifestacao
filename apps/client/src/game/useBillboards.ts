import { useEffect, useState } from "react";
import type { BillboardAd } from "@manifestacao/shared";
import { fetchActiveBids, subscribeBids } from "../net/billboards.js";

/** Lance no ar de cada telão (chave = billboard_id). Carrega ao entrar e segue o Realtime. */
export function useBillboards(enabled: boolean): Map<string, BillboardAd> {
  const [ads, setAds] = useState<Map<string, BillboardAd>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchActiveBids().then((rows) => {
      if (cancelled) return;
      setAds((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.billboard_id, r);
        return next;
      });
    });
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
    );
    return () => {
      cancelled = true;
      unsubscribe();
      setAds(new Map());
    };
  }, [enabled]);

  return ads;
}
