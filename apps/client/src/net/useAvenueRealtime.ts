import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AVENUE_CHANNEL,
  BROADCAST,
  TEAM_IDS,
  type AvatarConfig,
  type ChatBroadcast,
  type Facing,
  type MoveBroadcast,
  type PresenceState,
  type TeamId,
} from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";

export interface RemotePlayer extends PresenceState {
  x: number;
  z: number;
  facing: Facing;
}

const MAX_CHAT = 30;

function emptyScores(): Record<TeamId, number> {
  return Object.fromEntries(TEAM_IDS.map((t) => [t, 0])) as Record<TeamId, number>;
}

/**
 * Multiplayer MVP sobre Supabase Realtime: presence (quem está online, por
 * time) + broadcast (movimento e chat). Não autoritativo (CLAUDE.md §4).
 * Em modo offline (sem credenciais) vira no-op e o jogo roda só local.
 */
export function useAvenueRealtime(self: AvatarConfig) {
  const selfId = useMemo(
    () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    [],
  );
  // Posições dos outros jogadores: ref lido a cada frame pela cena (sem re-render).
  const playersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [online, setOnline] = useState(false);
  const [scores, setScores] = useState<Record<TeamId, number>>(emptyScores);
  const [chatLog, setChatLog] = useState<ChatBroadcast[]>([]);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const presence: PresenceState = {
      id: selfId,
      nickname: self.nickname,
      team: self.team,
      shirt: self.shirt,
    };

    const channel = supabase.channel(AVENUE_CHANNEL, {
      config: { presence: { key: selfId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const next = emptyScores();
        const seen = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const p of entries) {
            seen.add(p.id);
            if (p.team in next) next[p.team] += 1;
            if (p.id !== selfId && !playersRef.current.has(p.id)) {
              playersRef.current.set(p.id, { ...p, x: 0, z: 0, facing: "down" });
            }
          }
        }
        // Remove quem saiu.
        for (const id of playersRef.current.keys()) {
          if (!seen.has(id)) playersRef.current.delete(id);
        }
        setScores(next);
        setRemoteIds([...playersRef.current.keys()]);
      })
      .on("broadcast", { event: BROADCAST.move }, ({ payload }) => {
        const m = payload as MoveBroadcast;
        if (m.id === selfId) return;
        const existing = playersRef.current.get(m.id);
        if (existing) {
          existing.x = m.x;
          existing.z = m.z;
          existing.facing = m.facing;
        }
      })
      .on("broadcast", { event: BROADCAST.chat }, ({ payload }) => {
        const c = payload as ChatBroadcast;
        setChatLog((log) => [...log.slice(-(MAX_CHAT - 1)), c]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setOnline(true);
          void channel.track(presence);
        }
      });

    return () => {
      setOnline(false);
      playersRef.current.clear();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selfId, self.nickname, self.team, self.shirt]);

  const sendMove = useCallback(
    (x: number, z: number, facing: Facing) => {
      const channel = channelRef.current;
      if (!channel) return;
      const payload: MoveBroadcast = { id: selfId, x, z, facing };
      void channel.send({ type: "broadcast", event: BROADCAST.move, payload });
    },
    [selfId],
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const payload: ChatBroadcast = {
        id: selfId,
        nickname: self.nickname,
        team: self.team,
        text: trimmed,
      };
      // Mostra a própria mensagem localmente (broadcast não ecoa pro remetente).
      setChatLog((log) => [...log.slice(-(MAX_CHAT - 1)), payload]);
      const channel = channelRef.current;
      if (channel) {
        void channel.send({ type: "broadcast", event: BROADCAST.chat, payload });
      }
    },
    [selfId, self.nickname, self.team],
  );

  return { selfId, playersRef, online, scores, chatLog, remoteIds, sendMove, sendChat };
}
