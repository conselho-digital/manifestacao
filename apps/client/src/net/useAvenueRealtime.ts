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
  SIGN_ID_RE,
  type ChatBroadcast,
  type Facing,
  type FlagId,
  type MoveBroadcast,
  type PresenceState,
  type SprayBroadcast,
  type TeamId,
  type VehicleId,
} from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";
import {
  SPRAY_CLEANUP_INTERVAL_MS,
  SPRAY_ID_MAX_LENGTH,
  SPRAY_LIFETIME_MS,
  SPRAY_MAX_MARKS,
  SPRAY_MIN_INTERVAL_MS,
  type SprayMark,
} from "../game/spray.js";
import { clampToAvenue } from "../game/world.js";
import { DEFAULT_SPRAY_ID, SPRAY_SLUG_RE, sprayOptions } from "../config/sprays.js";

/** `typeof === "number"` deixa passar NaN/Infinity; isto não. */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Insere uma marca de spray e aplica o limite SPRAY_MAX_MARKS — usado tanto
 * para marcas recebidas de outros jogadores quanto para a própria (antes
 * só o handler de broadcast recebido aparava o mapa; a própria marca do
 * jogador nunca passava por ali, podendo passar do limite ao longo de uma
 * sessão longa).
 */
function addSprayMark(map: Map<string, SprayMark>, mark: SprayMark): void {
  map.set(mark.id, mark);
  while (map.size > SPRAY_MAX_MARKS) {
    const oldestId = map.keys().next().value;
    if (oldestId === undefined) break;
    map.delete(oldestId);
  }
}

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
/** Limites de recepção (anti-flood): jogadores na cena, intervalo mínimo por remetente. */
const MAX_REMOTE_PLAYERS = 200;
const MOVE_MIN_INTERVAL_MS = 40;
const CHAT_MIN_INTERVAL_MS = 500;
/** Teto global de marcas de spray recebidas por segundo (todos os remetentes somados). */
const MAX_SPRAYS_PER_SECOND = 5;
const FACINGS: ReadonlySet<unknown> = new Set(["up", "down", "left", "right"]);

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
    signId: typeof raw.signId === "string" && SIGN_ID_RE.test(raw.signId) ? raw.signId : undefined,
  };
}

/**
 * Multiplayer MVP sobre Supabase Realtime: presence (quem está online, por
 * time) + broadcast (movimento e chat). Não autoritativo (CLAUDE.md §4).
 * Em modo offline (sem credenciais) vira no-op e o jogo roda só local.
 */
