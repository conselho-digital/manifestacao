/**
 * Palanques com voz ao vivo: WebRTC direto (cada falante → cada ouvinte do círculo), sinalizado pelo canal Realtime da
 * avenida. Sem servidor de mídia nem TURN: funciona na maioria das redes, não em todas, e aguenta poucos ouvintes por
 * falante. O servidor não vê o áudio. Sem autoridade central (CLAUDE.md §4): quem fala é "best effort".
 *
 * Cada palanque tem DOIS lugares de fala e uma fila. Quem entra na pequena área de fala (a plataforma) é anotado pelo
 * ANFITRIÃO do palanque — o falante mais antigo — que publica a lista (falantes + fila) a cada 2 s. Com os dois lugares
 * ocupados, o anfitrião decide quem sai quando chega alguém novo: ele mesmo ou o falante mais novo (se não responder em
 * 15 s, sai ele). Se o anfitrião some, o falante seguinte assume; se não sobrou nenhum, o de menor id na área.
 */

export interface Member {
  id: string;
  nick: string;
}

export type VoiceMsg =
  /** Batimento de quem está na área de fala do palanque `s` (a cada 2 s). */
  | { t: "here"; from: string; s: number; nick: string }
  | { t: "leave"; from: string; s: number }
  /** Lista do palanque, publicada pelo anfitrião: `sp` falantes (do mais antigo ao mais novo), `q` fila, `pr` = quem espera a decisão, `dm` = dispensados ainda na área. */
  | { t: "roster"; from: string; s: number; ep: number; host: string; sp: Member[]; q: Member[]; pr: string | null; dm: string[] }
  | { t: "join"; from: string; to: string; s: number }
  | { t: "offer"; from: string; to: string; s: number; sdp: string }
  | { t: "answer"; from: string; to: string; s: number; sdp: string }
  /** `sp`: quem manda o candidato é o lado que fala (senão, o que ouve). */
  | { t: "ice"; from: string; to: string; s: number; sp: boolean; c: RTCIceCandidateInit };

export type VoiceRole = "none" | "waiting" | "queue" | "speaker" | "dismissed";

/** Pergunta do anfitrião: `newcomer` quer falar e os dois lugares estão cheios. */
export interface VoicePrompt {
  newcomer: Member;
  older: Member;
  newer: Member;
  /** Quando (Date.now) a decisão sai sozinha. */
  deadline: number;
}

export interface VoiceState {
  /** Palanque em cujo círculo o jogador está (−1 = nenhum). */
  stage: number;
  /** Está dentro da área de fala. */
  inTalk: boolean;
  role: VoiceRole;
  speakers: Member[];
  queue: Member[];
  /** Posição na fila (1 = próximo), 0 = fora da fila. */
  position: number;
  /** Esperando a permissão do microfone. */
  starting: boolean;
  muted: boolean;
  /** Pergunta para este jogador decidir (só o anfitrião). */
  prompt: VoicePrompt | null;
  error: string | null;
}

export const IDLE_VOICE: VoiceState = { stage: -1, inTalk: false, role: "none", speakers: [], queue: [], position: 0, starting: false, muted: false, prompt: null, error: null };

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const MAX_LISTENERS = 12;
const BEAT_MS = 2000;
const ROSTER_MS = 2000;
const STALE_MS = 6500;
const ROSTER_TIMEOUT_MS = 7000;
const DECIDE_MS = 15000;
const JOIN_RETRY_MS = 4000;
/** Some da lista por tanto tempo (batimentos continuando) = foi dispensado. */
const DISMISS_MS = 4000;
const BOOTSTRAP_WAIT_MS = 2500;
/** Avisos de erro somem sozinhos. */
const ERROR_MS = 6000;
const MAX_SEATS = 2;
const MAX_QUEUE = 8;
const MAX_SDP = 20000;
const MAX_ID = 64;
const MAX_NICK = 20;
const MAX_STAGE = 31;

const idOk = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const stageOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_STAGE;

function parseMembers(raw: unknown, max: number): Member[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: Member[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const r = m as Record<string, unknown>;
    if (!idOk(r.id)) return null;
    out.push({ id: r.id, nick: typeof r.nick === "string" ? r.nick.slice(0, MAX_NICK) : "Alguém" });
  }
  return out;
}

