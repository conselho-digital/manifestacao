import type { RealtimeChannel } from "@supabase/supabase-js";
import { cleanPlayback, setClockOffset, setPlayback, type ScreenPlayback } from "../config/parkScreen.js";
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

/** Realtime: cada comando do admin chega na hora. Devolve a função que cancela. */
export function subscribePlayback(onChange: (pb: ScreenPlayback | null) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel: RealtimeChannel = supabase
    .channel("outdoor-playback")
    .on("postgres_changes", { event: "*", schema: "public", table: "game_config", filter: "key=eq.screen_playback" }, (p) => {
      const row = p.new as { value?: unknown } | null;
      const pb = cleanPlayback(row?.value);
      setPlayback(pb);
      onChange(pb);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
