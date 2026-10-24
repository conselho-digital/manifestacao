import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AVENUE_CHANNEL,
  BROADCAST,
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  TEAM_IDS,
  DEFAULT_CHARACTER,
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
  type HitBroadcast,
  type ImpactBroadcast,
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
  sanitizeSprayPlacement,
  sanitizeSprayRot,
  type SprayAim,
  type SprayMark,
} from "../game/spray.js";
import { clampToAvenue } from "../game/world.js";
import { strikeSeconds, type StrikeKind } from "../game/strike.js";
import { FALL_SECONDS, newKnockRefs, registerHit, STRIKE_RANGE } from "../game/knock.js";
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
  /** Direção do veículo (radianos) e quanto a moto está empinada (0..1), vindos do broadcast de movimento. */
  heading: number;
  wheelie: number;
  vehicle: VehicleId;
  /** Quando (performance.now deste aparelho) o jogador deu o último golpe com a bandeira; 0 = nenhum. */
  hitAt?: number;
  hitKind?: StrikeKind;
  /** Início (performance.now) da última reação a golpe e da última queda deste jogador. */
  reactAt?: number;
  fallAt?: number;
}

/** Mensagem de chat com chave local estável para render no React. */
export interface ChatEntry extends ChatBroadcast {
  key: number;
}

const MAX_CHAT = 30;
/** Limites de recepção (anti-flood): jogadores na cena, intervalo mínimo por remetente. */
const MAX_REMOTE_PLAYERS = 200;
const MOVE_MIN_INTERVAL_MS = 40;
/** Velocidade máx. aceita de um jogador remoto (u/s): a moto esportiva faz ~17; o dobro cobre jitter de rede. */
const MAX_REMOTE_SPEED = 34;
const CHAT_MIN_INTERVAL_MS = 500;
/** Teto global de marcas de spray recebidas por segundo (todos os remetentes somados). */
const MAX_SPRAYS_PER_SECOND = 5;
const FACINGS: ReadonlySet<unknown> = new Set(["up", "down", "left", "right"]);