/** Valida o que vem da rede (qualquer cliente pode mandar qualquer coisa). */
export function parseVoiceMsg(raw: unknown): VoiceMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!idOk(m.from) || !stageOk(m.s)) return null;
  switch (m.t) {
    case "here":
      return { t: "here", from: m.from, s: m.s, nick: typeof m.nick === "string" ? m.nick.slice(0, MAX_NICK) : "Alguém" };
    case "leave":
      return { t: "leave", from: m.from, s: m.s };
    case "roster": {
      const sp = parseMembers(m.sp, MAX_SEATS);
      const q = parseMembers(m.q, MAX_QUEUE);
      if (!sp || !q || !idOk(m.host) || typeof m.ep !== "number" || !Number.isFinite(m.ep) || m.ep < 0 || m.ep > 1e9) return null;
      const dm = Array.isArray(m.dm) && m.dm.length <= 16 && m.dm.every(idOk) ? (m.dm as string[]) : [];
      return { t: "roster", from: m.from, s: m.s, ep: m.ep, host: m.host, sp, q, pr: idOk(m.pr) ? m.pr : null, dm };
    }
    case "join":
      return idOk(m.to) ? { t: "join", from: m.from, to: m.to, s: m.s } : null;
    case "offer":
    case "answer":
      return idOk(m.to) && typeof m.sdp === "string" && m.sdp.length <= MAX_SDP ? { t: m.t, from: m.from, to: m.to, s: m.s, sdp: m.sdp } : null;
    case "ice": {
      if (!idOk(m.to) || typeof m.sp !== "boolean" || !m.c || typeof m.c !== "object") return null;
      const c = m.c as Record<string, unknown>;
      if (typeof c.candidate !== "string" || c.candidate.length > 1000) return null;
      return {
        t: "ice",
        from: m.from,
        to: m.to,
        s: m.s,
        sp: m.sp,
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

/** O que cada cliente sabe do palanque em que está (a lista vem do anfitrião; o resto é visto pelos batimentos). */
interface Model {
  s: number;
  ep: number;
  host: string | null;
  sp: Member[];
  q: Member[];
  pr: string | null;
  rosterAt: number;
  /** Quem bateu o ponto na área de fala (batimentos `here`). */
  members: Map<string, { nick: string; first: number; last: number }>;
  /** Anfitrião: dispensados que ainda estão na área (não voltam sozinhos para a fila). */
  dismissed: Set<string>;
  /** Anfitrião: pergunta em aberto. */
  prompt: VoicePrompt | null;
  lastRoster: number;
  /** Quando (Date.now) o jogador entrou no círculo: antes de ouvir a lista do anfitrião, ninguém se declara anfitrião. */
  created: number;
}

interface Listen {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
}

const newModel = (s: number): Model => ({
  s,
  ep: 0,
  host: null,
  sp: [],
  q: [],
  pr: null,
  rosterAt: 0,
  members: new Map(),
  dismissed: new Set(),
  prompt: null,
  lastRoster: 0,
  created: Date.now(),
});

export class StageVoice {
  private state: VoiceState = IDLE_VOICE;
  private model: Model | null = null;
  private inHear = false;
  private inTalk = false;
  private volume = 1;
  private wasListed = false;
  private lastListedAt = 0;
  private errorAt = 0;
  private stream: MediaStream | null = null;
  private starting = false;
  private muted = false;
  private nick = "";
  private out = new Map<string, RTCPeerConnection>(); // falante: um por ouvinte
  private outIce = new Map<string, RTCIceCandidateInit[]>();
  private inc = new Map<string, Listen>(); // ouvinte: um por falante
  private lastJoinAt = new Map<string, number>();
  private lastJoinFrom = new Map<string, number>();
  private lastBeat = 0;
  private timer: number | null = null;
  private disposed = false;

  constructor(
    private readonly selfId: string,
    private readonly send: (m: VoiceMsg) => void,
    private readonly onChange: (s: VoiceState) => void,
    /** Pode falar agora? (zona certa e conta sem silêncio) — conferido de novo quando o microfone é liberado. */
    private readonly canSpeak: () => boolean = () => true,
  ) {
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  getState(): VoiceState {
    return this.state;
  }

  /**
   * Chamado a cada ciclo com a posição do jogador: `hear` = palanque cujo círculo de escuta ele pisa (−1 = nenhum),
   * `talk` = palanque cuja área de fala ele pisa (−1 = nenhuma), `volume` 0..1 pela distância ao centro.
   */
  setPosition(hear: number, talk: number, volume: number, nick: string): void {
    if (this.disposed) return;
    this.nick = nick.slice(0, MAX_NICK);
    this.volume = Math.max(0, Math.min(1, volume));
    for (const l of this.inc.values()) if (l.audio) l.audio.volume = this.volume;
    if (hear !== (this.model?.s ?? -1)) this.switchStage(hear);
    this.inHear = hear >= 0;
    const talking = talk >= 0 && talk === hear;
    if (talking !== this.inTalk) {
      this.inTalk = talking;
      if (talking) {
        this.wasListed = false;
        this.beat();
      } else this.leaveTalk();
    }
    this.refresh();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this.refresh();
  }

  /** Anfitrião: decide quem sai para o novato entrar. */
  decide(choice: "older" | "newer"): void {
    const m = this.model;
    if (!m || m.host !== this.selfId || !m.prompt) return;
    this.resolve(m, choice);
    this.publish(m);
    this.refresh();
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.disposed = true;
    this.switchStage(-1);
  }

  // ───────────────────────── estado ─────────────────────────

  private role(): VoiceRole {
    const m = this.model;
    if (!m || !this.inTalk) return "none";
    if (m.sp.some((x) => x.id === this.selfId)) return "speaker";
    if (m.q.some((x) => x.id === this.selfId)) return "queue";
    return this.wasListed && Date.now() - this.lastListedAt > DISMISS_MS ? "dismissed" : "waiting";
  }

  private refresh(error?: string | null): void {
    const m = this.model;
    const role = this.role();
    if (role === "speaker" || role === "queue") {
      this.wasListed = true;
      this.lastListedAt = Date.now();
    }
    const prompt = m && m.host === this.selfId ? m.prompt : null;
    if (error) this.errorAt = Date.now();
    else if (this.state.error && Date.now() - this.errorAt > ERROR_MS) error = null;
    const next: VoiceState = {
      stage: m?.s ?? -1,
      inTalk: this.inTalk,
      role,
      speakers: m?.sp ?? [],
      queue: m?.q ?? [],
      position: m ? m.q.findIndex((x) => x.id === this.selfId) + 1 : 0,
      starting: this.starting,
      muted: this.muted,
      prompt,
      error: error === undefined ? this.state.error : error,
    };
    const prev = this.state;
    const same =
      prev.stage === next.stage &&
      prev.inTalk === next.inTalk &&
      prev.role === next.role &&
      prev.position === next.position &&
      prev.starting === next.starting &&
      prev.muted === next.muted &&
      prev.error === next.error &&
      prev.prompt?.newcomer.id === next.prompt?.newcomer.id &&
      prev.prompt?.older.id === next.prompt?.older.id &&
      prev.prompt?.newer.id === next.prompt?.newer.id &&
      prev.speakers.map((x) => x.id).join() === next.speakers.map((x) => x.id).join() &&
      prev.queue.map((x) => x.id).join() === next.queue.map((x) => x.id).join();
    if (same) return;
    this.state = next;
    this.onChange(next);
  }

  private switchStage(s: number): void {
    if (this.inTalk) this.leaveTalk();
    this.inTalk = false;
    this.closeAllListen();
    this.stopSpeaking();
    this.model = s >= 0 ? newModel(s) : null;
    this.wasListed = false;
  }

  private leaveTalk(): void {
    const m = this.model;
    if (m) this.send({ t: "leave", from: this.selfId, s: m.s });
    if (m) this.forget(m, this.selfId);
    this.stopSpeaking();
    this.wasListed = false;
  }

  private beat(): void {
    const m = this.model;
    if (!m || !this.inTalk || !this.canSpeak() || this.role() === "dismissed") return;
    this.lastBeat = Date.now();
    this.touch(m, this.selfId, this.nick);
    this.send({ t: "here", from: this.selfId, s: m.s, nick: this.nick });
  }

  private touch(m: Model, id: string, nick: string): void {
    const now = Date.now();
    const cur = m.members.get(id);
    if (cur) {
      cur.last = now;
      cur.nick = nick;
    } else {
      if (m.members.size >= 40) return;
      m.members.set(id, { nick, first: now, last: now });
    }
  }

  private forget(m: Model, id: string): void {
    m.members.delete(id);
    m.dismissed.delete(id);
    m.sp = m.sp.filter((x) => x.id !== id);
    m.q = m.q.filter((x) => x.id !== id);
  }

  // ───────────────────────── ciclo ─────────────────────────

  private tick(): void {
    const m = this.model;
    if (this.disposed || !m) return;
    const now = Date.now();
    if (this.inTalk && now - this.lastBeat >= BEAT_MS) this.beat();
    // Quem não bate o ponto há muito tempo saiu (ou caiu).
    for (const [id, x] of m.members) if (id !== this.selfId && now - x.last > STALE_MS) this.forget(m, id);

    this.electHost(m, now);
    if (m.host === this.selfId && this.inTalk) {
      this.hostStep(m, now);
      if (now - m.lastRoster >= ROSTER_MS) this.publish(m);
    }
    this.syncSpeaking(m);
    this.syncListening(m, now);
    this.refresh();
  }

  /** Sem lista recente do anfitrião: o falante seguinte assume; sem falantes, o de menor id na área. */
  private electHost(m: Model, now: number): void {
    if (!this.inTalk || !this.canSpeak() || this.role() === "dismissed") return;
    if (m.host && m.host !== this.selfId && now - m.rosterAt < ROSTER_TIMEOUT_MS) return;
    if (m.host === this.selfId || now - m.created < BOOTSTRAP_WAIT_MS) return;
    const alive = [...m.members.keys()].filter((id) => id === this.selfId || now - (m.members.get(id)?.last ?? 0) <= STALE_MS);
    const prevSeat = m.sp.find((x) => alive.includes(x.id));
    const candidate = prevSeat?.id ?? [...alive].sort()[0];
    if (candidate !== this.selfId) return;
    m.host = this.selfId;
    m.ep += 1;
    m.rosterAt = now;
    m.lastRoster = 0;
  }

  /** Anfitrião: promove a fila, pergunta quem sai e publica. */
  private hostStep(m: Model, now: number): void {
    const known = (id: string) => id === this.selfId || now - (m.members.get(id)?.last ?? 0) <= STALE_MS;
    const before = JSON.stringify([m.sp, m.q, m.pr]);
    m.sp = m.sp.filter((x) => known(x.id) && m.members.has(x.id));
    m.q = m.q.filter((x) => known(x.id) && m.members.has(x.id) && !m.sp.some((s) => s.id === x.id));
    const listed = new Set([...m.sp, ...m.q].map((x) => x.id));
    const fresh = [...m.members.entries()]
      .filter(([id, x]) => !listed.has(id) && !m.dismissed.has(id) && known(id) && x.last >= now - STALE_MS)
      .sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1));
    for (const [id, x] of fresh) if (m.q.length < MAX_QUEUE) m.q.push({ id, nick: x.nick });
    while (m.sp.length < MAX_SEATS && m.q.length) m.sp.push(m.q.shift()!);
    if (m.sp.length === MAX_SEATS && m.q.length) {
      const newcomer = m.q[0]!;
      if (!m.prompt || m.prompt.newcomer.id !== newcomer.id) m.prompt = { newcomer, older: m.sp[0]!, newer: m.sp[1]!, deadline: now + DECIDE_MS };
      else m.prompt = { ...m.prompt, older: m.sp[0]!, newer: m.sp[1]! };
      if (now >= m.prompt.deadline) this.resolve(m, "older");
    } else m.prompt = null;
    m.pr = m.prompt?.newcomer.id ?? null;
    if (JSON.stringify([m.sp, m.q, m.pr]) !== before) this.publish(m);
  }

  private resolve(m: Model, choice: "older" | "newer"): void {
    const prompt = m.prompt;
    if (!prompt || m.sp.length < MAX_SEATS) return;
    const leaving = choice === "older" ? m.sp[0]! : m.sp[1]!;
    m.sp = m.sp.filter((x) => x.id !== leaving.id);
    m.dismissed.add(leaving.id);
    m.q = m.q.filter((x) => x.id !== prompt.newcomer.id);
    m.sp.push(prompt.newcomer);
    m.prompt = null;
    m.pr = null;
  }

  private publish(m: Model): void {
    m.lastRoster = Date.now();
    const host = m.sp[0]?.id ?? this.selfId;
    this.send({ t: "roster", from: this.selfId, s: m.s, ep: m.ep, host, sp: m.sp, q: m.q, pr: m.pr, dm: [...m.dismissed].slice(0, 16) });
    if (host !== this.selfId) {
      // Passou a vez de anfitrião (o mais antigo saiu): quem agora é o mais antigo continua daqui.
      m.host = host;
      m.prompt = null;
    } else m.host = this.selfId;
    m.rosterAt = Date.now();
  }

  // ───────────────────────── falar ─────────────────────────

  private syncSpeaking(m: Model): void {
    const seat = m.sp.some((x) => x.id === this.selfId);
    if (seat && this.inTalk && this.canSpeak()) {
      if (!this.stream && !this.starting) void this.startMic();
    } else if (this.stream || this.starting) this.stopSpeaking();
  }

  private async startMic(): Promise<void> {
    if (this.starting || this.stream || this.disposed) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.giveUp("Este navegador não permite usar o microfone.");
      return;
    }
    this.starting = true;
    this.refresh(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.starting = false;
      this.giveUp("Microfone não liberado. Permita o acesso e entre de novo na área de fala.");
      return;
    }
    this.starting = false;
    const m = this.model;
    // Durante o pedido de permissão o jogador pode ter saído, sido silenciado ou perdido o lugar.
    if (this.disposed || !m || !this.inTalk || !this.canSpeak() || !m.sp.some((x) => x.id === this.selfId)) {
      stream.getTracks().forEach((t) => t.stop());
      this.refresh();
      return;
    }
    stream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this.stream = stream;
    this.refresh(null);
  }

  /** Sem microfone não dá para ocupar o lugar: sai da lista e avisa. */
  private giveUp(message: string): void {
    const m = this.model;
    if (m) {
      this.send({ t: "leave", from: this.selfId, s: m.s });
      this.forget(m, this.selfId);
    }
    this.wasListed = true; // vira "dispensado": só volta saindo e entrando de novo na área
    this.lastListedAt = 0;
    this.refresh(message);
  }

  private stopSpeaking(): void {
    for (const pc of this.out.values()) pc.close();
    this.out.clear();
    this.outIce.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.starting = false;
  }

  // ───────────────────────── ouvir ─────────────────────────

  private syncListening(m: Model, now: number): void {
    const want = new Set(this.inHear ? m.sp.filter((x) => x.id !== this.selfId).map((x) => x.id) : []);
    for (const id of [...this.inc.keys()]) if (!want.has(id)) this.closeListen(id);
    for (const id of want) {
      if (this.inc.has(id)) continue;
      if (now - (this.lastJoinAt.get(id) ?? 0) < JOIN_RETRY_MS) continue;
      this.lastJoinAt.set(id, now);
      if (this.lastJoinAt.size > 60) this.lastJoinAt.clear();
      this.send({ t: "join", from: this.selfId, to: id, s: m.s });
    }
  }

  private closeListen(speaker: string): void {
    const l = this.inc.get(speaker);
    if (!l) return;
    l.pc.close();
    if (l.audio) l.audio.srcObject = null;
    this.inc.delete(speaker);
  }

  private closeAllListen(): void {
    for (const id of [...this.inc.keys()]) this.closeListen(id);
    this.lastJoinAt.clear();
  }

  // ───────────────────────── mensagens ─────────────────────────

  /** Mensagem recebida (já validada por `parseVoiceMsg`). */
  async handle(msg: VoiceMsg): Promise<void> {
    if (this.disposed || msg.from === this.selfId) return;
    const m = this.model;
    if (!m || msg.s !== m.s) return; // outro palanque
    try {
      switch (msg.t) {
        case "here": {
          this.touch(m, msg.from, msg.nick);
          return;
        }
        case "leave":
          this.forget(m, msg.from);
          if (m.host === this.selfId) this.publish(m);
          return;
        case "roster": {
          const newer = msg.ep > m.ep || (msg.ep === m.ep && (m.host === null || msg.from < m.host));
          if (!newer && msg.from !== m.host) return;
          m.ep = msg.ep;
          m.host = msg.host;
          m.sp = msg.sp;
          m.q = msg.q;
          m.pr = msg.pr;
          m.dismissed = new Set(msg.dm);
          m.rosterAt = Date.now();
          if (msg.host !== this.selfId) m.prompt = null;
          else m.lastRoster = 0;
          // Quem está na lista também conta como presente (o batimento dele pode ainda não ter chegado).
          for (const x of [...msg.sp, ...msg.q]) if (x.id !== this.selfId && !m.members.has(x.id)) this.touch(m, x.id, x.nick);
          this.refresh();
          return;
        }
        case "join":
          if (msg.to === this.selfId && this.stream && m.sp.some((x) => x.id === this.selfId)) {
            const now = Date.now();
            if (now - (this.lastJoinFrom.get(msg.from) ?? 0) < 2000) return;
            this.lastJoinFrom.set(msg.from, now);
            if (this.lastJoinFrom.size > 100) this.lastJoinFrom.clear();
            await this.offerTo(msg.from, m.s);
          }
          return;
        case "offer":
          if (msg.to === this.selfId && this.inHear && m.sp.some((x) => x.id === msg.from)) await this.answerTo(msg);
          return;
        case "answer": {
          const pc = msg.to === this.selfId ? this.out.get(msg.from) : undefined;
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
            for (const c of this.outIce.get(msg.from) ?? []) await pc.addIceCandidate(c).catch(() => {});
            this.outIce.delete(msg.from);
          }
          return;
        }
        case "ice": {
          if (msg.to !== this.selfId) return;
          if (msg.sp) {
            const l = this.inc.get(msg.from);
            if (!l) return;
            if (l.pc.remoteDescription) await l.pc.addIceCandidate(msg.c);
            else if (l.pendingIce.length < 50) l.pendingIce.push(msg.c);
          } else {
            const pc = this.out.get(msg.from);
            if (pc?.remoteDescription) await pc.addIceCandidate(msg.c);
            else if (pc) {
              const list = this.outIce.get(msg.from) ?? [];
              if (list.length < 50) this.outIce.set(msg.from, [...list, msg.c]);
            }
          }
          return;
        }
      }
    } catch {
      /* mensagem fora de hora ou candidato inválido: ignora */
    }
  }

  private async offerTo(listener: string, s: number): Promise<void> {
    if (!this.stream) return;
    if (!this.out.has(listener) && this.out.size >= MAX_LISTENERS) return;
    this.out.get(listener)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.out.set(listener, pc);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: "ice", from: this.selfId, to: listener, s, sp: true, c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        if (this.out.get(listener) === pc) this.out.delete(listener);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (offer.sdp) this.send({ t: "offer", from: this.selfId, to: listener, s, sdp: offer.sdp });
  }

  private async answerTo(msg: Extract<VoiceMsg, { t: "offer" }>): Promise<void> {
    this.closeListen(msg.from);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const listen: Listen = { pc, audio: null, pendingIce: [] };
    this.inc.set(msg.from, listen);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: "ice", from: this.selfId, to: msg.from, s: msg.s, sp: false, c: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const audio = listen.audio ?? new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      audio.volume = this.volume;
      listen.audio = audio;
      void audio.play().catch(() => this.refresh("Toque na tela para liberar o som do palanque."));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.inc.get(msg.from) === listen) this.closeListen(msg.from);
      }
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      for (const c of listen.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      if (ans.sdp) this.send({ t: "answer", from: this.selfId, to: msg.from, s: msg.s, sdp: ans.sdp });
    } catch {
      // Oferta inválida: solta a conexão para a nova tentativa de `join` poder tentar de novo.
      this.closeListen(msg.from);
    }
  }
}
