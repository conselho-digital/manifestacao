import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { setStageHearing } from "../game/stageState.js";
import { STAGES, stageHearAt, stageTalkAt } from "../game/world.js";
import { IDLE_VOICE, StageVoice, parseVoiceMsg, type VoiceMsg, type VoiceState } from "./stageVoice.js";

/** Volume no centro do círculo e na borda dele (só quem está dentro ouve). */
const VOLUME_CENTER = 1;
const VOLUME_EDGE = 0.6;
/** Máx. de mensagens de voz por segundo, por remetente e no total (um cliente hostil não afoga os outros). */
const MAX_MSGS_PER_SENDER_SEC = 25;
const MAX_MSGS_TOTAL_SEC = 150;

interface Options {
  selfId: string;
  nickname: string;
  /** Posição do jogador (lida a cada ciclo, sem re-render). */
  posRef: MutableRefObject<{ x: number; z: number }>;
  sendVoice: (payload: unknown) => void;
  voiceHandlerRef: MutableRefObject<((payload: unknown) => void) | null>;
  /** Conta silenciada: não pode falar (ainda ouve). */
  blocked: boolean;
  /** O remetente está na presence (quem não está online não fala nem assume o palanque). */
  isOnline: (id: string) => boolean;
}

export interface StageVoiceUi {
  state: VoiceState;
  toggleMute: () => void;
  /** Anfitrião do palanque: escolhe quem sai para o novato entrar. */
  decide: (choice: "older" | "newer") => void;
}

/** Liga o palanque de voz ao canal da avenida e à posição do jogador. */
export function useStageVoice({ selfId, nickname, posRef, sendVoice, voiceHandlerRef, blocked, isOnline }: Options): StageVoiceUi {
  const [state, setState] = useState<VoiceState>(IDLE_VOICE);
  const voiceRef = useRef<StageVoice | null>(null);
  const nickRef = useRef(nickname);
  nickRef.current = nickname;
  const inTalkRef = useRef(false);
  const bucket = useRef({ t: 0, n: 0 });
  const perSender = useRef(new Map<string, { t: number; n: number }>());
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    const v = new StageVoice(selfId, (m: VoiceMsg) => sendVoice(m), setState, () => inTalkRef.current && !blockedRef.current);
    voiceRef.current = v;
    voiceHandlerRef.current = (payload) => {
      const now = Date.now();
      if (now - bucket.current.t > 1000) bucket.current = { t: now, n: 0 };
      if (++bucket.current.n > MAX_MSGS_TOTAL_SEC) return;
      const msg = parseVoiceMsg(payload);
      if (!msg || !isOnlineRef.current(msg.from)) return;
      const senders = perSender.current;
      const b = senders.get(msg.from);
      if (!b || now - b.t > 1000) senders.set(msg.from, { t: now, n: 1 });
      else if (++b.n > MAX_MSGS_PER_SENDER_SEC) return;
      if (senders.size > 200) senders.clear();
      void v.handle(msg);
    };
    const poll = window.setInterval(() => {
      const { x, z } = posRef.current;
      const hear = stageHearAt(x, z);
      setStageHearing(hear);
      // Silenciado: ouve, mas não fala (a lista não o aceita).
      const talk = blockedRef.current ? -1 : stageTalkAt(x, z);
      inTalkRef.current = talk >= 0;
      const st = hear >= 0 ? STAGES[hear] : undefined;
      const volume = st ? VOLUME_CENTER - (VOLUME_CENTER - VOLUME_EDGE) * Math.min(1, Math.hypot(x - st.x, z - st.z) / st.hearR) : 0;
      v.setPosition(hear, talk, volume, nickRef.current);
    }, 500);
    return () => {
      window.clearInterval(poll);
      setStageHearing(-1);
      voiceHandlerRef.current = null;
      v.dispose();
      voiceRef.current = null;
      setState(IDLE_VOICE);
    };
  }, [selfId, sendVoice, voiceHandlerRef, posRef]);

  const toggleMute = useCallback(() => voiceRef.current?.toggleMute(), []);
  const decide = useCallback((choice: "older" | "newer") => voiceRef.current?.decide(choice), []);

  return { state, toggleMute, decide };
}
