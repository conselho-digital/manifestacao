import type { RealtimeChannel } from "@supabase/supabase-js";
import { cleanPlayback, cleanScreen, setClockOffset, setParkScreen, setPlayback, type ScreenPlayback } from "../config/parkScreen.js";
import { getSupabase } from "./supabase.js";

/** Acerta o relógio com o do servidor (para o "onde o vídeo deveria estar agora" bater entre aparelhos). */
export async function syncServerClock(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const t0 = Date.now();
  const { data, error } = await supabase.rpc("server_time");
  if (error || typeof data !== "string") return; // banco sem a migração 0025: fica com o relógio local
  const server = Date.parse(data);
  if (!Number.isFinite(server)) return;
  const t1 = Date.now();
  setClockOffset(server - (t0 + t1) / 2); // metade da ida e volta
}

/** Lê o estado mais recente da reprodução. */
export async function fetchPlayback(): Promise<ScreenPlayback | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("game_config").select("value").eq("key", "screen_playback").maybeSingle();
  return error ? null : cleanPlayback(data?.value);
}

// Um único canal Realtime para todos que acompanham o outdoor (mapa, janela e painel do admin), com contagem de usos.
let shared: { channel: RealtimeChannel; count: number } | null = null;
const listeners = new Set<(pb: ScreenPlayback | null) => void>();

function refetch(): void {
  const supabase = getSupabase();
  void supabase?.from("game_config").select("value").eq("key", "screen").maybeSingle().then(({ data, error }) => {
    if (!error) setParkScreen(cleanScreen(data?.value));
  });
  void fetchPlayback().then((pb) => {
    if (pb) {
      setPlayback(pb);
      for (const l of listeners) l(pb);
    }
  });
}

/** Realtime: cada comando do admin chega na hora; ao reconectar, relê o estado. Devolve a função que cancela. */
export function subscribePlayback(onChange: (pb: ScreenPlayback | null) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  listeners.add(onChange);
  if (!shared) {
    let first = true;
    const channel: RealtimeChannel = supabase
      .channel(`outdoor-playback-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config", filter: "key=in.(screen,screen_playback)" }, (p) => {
        const row = p.new as { key?: unknown; value?: unknown } | null;
        // Link do outdoor trocado pelo admin: vale na hora para quem já está jogando.
        if (row?.key === "screen" || (p.eventType === "DELETE" && (p.old as { key?: unknown } | null)?.key === "screen")) {
          setParkScreen(p.eventType === "DELETE" ? null : cleanScreen(row?.value));
          return;
        }
        const pb = cleanPlayback(row?.value);
        setPlayback(pb);
        for (const l of listeners) l(pb);
      })
      .subscribe((status) => {
        // Voltou de uma queda: o que o admin mandou nesse meio-tempo não chegou, então lê de novo.
        if (status === "SUBSCRIBED") {
          if (!first) refetch();
          first = false;
        }
      });
    shared = { channel, count: 0 };
  }
  shared.count += 1;
  return () => {
    listeners.delete(onChange);
    if (!shared) return;
    shared.count -= 1;
    if (shared.count <= 0) {
      void supabase.removeChannel(shared.channel);
      shared = null;
    }
  };
}
