/**
 * Palanque com voz ao vivo: WebRTC direto (um falante → vários ouvintes), sinalizado pelo canal Realtime da avenida.
 * Sem servidor de mídia nem TURN: funciona na maioria das redes, mas não em todas (NAT restritivo) e aguenta poucos
 * ouvintes por vez. O servidor não vê o áudio. Quem fala é "best effort" (sem autoridade central — CLAUDE.md §4).
 */

export type VoiceMsg =
  | { t: "claim"; from: string; nick: string }
  | { t: "release"; from: string }
  | { t: "join"; from: string; to: string }
  | { t: "offer"; from: string; to: string; sdp: string }
  | { t: "answer"; from: string; to: string; sdp: string }
  | { t: "ice"; from: string; to: string; c: RTCIceCandidateInit };

export interface VoiceState {
  /** Quem está com o palanque agora (null = livre). */
  speakerId: string | null;
  speakerNick: string;
  /** Este cliente está falando. */
  speaking: boolean;
  /** Esperando a permissão do microfone. */
  starting: boolean;
  error: string | null;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const MAX_LISTENERS = 10;
const HEARTBEAT_MS = 3000;
const SPEAKER_TIMEOUT_MS = 9000;
const JOIN_RETRY_MS = 5000;
const MAX_SDP = 20000;
const MAX_ID = 64;
const MAX_NICK = 20;

const idOk = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;

/** Valida o que vem da rede (qualquer cliente pode mandar qualquer coisa). */
export function parseVoiceMsg(raw: unknown): VoiceMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!idOk(m.from)) return null;
  switch (m.t) {
    case "claim":
      return { t: "claim", from: m.from, nick: typeof m.nick === "string" ? m.nick.slice(0, MAX_NICK) : "Alguém" };
    case "release":
      return { t: "release", from: m.from };
    case "join":
      return idOk(m.to) ? { t: "join", from: m.from, to: m.to } : null;
    case "offer":
    case "answer":
      return idOk(m.to) && typeof m.sdp === "string" && m.sdp.length <= MAX_SDP ? { t: m.t, from: m.from, to: m.to, sdp: m.sdp } : null;
    case "ice": {
      if (!idOk(m.to) || !m.c || typeof m.c !== "object") return null;
      const c = m.c as Record<string, unknown>;
      if (typeof c.candidate !== "string" || c.candidate.length > 1000) return null;
      return {
        t: "ice",
        from: m.from,
        to: m.to,
        c: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === "string" ? c.sdpMid : null,
          sdpMLineIndex: typeof c.sdpMLineIndex === "number" ? c.sdpMLineIndex : null,
        },
      };
    }
    default:
      return null;
  }
}

export class StageVoice {
  private state: VoiceState = { speakerId: null, speakerNick: "", speaking: false, starting: false, error: null };
  private stream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>(); // falante: um por ouvinte
  private listenPc: RTCPeerConnection | null = null; // ouvinte: conexão com o falante
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingPeerIce = new Map<string, RTCIceCandidateInit[]>(); // falante: candidatos que chegaram antes da resposta
  private audio: HTMLAudioElement | null = null;
  private lastSeen = 0;
  private inRange = false;
  private volume = 1;
  private lastJoinAt = 0;
  private timer: number | null = null;
  private lastBeat = 0;
  private disposed = false;
  private lastJoinFrom = new Map<string, number>();

