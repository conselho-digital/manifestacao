import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AVENUE_CHANNEL,
  BROADCAST,
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  TEAM_IDS,
  isCharacterId,
  isFlagId,
  isTeamId,
  isVehicleId,
  type AvatarConfig,
  type ChatBroadcast,
  type Facing,
  type FlagId,
  type MoveBroadcast,
  type PresenceState,
  type TeamId,
  type VehicleId,
} from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";

export interface RemotePlayer extends PresenceState {
  x: number;
  z: number;
  facing: Facing;
  vehicle: VehicleId;
}

/** Mensagem de chat com chave local estável para render no React. */
export interface ChatEntry extends ChatBroadcast {
  key: number;
}

const MAX_CHAT = 30;

function emptyScores(): Record<TeamId, number> {
  return Object.fromEntries(TEAM_IDS.map((t) => [t, 0])) as Record<TeamId, number>;
}

/**
 * Sanitiza um PresenceState vindo da rede: outro cliente conectado ao canal
 * (chave anônima pública) pode enviar `channel.track()` com qualquer payload,
 * incluindo tipos errados (nickname como objeto, por exemplo), o que
 * quebraria o render React de todo mundo que recebesse esse jogador. Nunca
 * confiar nesses campos sem validar/coagir para o tipo esperado.
 */
function sanitizePresence(id: string, p: unknown): PresenceState {
  const raw = (p ?? {}) as Partial<Record<keyof PresenceState, unknown>>;
  return {
    id,
    nickname: String(raw.nickname ?? "Anônimo").slice(0, MAX_NICKNAME_LENGTH),
    team: isTeamId(raw.team) ? raw.team : "neutro",
    shirt: typeof raw.shirt === "number" && Number.isFinite(raw.shirt) ? raw.shirt : 0x8b97a3,
    character: isCharacterId(raw.character) ? raw.character : "comum",
    flag: isFlagId(raw.flag) ? raw.flag : "nenhuma",
  };
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
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const chatKey = useRef(0);

  // Acrescenta uma mensagem ao log, validando o campo `team` vindo da rede.
  const pushChat = useCallback((c: ChatBroadcast) => {
    const safe: ChatEntry = {
      id: String(c.id ?? ""),
      nickname: String(c.nickname ?? "").slice(0, 40),
      team: isTeamId(c.team) ? c.team : "neutro",
      text: String(c.text ?? "").slice(0, MAX_CHAT_LENGTH),
      key: chatKey.current++,
    };
    setChatLog((log) => [...log.slice(-(MAX_CHAT - 1)), safe]);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const presence: PresenceState = {
      id: selfId,
      nickname: self.nickname,
      team: self.team,
      shirt: self.shirt,
      character: self.character,
      flag: self.flag,
    };

    const channel = supabase.channel(AVENUE_CHANNEL, {
      config: { presence: { key: selfId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        // Chaveamos pela chave REAL de presence (atribuída pelo Supabase a
        // partir de config.presence.key), não por um campo `id` autodeclarado
        // no payload — evita que alguém se identifique com o id de outro
        // jogador já conectado.
        const state = channel.presenceState<PresenceState>();
        const next = emptyScores();
        const seen = new Set<string>();
        for (const [presenceKey, entries] of Object.entries(state)) {
          const raw = entries[0];
          seen.add(presenceKey);
          const safe = sanitizePresence(presenceKey, raw);
          if (safe.team in next) next[safe.team] += 1;
          if (presenceKey === selfId) continue;
          const existing = playersRef.current.get(presenceKey);
          if (existing) {
            // Já conhecido: atualiza o visual (nickname/time/personagem/
            // bandeira podem ter mudado) mantendo posição/facing/veículo
            // atuais, que vêm do broadcast de move, não do presence.
            Object.assign(existing, safe);
          } else {
            playersRef.current.set(presenceKey, { ...safe, x: 0, z: 0, facing: "down", vehicle: "nenhum" });
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
          if (isVehicleId(m.vehicle)) existing.vehicle = m.vehicle;
          if (isFlagId(m.flag)) existing.flag = m.flag;
        }
      })
      .on("broadcast", { event: BROADCAST.chat }, ({ payload }) => {
        if (payload?.id !== selfId) pushChat(payload as ChatBroadcast);
      })
      .subscribe((status) => {
        const subscribed = status === "SUBSCRIBED";
        setOnline(subscribed);
        if (subscribed) void channel.track(presence);
      });

    return () => {
      setOnline(false);
      playersRef.current.clear();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selfId, self.nickname, self.team, self.shirt, self.character, self.flag]);

  const sendMove = useCallback(
    (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId) => {
      const channel = channelRef.current;
      if (!channel) return;
      const payload: MoveBroadcast = { id: selfId, x, z, facing, vehicle, flag };
      void channel.send({ type: "broadcast", event: BROADCAST.move, payload });
    },
    [selfId],
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
      if (!trimmed) return;
      const payload: ChatBroadcast = {
        id: selfId,
        nickname: self.nickname,
        team: self.team,
        text: trimmed,
      };
      // Mostra a própria mensagem localmente (broadcast não ecoa pro remetente).
      pushChat(payload);
      const channel = channelRef.current;
      if (channel) {
        void channel.send({ type: "broadcast", event: BROADCAST.chat, payload });
      }
    },
    [selfId, self.nickname, self.team, pushChat],
  );

  return { selfId, playersRef, online, scores, chatLog, remoteIds, sendMove, sendChat };
}
