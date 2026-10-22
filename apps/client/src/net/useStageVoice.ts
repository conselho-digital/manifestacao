import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { STAGE_HEAR_RADIUS, STAGE_SPEAK_RADIUS, STAGE_X, STAGE_Z } from "../game/world.js";
import { StageVoice, parseVoiceMsg, type VoiceMsg, type VoiceState } from "./stageVoice.js";

const IDLE: VoiceState = { speakerId: null, speakerNick: "", speaking: false, error: null };
/** Mais perto que isto, volume cheio; depois cai linearmente até o fim do alcance. */
const FULL_VOLUME_RADIUS = 10;
/** Máx. de mensagens de voz aceitas por segundo (um cliente hostil não afoga os outros). */
const MAX_MSGS_PER_SEC = 60;

interface Options {
  selfId: string;
  nickname: string;
  /** Posição do jogador (lida a cada ciclo, sem re-render). */
  posRef: MutableRefObject<{ x: number; z: number }>;
  sendVoice: (payload: unknown) => void;
  voiceHandlerRef: MutableRefObject<((payload: unknown) => void) | null>;
  /** Conta silenciada: não pode falar (ainda ouve). */
  blocked: boolean;
}

export interface StageVoiceUi {
  state: VoiceState;
  /** Dentro da zona onde dá para assumir o palanque. */
  inZone: boolean;
  toggle: () => void;
}

/** Liga o palanque de voz ao canal da avenida e à posição do jogador. */
export function useStageVoice({ selfId, nickname, posRef, sendVoice, voiceHandlerRef, blocked }: Options): StageVoiceUi {
  const [state, setState] = useState<VoiceState>(IDLE);
  const [inZone, setInZone] = useState(false);
  const voiceRef = useRef<StageVoice | null>(null);
  const nickRef = useRef(nickname);
  nickRef.current = nickname;
  const inZoneRef = useRef(false);
  const bucket = useRef({ t: 0, n: 0 });

  useEffect(() => {
    const v = new StageVoice(selfId, (m: VoiceMsg) => sendVoice(m), setState);
    voiceRef.current = v;
    voiceHandlerRef.current = (payload) => {
      const now = Date.now();
      if (now - bucket.current.t > 1000) bucket.current = { t: now, n: 0 };
      if (++bucket.current.n > MAX_MSGS_PER_SEC) return;
      const msg = parseVoiceMsg(payload);
      if (msg) void v.handle(msg);
    };
    const poll = window.setInterval(() => {
      const d = Math.hypot(posRef.current.x - STAGE_X, posRef.current.z - STAGE_Z);
      const zone = d <= STAGE_SPEAK_RADIUS;
      if (zone !== inZoneRef.current) {
        inZoneRef.current = zone;
        setInZone(zone);
        // Saiu da zona falando: devolve o palanque.
        if (!zone) v.stopSpeaking();
      }
      const volume = d <= FULL_VOLUME_RADIUS ? 1 : 1 - (d - FULL_VOLUME_RADIUS) / (STAGE_HEAR_RADIUS - FULL_VOLUME_RADIUS);
      v.setListening(d <= STAGE_HEAR_RADIUS, volume);
    }, 500);
    return () => {
      window.clearInterval(poll);
      voiceHandlerRef.current = null;
      v.dispose();
      voiceRef.current = null;
      setState(IDLE);
    };
  }, [selfId, sendVoice, voiceHandlerRef, posRef]);

  // Avisos de erro somem sozinhos.
  useEffect(() => {
    if (!state.error) return;
    const t = window.setTimeout(() => setState((st) => (st.error ? { ...st, error: null } : st)), 6000);
    return () => window.clearTimeout(t);
  }, [state.error]);

  // Silenciado no meio da fala: para na hora.
  useEffect(() => {
    if (blocked) voiceRef.current?.stopSpeaking();
  }, [blocked]);

  const toggle = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;
    if (v.getState().speaking) v.stopSpeaking();
    else if (inZoneRef.current && !blocked) void v.startSpeaking(nickRef.current);
  }, [blocked]);

  return { state, inZone, toggle };
}
