import { useEffect, useState } from "react";
import { getSupabase } from "../net/supabase.js";

export interface CatalogItem {
  id: string;
  kind: "character" | "flag" | "vehicle";
  label: string;
  price_cents: number;
}

/** Catálogo público (tabela `catalog_items`, leitura liberada a todos). */
export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("catalog_items")
      .select("id, kind, label, price_cents")
      .eq("active", true)
      .then(({ data }) => {
        if (!cancelled) {
          setItems(data ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}
