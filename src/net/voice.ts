// Voz por proximidade: conversa direta entre navegadores (WebRTC), só com quem está perto.
// A sinalização (oferta/resposta/ICE) passa pelo canal do Supabase Realtime; o áudio não passa por servidor nenhum.
// Gratuito: usa os servidores STUN públicos do Google. Sem servidor TURN, algumas redes (4G com NAT rígido) não conectam.
import { audioCtx, audioOut, proximity } from '../game/audio';

export type VoiceState = 'off' | 'live' | 'muted' | 'denied';
export type RtcKind = 'offer' | 'answer' | 'ice';
export interface RtcMsg { from: string; to: string; k: RtcKind; d: unknown }

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
/** liga a conversa a quem está a menos de 3,4 m e desliga acima de 4,5 m (histerese para não ficar ligando/desligando) */
const CONNECT_RANGE = 3.4;
const DROP_RANGE = 4.5;
/** a voz some em 3 m; a menos de 0,75 m é cheia */
export const HEAR_RANGE = 3;
/** altura do som: o nível do microfone (dBFS) vira 0..1 e o alcance da voz vai de 10% a 100% de HEAR_RANGE conforme o volume */
const DB_QUIET = -58;
const DB_LOUD = -18;
const MIN_RANGE_K = 0.1;
const GATE = 0.03; // abaixo disso é silêncio (sem círculo)
const TICK = 0.5;
const RETRY_AFTER_MS = 6000;
const MAX_PEERS = 8; // malha completa só com os mais próximos

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  gain: GainNode | null;
  pan: StereoPannerNode | null;
  audio: HTMLAudioElement | null;
  queue: RTCIceCandidateInit[];
  hasRemote: boolean;
  born: number;
  meter: Meter | null;
}

/** Mede o volume de um fluxo de áudio (RMS suavizado: sobe rápido, desce devagar). */
class Meter {
  level = 0;
  private readonly buf: Float32Array<ArrayBuffer>;
  constructor(private readonly node: AnalyserNode) { node.fftSize = 512; this.buf = new Float32Array(node.fftSize); }
  step(dt: number): void {
    this.node.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!;
    const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-9);
    const f = Math.max(0, Math.min(1, (db - DB_QUIET) / (DB_LOUD - DB_QUIET)));
    this.level += (f - this.level) * (1 - Math.exp(-dt * (f > this.level ? 40 : 6)));
  }
  disconnect(): void { try { this.node.disconnect(); } catch { /* já solto */ } }
}

/** Alcance da voz (m) para um volume 0..1. */
export const rangeOfLevel = (f: number): number => HEAR_RANGE * (MIN_RANGE_K + (1 - MIN_RANGE_K) * f);

type Pos = { x: number; z: number };

/** Valida o que chega pela rede antes de passar ao WebRTC. */
export function cleanRtc(raw: unknown): { k: RtcKind; to: string; from: string; d: unknown } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
  if (!id(m.from) || !id(m.to) || (m.k !== 'offer' && m.k !== 'answer' && m.k !== 'ice')) return null;
  const d = m.d as Record<string, unknown> | null;
  if (typeof d !== 'object' || d === null) return null;
  if (m.k === 'ice') {
    if (typeof d.candidate !== 'string' || d.candidate.length > 600) return null;
    return { from: m.from, to: m.to, k: m.k, d: { candidate: d.candidate, sdpMid: typeof d.sdpMid === 'string' ? d.sdpMid.slice(0, 16) : null, sdpMLineIndex: typeof d.sdpMLineIndex === 'number' ? d.sdpMLineIndex : null } };
  }
  if (typeof d.sdp !== 'string' || d.sdp.length > 20000 || (d.type !== 'offer' && d.type !== 'answer')) return null;
  return { from: m.from, to: m.to, k: m.k, d: { type: d.type, sdp: d.sdp } };
}

export class Voice {
  private peers = new Map<string, Peer>();
  private pos = new Map<string, Pos>();
  private me: Pos = { x: 0, z: 0 };
  private local: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private active = false;
  private tick = 0;
  private lastFail = new Map<string, number>();
  private myMeter: Meter | null = null;
  state: VoiceState = 'off';

  constructor(
    private readonly myId: string,
    private readonly send: (to: string, k: RtcKind, d: unknown) => void,
    private readonly onState: (s: VoiceState, peers: number) => void,
  ) {}