/** Mapas de rate limit chaveados por id vindo da rede (forjável): descarta os mais antigos acima do teto. */
function capMap<V>(map: Map<string, V>, max: number): void {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

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
    shirt: typeof raw.shirt === "number" && Number.isInteger(raw.shirt) && raw.shirt >= 0 && raw.shirt <= 0xffffff ? raw.shirt : 0x8b97a3,
    character: isCharacterId(raw.character) ? raw.character : DEFAULT_CHARACTER,
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
  // Palanque com voz: quem usa registra aqui o tratador das mensagens de sinalização (payload cru da rede).
  const voiceHandlerRef = useRef<((payload: unknown) => void) | null>(null);
  const presenceRef = useRef<PresenceState | null>(null);
  const selfFlagRef = useRef(self.flag);
  selfFlagRef.current = self.flag;
  const selfTeamRef = useRef(self.team);
  selfTeamRef.current = self.team;
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
  // Golpes de bandeira: contagem por alvo, limite de recepção e o estado de reação/queda do jogador local.
  const hitCountsRef = useRef<Map<string, { n: number; at: number }>>(new Map());
  const lastImpactBySenderRef = useRef<Map<string, number>>(new Map());
  const selfKnockRef = useRef(newKnockRefs());
  // Teto GLOBAL de recepção de spray (o senderId vem do payload e pode ser forjado).
  const sprayBucketRef = useRef({ t: 0, n: 0 });
  // Limites de recepção por remetente (chat/movimento) e último movimento
  // próprio — reenviado quando alguém entra, pra não aparecermos parados na
  // origem (0,0) pra quem acabou de chegar.
  const lastMoveBySenderRef = useRef<Map<string, number>>(new Map());
  const lastChatBySenderRef = useRef<Map<string, number>>(new Map());
  const lastPosBySenderRef = useRef<Map<string, { x: number; z: number; t: number }>>(new Map());
  const lastMoveRef = useRef<MoveBroadcast | null>(null);
  // Último anúncio de posição por jogador que entrou (limite de 1/s POR JOGADOR, não global).
  const lastAnnounceByKeyRef = useRef<Map<string, number>>(new Map());

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
            playersRef.current.set(presenceKey, { ...safe, x: 0, z: 0, facing: "down", vehicle: "nenhum", heading: 0, wheelie: 0 });
          }
        }
        // Remove quem saiu.
        for (const id of playersRef.current.keys()) {
          if (!seen.has(id)) {
            playersRef.current.delete(id);
            lastPosBySenderRef.current.delete(id); // volta em outro ponto sem ser tratado como teleporte
          }
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
        const announced = lastAnnounceByKeyRef.current;
        if (!last || now - (announced.get(key) ?? 0) < 1000) return;
        announced.set(key, now);
        capMap(announced, 300);
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
        capMap(lastMoveBySenderRef.current, 500);
        const existing = playersRef.current.get(m.id);
        if (existing) {
          let safePos = clampToAvenue(m.x, m.z);
          // Anti-teleporte básico: ninguém anda mais rápido que o veículo mais veloz (com folga para a rede).
          // Passo maior que o possível é cortado; a posição "alcança" em poucos pacotes se for legítima (lag).
          const last = lastPosBySenderRef.current.get(m.id);
          if (last) {
            const dt = Math.max(0.05, (nowMove - last.t) / 1000);
            const maxStep = MAX_REMOTE_SPEED * Math.min(dt, 1.5);
            const dx = safePos.x - last.x;
            const dz = safePos.z - last.z;
            const dist = Math.hypot(dx, dz);
            if (dist > maxStep) safePos = { x: last.x + (dx / dist) * maxStep, z: last.z + (dz / dist) * maxStep };
          }
          lastPosBySenderRef.current.set(m.id, { x: safePos.x, z: safePos.z, t: nowMove });
          capMap(lastPosBySenderRef.current, 500);
          existing.x = safePos.x;
          existing.z = safePos.z;
          if (FACINGS.has(m.facing)) existing.facing = m.facing;
          if (isFiniteNumber(m.heading)) existing.heading = m.heading;
          existing.wheelie = isFiniteNumber(m.wheelie) ? Math.max(0, Math.min(1, m.wheelie)) : 0;
          const visualChanged =
            (isVehicleId(m.vehicle) && m.vehicle !== existing.vehicle) || (isFlagId(m.flag) && m.flag !== existing.flag);
          if (isVehicleId(m.vehicle)) existing.vehicle = m.vehicle;
          if (isFlagId(m.flag)) existing.flag = m.flag;
          // Troca de veículo/bandeira muda o desenho: força a cena a reler os jogadores (baixa frequência).
          if (visualChanged) setRemoteIds((ids) => [...ids]);
        }
      })
      .on("broadcast", { event: BROADCAST.voice }, ({ payload }) => {
        voiceHandlerRef.current?.(payload);
      })
      .on("broadcast", { event: BROADCAST.hit }, ({ payload }) => {
        const h = payload as HitBroadcast;
        if (typeof h?.senderId !== "string" || h.senderId === selfId || h.senderId.length > 64) return;
        const who = playersRef.current.get(h.senderId);
        const kind: StrikeKind = h.kind === "punch" ? "punch" : "flag";
        // Só quem está a pé; o golpe de bandeira exige a bandeira, o soco não.
        if (!who || who.vehicle !== "nenhum" || (kind === "flag" && who.flag === "nenhuma")) return;
        const nowHit = performance.now();
        // No máximo um golpe por duração da animação (anti-flood).
        if (who.hitAt && nowHit - who.hitAt < strikeSeconds(kind) * 1000 * 0.9) return;
        who.hitAt = nowHit;
        who.hitKind = kind;
      })
      .on("broadcast", { event: BROADCAST.impact }, ({ payload }) => {
        const h = payload as ImpactBroadcast;
        if (typeof h?.senderId !== "string" || typeof h?.targetId !== "string" || h.senderId === selfId || h.senderId.length > 64 || h.targetId.length > 64) return;
        const nowImpact = Date.now();
        // Anti-flood: no máximo um golpe que acerta por remetente a cada 0,6 s.
        if (nowImpact - (lastImpactBySenderRef.current.get(h.senderId) ?? 0) < 600) return;
        lastImpactBySenderRef.current.set(h.senderId, nowImpact);
        capMap(lastImpactBySenderRef.current, 500);
        const attacker = playersRef.current.get(h.senderId);
        if (!attacker || attacker.vehicle !== "nenhum" || (h.kind !== "punch" && attacker.flag === "nenhuma")) return; // a pé; golpe de bandeira exige bandeira
        // Só vale se o alvo está perto de quem bateu (o id do remetente é declarado pelo cliente: sem isto, um cliente
        // adulterado derrubaria qualquer um do mapa).
        const victim = h.targetId === selfId ? lastMoveRef.current : playersRef.current.get(h.targetId);
        if (!victim || Math.hypot(victim.x - attacker.x, victim.z - attacker.z) > STRIKE_RANGE + 2) return;
        applyImpact(h.targetId);
      })
      .on("broadcast", { event: BROADCAST.chat }, ({ payload }) => {
        const c = payload as ChatBroadcast;
        if (typeof c?.id !== "string" || c.id === selfId || c.id.length > 64) return;
        const nowChat = Date.now();
        if (nowChat - (lastChatBySenderRef.current.get(c.id) ?? 0) < CHAT_MIN_INTERVAL_MS) return;
        lastChatBySenderRef.current.set(c.id, nowChat);
        capMap(lastChatBySenderRef.current, 500);
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

        const place = sanitizeSprayPlacement(s.x, s.y, s.z, s.nx, s.ny, s.nz);
        if (!place) return;
        const color = Math.max(0, Math.min(0xffffff, Math.trunc(s.color)));
        // Estilo vindo da rede: só aceita slug conhecido, senão cai no clássico.
        const style =
          typeof s.style === "string" && SPRAY_SLUG_RE.test(s.style) && sprayOptions().some((o) => o.id === s.style)
            ? s.style
            : DEFAULT_SPRAY_ID;
        addSprayMark(sprayMarksRef.current, {
          id: s.id,
          ...place,
          color,
          rot: sanitizeSprayRot(s.rot),
          style,
          // Equipe do remetente vem da presence dele (não do payload do spray).
          team: playersRef.current.get(s.senderId)?.team,
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
    (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId, heading?: number, wheelie?: number) => {
      const channel = channelRef.current;
      lastMoveRef.current = { id: selfId, x, z, facing, vehicle, flag, heading, wheelie };
      // "joined" = handshake do canal concluído (equivalente ao status
      // SUBSCRIBED do callback de .subscribe()); antes disso o Realtime
      // descarta o send silenciosamente — evita mandar para o vazio logo
      // ao montar a cena.
      if (!channel || channel.state !== "joined") return;
      const payload: MoveBroadcast = { id: selfId, x, z, facing, vehicle, flag, heading, wheelie };
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

  /** Sinalização do palanque (sem eco local: o remetente já conhece o próprio estado). */
  /** Aplica um golpe que acertou `targetId` (eu ou outro jogador): reação, ou queda no 5º seguido. */
  const applyImpact = useCallback(
    (targetId: string) => {
      const now = performance.now();
      const who = targetId === selfId ? null : playersRef.current.get(targetId);
      if (targetId !== selfId && (!who || who.vehicle !== "nenhum")) return; // só quem está a pé
      const fallAtNow = targetId === selfId ? selfKnockRef.current.fallAt.current : (who?.fallAt ?? 0);
      if (fallAtNow > 0 && now - fallAtNow < FALL_SECONDS * 1000) return; // já caído: não conta
      const kind = registerHit(hitCountsRef.current, targetId);
      if (targetId === selfId) {
        if (kind === "fall") selfKnockRef.current.fallAt.current = now;
        else selfKnockRef.current.reactAt.current = now;
      } else if (who) {
        if (kind === "fall") who.fallAt = now;
        else who.reactAt = now;
      }
    },
    [selfId],
  );

  /** Meu golpe acertou `targetId`: aplica aqui e avisa os outros. */
  const sendImpact = useCallback(
    (targetId: string, kind: StrikeKind) => {
      applyImpact(targetId);
      const channel = channelRef.current;
      if (channel && channel.state === "joined") {
        const payload: ImpactBroadcast = { senderId: selfId, targetId, kind };
        void channel.send({ type: "broadcast", event: BROADCAST.impact, payload });
      }
    },
    [selfId, applyImpact],
  );

  const sendHit = useCallback((kind: StrikeKind) => {
    const channel = channelRef.current;
    if (channel && channel.state === "joined") {
      const payload: HitBroadcast = { senderId: selfId, kind };
      void channel.send({ type: "broadcast", event: BROADCAST.hit, payload });
    }
  }, [selfId]);

  const sendVoice = useCallback((payload: unknown) => {
    const channel = channelRef.current;
    if (channel && channel.state === "joined") void channel.send({ type: "broadcast", event: BROADCAST.voice, payload });
  }, []);

  const sendSpray = useCallback(
    (aim: SprayAim, color: number, style: string, rotIn = Math.PI): boolean => {
      // Cooldown próprio: defesa adicional (o cartucho em Game.tsx já limita
      // o uso pela UI, mas isso é chamável direto, ex. via DevTools — o
      // cooldown de recepção no handler acima é quem garante o limite de
      // verdade para os outros clientes; este aqui evita gastar cartucho
      // mandando mensagens que serão descartadas do outro lado mesmo assim).
      const now = Date.now();
      if (now - lastOwnSprayAtRef.current < SPRAY_MIN_INTERVAL_MS) return false;
      lastOwnSprayAtRef.current = now;

      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
      const place = sanitizeSprayPlacement(aim.x, aim.y, aim.z, aim.nx, aim.ny, aim.nz);
      if (!place) return false;
      const rot = sanitizeSprayRot(rotIn);
      // Mostra a própria marca localmente (broadcast não ecoa pro remetente);
      // também passa pelo limite de SPRAY_MAX_MARKS, igual às recebidas.
      addSprayMark(sprayMarksRef.current, { id, ...place, color, rot, style, team: selfTeamRef.current, flag: selfFlagRef.current, createdAt: now });
      setSprayVersion((v) => v + 1);
      const channel = channelRef.current;
      if (channel && channel.state === "joined") {
        const payload: SprayBroadcast = { id, senderId: selfId, x: place.x, y: place.y, z: place.z, nx: place.nx, ny: place.ny, nz: place.nz, color, style, rot };
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
    sendHit,
    sendImpact,
    selfKnock: selfKnockRef.current,
    sendVoice,
    voiceHandlerRef,
  };
}