  constructor(
    private readonly selfId: string,
    private readonly send: (m: VoiceMsg) => void,
    private readonly onChange: (s: VoiceState) => void,
    /** Reconfere zona/silêncio quando o microfone é liberado (a permissão pode demorar). */
    private readonly canSpeak: () => boolean = () => true,
  ) {
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  getState(): VoiceState {
    return this.state;
  }

  private set(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /** Dentro do alcance de escuta? `volume` 0..1 vem da distância ao palanque. */
  setListening(inRange: boolean, volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = this.volume;
    if (inRange === this.inRange) return;
    this.inRange = inRange;
    if (!inRange) this.closeListen();
    else this.joinIfNeeded();
  }

  async startSpeaking(nick: string): Promise<void> {
    if (this.state.speaking || this.state.starting || this.disposed) return;
    if (this.state.speakerId && this.state.speakerId !== this.selfId) {
      this.set({ error: "O palanque está ocupado." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ error: "Este navegador não permite usar o microfone." });
      return;
    }
    this.set({ starting: true, error: null });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.set({ starting: false, error: "Microfone não liberado. Permita o acesso e tente de novo." });
      return;
    }
    // Durante o pedido de permissão o jogador pode ter saído da zona, sido silenciado ou alguém assumiu.
    if (this.disposed || !this.canSpeak() || (this.state.speakerId && this.state.speakerId !== this.selfId)) {
      stream.getTracks().forEach((t) => t.stop());
      this.set({ starting: false, error: this.disposed ? null : "O palanque não está disponível." });
      return;
    }
    this.stream = stream;
    this.closeListen();
    this.nick = nick.slice(0, MAX_NICK);
    this.set({ starting: false, speaking: true, speakerId: this.selfId, speakerNick: this.nick, error: null });
    this.beat();
  }

  private nick = "";

  stopSpeaking(): void {
    if (!this.state.speaking) return;
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingPeerIce.clear();
    this.stopTracks();
    this.send({ t: "release", from: this.selfId });
    this.set({ speaking: false, speakerId: null, speakerNick: "" });
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private beat(): void {
    this.lastBeat = Date.now();
    this.send({ t: "claim", from: this.selfId, nick: this.nick });
  }

  private tick(): void {
    const now = Date.now();
    if (this.state.speaking) {
      if (now - this.lastBeat >= HEARTBEAT_MS) this.beat();
      return;
    }
    if (this.state.speakerId && now - this.lastSeen > SPEAKER_TIMEOUT_MS) this.clearSpeaker();
    else if (this.state.speakerId && this.inRange && !this.listenPc && now - this.lastJoinAt > JOIN_RETRY_MS) this.joinIfNeeded();
  }

  private clearSpeaker(): void {
    this.closeListen();
    this.set({ speakerId: null, speakerNick: "" });
  }

  private joinIfNeeded(): void {
    const speaker = this.state.speakerId;
    if (!speaker || speaker === this.selfId || !this.inRange || this.listenPc) return;
    this.lastJoinAt = Date.now();
    this.send({ t: "join", from: this.selfId, to: speaker });
  }

  private closeListen(): void {
    this.listenPc?.close();
    this.listenPc = null;
    this.pendingIce = [];
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio = null;
    }
  }

  /** Mensagem recebida (já validada por `parseVoiceMsg`). */
  async handle(m: VoiceMsg): Promise<void> {
    if (this.disposed || m.from === this.selfId) return;
    try {
      switch (m.t) {
        case "claim": {
          if (this.state.speaking) {
            // Disputa: vence o menor id; quem perde cede.
            if (m.from < this.selfId) this.stopSpeaking();
            else return;
          }
          if (this.state.speakerId !== m.from) {
            this.closeListen();
            this.set({ speakerId: m.from, speakerNick: m.nick });
          }
          this.lastSeen = Date.now();
          this.joinIfNeeded();
          return;
        }
        case "release":
          if (m.from === this.state.speakerId && !this.state.speaking) this.clearSpeaker();
          return;
        case "join":
          if (m.to === this.selfId && this.state.speaking) {
            const now = Date.now();
            if (now - (this.lastJoinFrom.get(m.from) ?? 0) < 2000) return;
            this.lastJoinFrom.set(m.from, now);
            if (this.lastJoinFrom.size > 100) this.lastJoinFrom.clear();
            await this.offerTo(m.from);
          }
          return;
        case "offer":
          if (m.to === this.selfId && m.from === this.state.speakerId && this.inRange) await this.answer(m);
          return;
        case "answer": {
          const pc = m.to === this.selfId ? this.peers.get(m.from) : undefined;
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
            for (const c of this.pendingPeerIce.get(m.from) ?? []) await pc.addIceCandidate(c).catch(() => {});
            this.pendingPeerIce.delete(m.from);
          }
          return;
        }
        case "ice": {
          if (m.to !== this.selfId) return;
          const pc = this.state.speaking ? this.peers.get(m.from) : m.from === this.state.speakerId ? this.listenPc : null;
          if (pc?.remoteDescription) await pc.addIceCandidate(m.c);
          else if (this.state.speaking && pc) {
            const list = this.pendingPeerIce.get(m.from) ?? [];
            if (list.length < 50) this.pendingPeerIce.set(m.from, [...list, m.c]);
          } else if (!this.state.speaking && m.from === this.state.speakerId) {
            if (this.pendingIce.length < 50) this.pendingIce.push(m.c);
          }
          return;
        }
      }
    } catch {
      /* mensagem fora de hora ou candidato inválido: ignora */
    }
  }

  private async offerTo(listener: string): Promise<void> {
    if (!this.stream) return;
    if (!this.peers.has(listener) && this.peers.size >= MAX_LISTENERS) return;
    this.peers.get(listener)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(listener, pc);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: "ice", from: this.selfId, to: listener, c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        if (this.peers.get(listener) === pc) this.peers.delete(listener);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (offer.sdp) this.send({ t: "offer", from: this.selfId, to: listener, sdp: offer.sdp });
  }

  private async answer(m: Extract<VoiceMsg, { t: "offer" }>): Promise<void> {
    this.listenPc?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.listenPc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: "ice", from: this.selfId, to: m.from, c: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const audio = this.audio ?? new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      audio.volume = this.volume;
      this.audio = audio;
      void audio.play().catch(() => this.set({ error: "Toque na tela para liberar o som do palanque." }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.listenPc === pc) this.closeListen();
      }
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      if (ans.sdp) this.send({ t: "answer", from: this.selfId, to: m.from, sdp: ans.sdp });
    } catch {
      // Oferta inválida: solta a conexão para o retry de `join` poder tentar de novo.
      pc.close();
      if (this.listenPc === pc) this.listenPc = null;
    }
  }

  dispose(): void {
    if (this.state.speaking) this.stopSpeaking();
    this.closeListen();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.disposed = true;
  }
}