  /** Estado das conversas (para testes). */
  async debug(): Promise<{ id: string; state: string; inBytes: number }[]> {
    const out: { id: string; state: string; inBytes: number }[] = [];
    for (const [id, p] of this.peers) {
      let inBytes = 0;
      (await p.pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') inBytes += r.bytesReceived ?? 0; });
      out.push({ id, state: p.pc.connectionState, inBytes });
    }
    return out;
  }

  /** Alcance da MINHA voz agora (m): 0 se não estou transmitindo som. */
  myRange(): number {
    const m = this.myMeter;
    return m && this.track?.enabled && m.level > GATE ? rangeOfLevel(m.level) : 0;
  }

  /** Alcance da voz de quem está conectado comigo (m): 0 se está calado. */
  rangeOf(id: string): number {
    const m = this.peers.get(id)?.meter;
    return m && m.level > GATE ? rangeOfLevel(m.level) : 0;
  }

  get peerCount(): number {
    let n = 0;
    this.peers.forEach((p) => { if (p.pc.connectionState === 'connected') n++; });
    return n;
  }

  private setState(s: VoiceState): void {
    this.state = s;
    this.onState(s, this.peerCount);
  }

  private holding = false;
  private tail = 0;

  /**
   * Aperte para falar (push to talk): o microfone fica mudo e só transmite enquanto o botão (ou a tecla T) está apertado.
   * O 1º aperto pede a permissão do microfone; se soltar antes de liberar, não transmite. Um pouco depois de soltar (0,25 s) o fim da frase não é cortado.
   */
  async talk(on: boolean): Promise<void> {
    this.holding = on;
    if (!on) {
      window.clearTimeout(this.tail);
      this.tail = window.setTimeout(() => { if (!this.holding) this.setLive(false); }, 250);
      return;
    }
    window.clearTimeout(this.tail);
    if (!this.active || (this.state === 'denied' && !this.track)) {
      this.active = true;
      try {
        this.local = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, // sem ganho automático: o círculo mostra o volume de verdade
        });
        this.track = this.local.getAudioTracks()[0] ?? null;
        const c = audioCtx();
        if (c && this.track) { const an = c.createAnalyser(); c.createMediaStreamSource(this.local).connect(an); this.myMeter = new Meter(an); }
        if (this.track) { this.track.enabled = false; this.peers.forEach((p) => this.giveTrack(p.pc)); }
      } catch {
        // sem microfone: continua ouvindo quem estiver perto
        this.setState('denied');
        return;
      }
    }
    this.setLive(this.holding);
  }

  private setLive(on: boolean): void {
    if (!this.track) return;
    this.track.enabled = on;
    this.setState(on ? 'live' : 'muted');
  }

  private giveTrack(pc: RTCPeerConnection): void {
    if (!this.track) return;
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track.kind !== 'audio') continue;
      t.direction = 'sendrecv';
      void t.sender.replaceTrack(this.track);
    }
  }

  private makePeer(id: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { id, pc, gain: null, pan: null, audio: null, queue: [], hasRemote: false, born: performance.now(), meter: null };
    pc.onicecandidate = (e) => { if (e.candidate) this.send(id, 'ice', e.candidate.toJSON()); };
    pc.ontrack = (e) => this.attach(peer, e.track);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        if (pc.connectionState === 'failed') this.lastFail.set(id, performance.now());
        this.drop(id);
      } else this.onState(this.state, this.peerCount);
    };
    this.peers.set(id, peer);
    return peer;
  }

  /** O som de quem fala chega pelo WebAudio: volume e lado seguem a posição dele. */
  private attach(peer: Peer, track: MediaStreamTrack): void {
    if (peer.gain) return;
    const c = audioCtx();
    const out = audioOut();
    if (!c || !out) return;
    const stream = new MediaStream([track]);
    // o Chrome só entrega o áudio de WebRTC ao WebAudio se o stream também estiver ligado a um <audio> (mudo)
    const a = new Audio();
    a.srcObject = stream;
    a.muted = true;
    void a.play().catch(() => undefined);
    peer.audio = a;
    const src = c.createMediaStreamSource(stream);
    peer.gain = c.createGain();
    peer.gain.gain.value = 0;
    peer.pan = c.createStereoPanner();
    src.connect(peer.gain).connect(peer.pan).connect(out);
    const an = c.createAnalyser(); // volume de quem fala (antes do ajuste por distância)
    src.connect(an);
    peer.meter = new Meter(an);
  }

  private drop(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.pc.close(); } catch { /* já fechado */ }
    p.audio?.pause();
    if (p.audio) p.audio.srcObject = null;
    p.gain?.disconnect();
    p.pan?.disconnect();
    p.meter?.disconnect();
    this.onState(this.state, this.peerCount);
  }

  /** Quem saiu da sala. */
  leave(id: string): void {
    this.drop(id);
    this.pos.delete(id);
  }

  /** Quem tem o id menor começa a conversa (evita os dois mandarem oferta ao mesmo tempo). */
  private iStart(other: string): boolean { return this.myId < other; }

  private async offer(id: string): Promise<void> {
    const peer = this.makePeer(id);
    const tr = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.track) void tr.sender.replaceTrack(this.track);
    try {
      const o = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(o);
      this.send(id, 'offer', { type: o.type, sdp: o.sdp });
    } catch { this.drop(id); }
  }

  /** Mensagem de sinalização recebida (já validada por cleanRtc). */
  async onSignal(m: { from: string; k: RtcKind; d: unknown }): Promise<void> {
    if (!this.active) return; // quem não ligou a voz não abre conexão (nem expõe o IP)
    const id = m.from;
    try {
      if (m.k === 'offer') {
        const at = this.pos.get(id);
        if (!at || Math.hypot(at.x - this.me.x, at.z - this.me.z) > DROP_RANGE || this.peers.size >= MAX_PEERS) return;
        if (this.peers.has(id)) this.drop(id); // recomeço: ele reiniciou a conversa
        const peer = this.makePeer(id);
        await peer.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        peer.hasRemote = true;
        this.giveTrack(peer.pc);
        for (const t of peer.pc.getTransceivers()) t.direction = 'sendrecv';
        const a = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(a);
        this.send(id, 'answer', { type: a.type, sdp: a.sdp });
        await this.flush(peer);
      } else if (m.k === 'answer') {
        const peer = this.peers.get(id);
        if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        peer.hasRemote = true;
        await this.flush(peer);
      } else {
        const peer = this.peers.get(id);
        if (!peer) return;
        if (peer.hasRemote) await peer.pc.addIceCandidate(m.d as RTCIceCandidateInit);
        else if (peer.queue.length < 40) peer.queue.push(m.d as RTCIceCandidateInit);
      }
    } catch {
      this.drop(id);
    }
  }

  private async flush(peer: Peer): Promise<void> {
    for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
  }

  /** Todo quadro: posições de todos, abre/fecha conversas por distância e ajusta o volume de cada voz. */
  update(dt: number, me: Pos, others: Map<string, Pos>): void {
    if (!this.active) return;
    this.myMeter?.step(dt);
    for (const peer of this.peers.values()) peer.meter?.step(dt);
    this.me = me;
    this.pos = others;
    this.tick += dt;
    if (this.tick >= TICK) {
      this.tick = 0;
      const now = performance.now();
      const near = [...others.entries()]
        .map(([id, p]) => ({ id, d: Math.hypot(p.x - me.x, p.z - me.z) }))
        .sort((a, b) => a.d - b.d);
      for (const { id, d } of near) {
        if (d <= CONNECT_RANGE && !this.peers.has(id) && this.peers.size < MAX_PEERS && this.iStart(id) && now - (this.lastFail.get(id) ?? 0) > RETRY_AFTER_MS) void this.offer(id);
      }
      for (const [id, peer] of this.peers) {
        const p = others.get(id);
        const far = !p || Math.hypot(p.x - me.x, p.z - me.z) > DROP_RANGE;
        // oferta sem resposta há 12 s: tenta de novo depois
        const stuck = peer.pc.connectionState !== 'connected' && now - peer.born > 12000;
        if (far || stuck) { if (stuck) this.lastFail.set(id, now); this.drop(id); }
      }
    }
    for (const [id, peer] of this.peers) {
      const p = others.get(id);
      if (!p || !peer.gain || !peer.pan) continue;
      const reach = rangeOfLevel(peer.meter?.level ?? 1); // quem fala baixo só é ouvido de perto; gritar chega mais longe
      const prox = proximity(p.x, p.z, HEAR_RANGE, 0.75); // só o lado (pan) vem daqui
      const near = reach * 0.25;
      const d = Math.hypot(p.x - this.me.x, p.z - this.me.z);
      const k = Math.min(1, Math.max(0, 1 - (d - near) / Math.max(0.05, reach - near)));
      prox.gain = k * k; // volume pela distância ATÉ onde a voz chega agora (a menos de 'reach')
      const c = audioCtx();
      if (!c) continue;
      peer.gain.gain.setTargetAtTime(Math.min(1.4, prox.gain * 1.6), c.currentTime, 0.1);
      peer.pan.pan.setTargetAtTime(prox.pan, c.currentTime, 0.1);
    }
  }
}