export function useAvenueRealtime(self: AvatarConfig, signedIn: boolean, signId: string | null = null) {
  const selfId = useMemo(
    () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    [],
  );
  // Posições dos outros jogadores: ref lido a cada frame pela cena (sem re-render).
  const playersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<PresenceState | null>(null);
  const selfFlagRef = useRef(self.flag);
  selfFlagRef.current = self.flag;
  const signIdRef = useRef(signId);
  signIdRef.current = signId;

  const [online, setOnline] = useState(false);
  const [scores, setScores] = useState<Record<TeamId, number>>(emptyScores);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const chatKey = useRef(0);

  // Marcas de spray: efêmeras, só em memória (nunca em banco — CLAUDE.md §3).
  // Mapa + contador de versão (em vez de guardar o array no state) evita
  // recriar a lista inteira a cada marca nova.
  const sprayMarksRef = useRef<Map<string, SprayMark>>(new Map());
  const [sprayVersion, setSprayVersion] = useState(0);
  // Último spray aceito de cada remetente (chave de presence) — limita a
  // taxa na RECEPÇÃO, então um cliente malicioso não derruba todo mundo só
  // por ignorar o próprio cooldown de envio.
  const lastSprayBySenderRef = useRef<Map<string, number>>(new Map());
  const lastOwnSprayAtRef = useRef(0);
  // Teto GLOBAL de recepção de spray (o senderId vem do payload e pode ser forjado).
  const sprayBucketRef = useRef({ t: 0, n: 0 });
  // Limites de recepção por remetente (chat/movimento) e último movimento
  // próprio — reenviado quando alguém entra, pra não aparecermos parados na
  // origem (0,0) pra quem acabou de chegar.
  const lastMoveBySenderRef = useRef<Map<string, number>>(new Map());
  const lastChatBySenderRef = useRef<Map<string, number>>(new Map());
  const lastMoveRef = useRef<MoveBroadcast | null>(null);
  const lastAnnounceAtRef = useRef(0);

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
    // Conta obrigatória: sem sessão o cliente nem tenta entrar no canal (o
    // banco também recusa — canal privado, policies em realtime.messages).
    if (!supabase || !signedIn) return;

    const presence: PresenceState = {
      id: selfId,
      nickname: self.nickname,
      team: self.team,
      shirt: self.shirt,
      character: self.character,
      flag: self.flag,
      signId: signIdRef.current && SIGN_ID_RE.test(signIdRef.current) ? signIdRef.current : undefined,
    };
    presenceRef.current = presence;

    // Canal PRIVADO: só quem está logado entra (policies em realtime.messages,
    // migration 0009). A chave de presence é o nosso id de sessão.
    const channel = supabase.channel(AVENUE_CHANNEL, {
      config: { private: true, presence: { key: selfId } },
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
          // Teto de jogadores: presence com chave inventada por um cliente
          // malicioso não pode inflar a cena de todo mundo.
          if (!existing && playersRef.current.size >= MAX_REMOTE_PLAYERS) continue;
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
      .on("presence", { event: "join" }, ({ key }) => {
        // Alguém entrou: reenvia a nossa posição (no máx. 1x/s) pra ele nos
        // ver onde estamos, e não na origem.
        if (key === selfId) return;
        const now = Date.now();
        const last = lastMoveRef.current;
        if (!last || now - lastAnnounceAtRef.current < 1000) return;
        lastAnnounceAtRef.current = now;
        void channel.send({ type: "broadcast", event: BROADCAST.move, payload: last });
      })
      .on("broadcast", { event: BROADCAST.move }, ({ payload }) => {
        const m = payload as MoveBroadcast;
        if (m?.id === selfId) return;
        if (!isFiniteNumber(m?.x) || !isFiniteNumber(m?.z)) return; // NaN/Infinity: ignora
        if (typeof m.id !== "string" || m.id.length > 64) return;
        const nowMove = Date.now();
        if (nowMove - (lastMoveBySenderRef.current.get(m.id) ?? 0) < MOVE_MIN_INTERVAL_MS) return;
        lastMoveBySenderRef.current.set(m.id, nowMove);
        const existing = playersRef.current.get(m.id);
        if (existing) {
          const safePos = clampToAvenue(m.x, m.z);
          existing.x = safePos.x;
          existing.z = safePos.z;
          if (FACINGS.has(m.facing)) existing.facing = m.facing;
          if (isVehicleId(m.vehicle)) existing.vehicle = m.vehicle;
          if (isFlagId(m.flag)) existing.flag = m.flag;
        }
      })
      .on("broadcast", { event: BROADCAST.chat }, ({ payload }) => {
        const c = payload as ChatBroadcast;
        if (typeof c?.id !== "string" || c.id === selfId || c.id.length > 64) return;
        const nowChat = Date.now();
        if (nowChat - (lastChatBySenderRef.current.get(c.id) ?? 0) < CHAT_MIN_INTERVAL_MS) return;
        lastChatBySenderRef.current.set(c.id, nowChat);
        pushChat(c);
      })
      .on("broadcast", { event: BROADCAST.spray }, ({ payload }) => {
        const s = payload as SprayBroadcast;
        if (
          typeof s?.id !== "string" ||
          s.id.length === 0 ||
          s.id.length > SPRAY_ID_MAX_LENGTH ||
          !isFiniteNumber(s.x) ||
          !isFiniteNumber(s.z) ||
          !isFiniteNumber(s.color)
        ) {
          return; // payload malformado/hostil vindo da rede: ignora
        }
        if (typeof s.senderId !== "string" || s.senderId.length === 0 || s.senderId.length > SPRAY_ID_MAX_LENGTH) {
          return;
        }
        // Rate limit de recepção por remetente real: aplicado por quem
        // RECEBE, então um remetente que ignore o próprio cooldown de envio
        // ainda não consegue inundar o canal — todo cliente descarta o
        // excesso da mesma forma.
        const now = Date.now();
        const bucket = sprayBucketRef.current;
        if (now - bucket.t > 1000) {
          bucket.t = now;
          bucket.n = 0;
        }
        if (++bucket.n > MAX_SPRAYS_PER_SECOND) return;
        const last = lastSprayBySenderRef.current.get(s.senderId) ?? 0;
        if (now - last < SPRAY_MIN_INTERVAL_MS) return;
        const bySender = lastSprayBySenderRef.current;
        bySender.set(s.senderId, now);
        // Limita o mapa de remetentes (ids forjados não podem crescê-lo sem fim).
        while (bySender.size > 500) {
          const oldest = bySender.keys().next().value;
          if (oldest === undefined) break;
          bySender.delete(oldest);
        }

        const pos = clampToAvenue(s.x, s.z);
        const color = Math.max(0, Math.min(0xffffff, Math.trunc(s.color)));
        // Estilo vindo da rede: só aceita slug conhecido, senão cai no clássico.
        const style =
          typeof s.style === "string" && SPRAY_SLUG_RE.test(s.style) && sprayOptions().some((o) => o.id === s.style)
            ? s.style
            : DEFAULT_SPRAY_ID;
        addSprayMark(sprayMarksRef.current, {
          id: s.id,
          x: pos.x,
          z: pos.z,
          color,
          style,
          // Bandeira do remetente vem da presence dele (não do payload do spray).
          flag: playersRef.current.get(s.senderId)?.flag,
          createdAt: now,
        });
        setSprayVersion((v) => v + 1);
      })
      .subscribe((status) => {
        const subscribed = status === "SUBSCRIBED";
        setOnline(subscribed);
        if (subscribed) {
          void channel.track(presenceRef.current ?? presence);
          // Canal refeito (ex.: troca de equipe): reenvia onde estamos.
          if (lastMoveRef.current) {
            void channel.send({ type: "broadcast", event: BROADCAST.move, payload: lastMoveRef.current });
          }
        }
      });

    return () => {
      setOnline(false);
      playersRef.current.clear();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selfId, signedIn, self.nickname, self.team, self.shirt, self.character, self.flag]);

  // Trocar de cartaz só atualiza o presence (não derruba o canal).
  useEffect(() => {
    const channel = channelRef.current;
    const base = presenceRef.current;
    if (!channel || !base || channel.state !== "joined") return;
    const next: PresenceState = { ...base, signId: signId && SIGN_ID_RE.test(signId) ? signId : undefined };
    presenceRef.current = next;
    void channel.track(next);
  }, [signId]);

  const sendMove = useCallback(
    (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId) => {
      const channel = channelRef.current;
      lastMoveRef.current = { id: selfId, x, z, facing, vehicle, flag };
      // "joined" = handshake do canal concluído (equivalente ao status
      // SUBSCRIBED do callback de .subscribe()); antes disso o Realtime
      // descarta o send silenciosamente — evita mandar para o vazio logo
      // ao montar a cena.
      if (!channel || channel.state !== "joined") return;
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
      if (channel && channel.state === "joined") {
        void channel.send({ type: "broadcast", event: BROADCAST.chat, payload });
      }
    },
    [selfId, self.nickname, self.team, pushChat],
  );

  const sendSpray = useCallback(
    (x: number, z: number, color: number, style: string): boolean => {
      // Cooldown próprio: defesa adicional (o cartucho em Game.tsx já limita
      // o uso pela UI, mas isso é chamável direto, ex. via DevTools — o
      // cooldown de recepção no handler acima é quem garante o limite de
      // verdade para os outros clientes; este aqui evita gastar cartucho
      // mandando mensagens que serão descartadas do outro lado mesmo assim).
      const now = Date.now();
      if (now - lastOwnSprayAtRef.current < SPRAY_MIN_INTERVAL_MS) return false;
      lastOwnSprayAtRef.current = now;

      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
      const pos = clampToAvenue(x, z);
      // Mostra a própria marca localmente (broadcast não ecoa pro remetente);
      // também passa pelo limite de SPRAY_MAX_MARKS, igual às recebidas.
      addSprayMark(sprayMarksRef.current, { id, x: pos.x, z: pos.z, color, style, flag: selfFlagRef.current, createdAt: now });
      setSprayVersion((v) => v + 1);
      const channel = channelRef.current;
      if (channel && channel.state === "joined") {
        const payload: SprayBroadcast = { id, senderId: selfId, x: pos.x, z: pos.z, color, style };
        void channel.send({ type: "broadcast", event: BROADCAST.spray, payload });
      }
      return true;
    },
    [selfId],
  );

  // Limpeza periódica das marcas expiradas — independente da conexão
  // (funciona também offline, onde as marcas são só locais).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, mark] of sprayMarksRef.current) {
        if (now - mark.createdAt > SPRAY_LIFETIME_MS) {
          sprayMarksRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) setSprayVersion((v) => v + 1);

      // O mapa de rate-limit por remetente não está sujeito a SPRAY_MAX_MARKS
      // (é por remetente, não por marca); sem isto cresceria sem fim ao
      // longo de uma sessão longa com muitos jogadores passando.
      for (const [sender, last] of lastSprayBySenderRef.current) {
        if (now - last > SPRAY_LIFETIME_MS) lastSprayBySenderRef.current.delete(sender);
      }
    }, SPRAY_CLEANUP_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return {
    selfId,
    playersRef,
    online,
    scores,
    chatLog,
    remoteIds,
    sprayMarksRef,
    sprayVersion,
    sendMove,
    sendChat,
    sendSpray,
  };
}
