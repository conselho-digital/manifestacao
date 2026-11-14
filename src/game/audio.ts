let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** AudioContext único do jogo (motores, tiros e voz passam todos pelo ganho mestre). */
export function audioCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!master) { master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination); }
    return ctx;
  } catch {
    return null;
  }
}

/** Saída comum: tudo que toca passa por aqui. */
export function audioOut(): AudioNode | null {
  return audioCtx() ? master : null;
}

// ---------- proximidade ----------

/** Posição e direção de quem ouve (a câmera). O main atualiza todo quadro. */
const listener = { x: 0, z: 0, yaw: 0 };
export function setListener(x: number, z: number, yaw: number): void {
  listener.x = x; listener.z = z; listener.yaw = yaw;
}

/** Volume (0..1) e lado (-1 esquerda .. +1 direita) de uma fonte em (x, z); some em `range` metros; perto do ouvinte (< `near`) é cheio. */
export function proximity(x: number, z: number, range: number, near = 3): { gain: number; pan: number } {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const d = Math.hypot(dx, dz);
  const k = Math.min(1, Math.max(0, 1 - (d - near) / Math.max(1, range - near)));
  // com a câmera olhando para +Z (yaw 0), a direita da tela é -X
  const pan = d < 0.5 ? 0 : (dx * -Math.cos(listener.yaw) + dz * Math.sin(listener.yaw)) / d;
  return { gain: k * k, pan: Math.max(-1, Math.min(1, pan)) * 0.85 };
}

// ---------- motores ----------

interface EngineProfile {
  /** formas de onda das duas vozes */
  a: OscillatorType; b: OscillatorType;
  /** marcha lenta e topo (Hz) da voz principal; a segunda fica numa razão da primeira */
  idle: number; top: number; ratio: number;
  /** filtro passa-baixa (Hz) em marcha lenta e no topo */
  cutIdle: number; cutTop: number;
  /** pulsos por segundo na marcha lenta (batida de motor V-twin/V8) e profundidade 0..1 */
  lope: number; lopeDepth: number;
  /** volume relativo */
  vol: number;
  /** velocidade (m/s) em que chega ao topo de giro */
  topSpeed: number;
  /** usa o som gravado (partida, marcha lenta e aceleração) em vez do sintetizado */
  sample?: SampleName;
}

/** Cada veículo tem seu motor: o Blista (agora Gol no jogo) usa o som gravado do dono, o Buffalo e o Clover V8 graves, etc. */
const PROFILES: Record<string, EngineProfile> = {
  blistac: { a: 'sawtooth', b: 'square', idle: 52, top: 130, ratio: 0.5, cutIdle: 330, cutTop: 900, lope: 0, lopeDepth: 0, vol: 1, topSpeed: 28, sample: 'harley' },
  buffalo: { a: 'sawtooth', b: 'sawtooth', idle: 30, top: 78, ratio: 0.5, cutIdle: 220, cutTop: 520, lope: 13, lopeDepth: 0.35, vol: 1.15, topSpeed: 28 },
  clover: { a: 'square', b: 'triangle', idle: 36, top: 96, ratio: 0.5, cutIdle: 260, cutTop: 620, lope: 9, lopeDepth: 0.25, vol: 1.05, topSpeed: 28 },
  harley: { a: 'sawtooth', b: 'square', idle: 26, top: 90, ratio: 0.5, cutIdle: 260, cutTop: 700, lope: 7, lopeDepth: 0.55, vol: 1.2, topSpeed: 20, sample: 'harley' },
  triumph: { a: 'sawtooth', b: 'square', idle: 58, top: 210, ratio: 0.5, cutIdle: 520, cutTop: 1500, lope: 0, lopeDepth: 0, vol: 1, topSpeed: 20 },
  bmw: { a: 'sawtooth', b: 'sawtooth', idle: 84, top: 330, ratio: 1.005, cutIdle: 800, cutTop: 2400, lope: 0, lopeDepth: 0, vol: 0.95, topSpeed: 20, sample: 'sport' },
  suzuki: { a: 'square', b: 'sawtooth', idle: 96, top: 380, ratio: 1.003, cutIdle: 900, cutTop: 2800, lope: 0, lopeDepth: 0, vol: 0.95, topSpeed: 20, sample: 'sport' },
};
const FALLBACK: EngineProfile = PROFILES.blistac!;
const ENGINE_RANGE = 70; // metros até sumir
const SKID_RANGE = 55;

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// Sons gravados (enviados pelo dono): partida (ao subir), marcha lenta (loop) e aceleração (loop). 'sport' = BMW e Suzuki; 'harley' = Harley.
const SAMPLE_SETS = {
  sport: { start: '/sounds/moto-start.wav', idle: '/sounds/moto-idle.wav', rev: '/sounds/moto-rev.wav', idleRate: [0.9, 0.35], revRate: [0.75, 0.6] },
  harley: { start: '/sounds/harley-start.wav', idle: '/sounds/harley-idle.wav', rev: '/sounds/harley-rev.wav', idleRate: [0.95, 0.2], revRate: [0.8, 0.45] },
} as const;
type SampleName = keyof typeof SAMPLE_SETS;
type SampleSet = { start: AudioBuffer; idle: AudioBuffer; rev: AudioBuffer };
const sampleBufs = new Map<SampleName, SampleSet>();
const sampleLoading = new Set<SampleName>();
/** Baixa e decodifica os 3 sons de um conjunto (uma vez). Até ficarem prontos, a moto usa o motor sintetizado. */
function loadSamples(name: SampleName): void {
  if (sampleBufs.has(name) || sampleLoading.has(name)) return;
  const c = audioCtx();
  if (!c) return;
  sampleLoading.add(name);
  const keys = ['start', 'idle', 'rev'] as const;
  Promise.all(keys.map((k) => fetch(SAMPLE_SETS[name][k]).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b))))
    .then((bufs) => { sampleBufs.set(name, { start: bufs[0]!, idle: bufs[1]!, rev: bufs[2]! }); })
    .catch(() => { sampleLoading.delete(name); });
}

interface SampleVoice { mix: GainNode; pan: StereoPannerNode; idle: AudioBufferSourceNode; idleG: GainNode; rev: AudioBufferSourceNode; revG: GainNode }

/** Motor sintético por veículo + chiado de pneu ao derrapar. Um par por carro; o volume e o lado seguem a posição do veículo. */
export class EngineSound {
  private readonly p: EngineProfile;
  constructor(model?: string) {
    this.p = (model && PROFILES[model]) || FALLBACK;
    if (this.p.sample) loadSamples(this.p.sample); // já baixa os sons gravados para a partida tocar no 1º uso
  }

  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private lopeGain: GainNode | null = null;
  private lope: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private pan: StereoPannerNode | null = null;
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidPan: StereoPannerNode | null = null;
  private skidSrc: AudioBufferSourceNode | null = null;
  private failed = false;
  private samp: SampleVoice | null = null;
  private wasOn = false;
  private gateAt = 0;

  private start(): boolean {
    if (this.osc) return true;
    if (this.failed) return false;
    const c = audioCtx();
    const out = audioOut();
    if (!c || !out) { this.failed = true; return false; }
    try {
      const p = this.p;
      this.filter = c.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = p.cutIdle;
      this.lopeGain = c.createGain(); // pulsação da marcha lenta (batida do V-twin / V8)
      this.lopeGain.gain.value = 1;
      this.gain = c.createGain();
      this.gain.gain.value = 0;
      this.pan = c.createStereoPanner();
      this.osc = c.createOscillator();
      this.osc.type = p.a;
      this.osc2 = c.createOscillator();
      this.osc2.type = p.b;
      this.osc.connect(this.filter);
      this.osc2.connect(this.filter);
      this.filter.connect(this.lopeGain).connect(this.gain).connect(this.pan).connect(out);
      this.osc.start();
      this.osc2.start();
      if (p.lope > 0) {
        this.lope = c.createOscillator();
        this.lope.type = 'sine';
        this.lope.frequency.value = p.lope;
        const depth = c.createGain();
        depth.gain.value = p.lopeDepth * 0.5;
        this.lope.connect(depth).connect(this.lopeGain.gain);
        this.lopeGain.gain.value = 1 - p.lopeDepth * 0.5;
        this.lope.start();
      }
      // chiado de pneu: ruído filtrado em faixa
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      this.skidFilter = c.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.value = 1100;
      this.skidFilter.Q.value = 2.2;
      this.skidGain = c.createGain();
      this.skidGain.gain.value = 0;
      this.skidPan = c.createStereoPanner();
      src.connect(this.skidFilter).connect(this.skidGain).connect(this.skidPan).connect(out);
      src.start();
      this.skidSrc = src;
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Para e solta tudo do motor (veículo guardado ou jogador que saiu): sem isso os osciladores seguiam tocando para sempre, até com o carro já removido. */
  dispose(): void {
    try {
      this.osc?.stop(); this.osc2?.stop(); this.lope?.stop(); this.skidSrc?.stop();
      this.samp?.idle.stop(); this.samp?.rev.stop(); this.samp?.pan.disconnect();
      this.pan?.disconnect(); this.skidPan?.disconnect();
    } catch { /* já parado */ }
    this.osc = this.osc2 = this.lope = this.skidSrc = null;
    this.samp = null;
    this.gain = this.filter = this.pan = this.skidGain = this.skidFilter = this.skidPan = this.lopeGain = null;
    this.failed = true; // não recomeça depois de solto
  }

  /** Moto esportiva com som gravado: toca a partida ao subir, depois mistura marcha lenta e aceleração pelo acelerador; o tom sobe com a velocidade. */
  private sampleEngine(c: AudioContext, t: number, S: SampleSet, cfg: { idleRate: readonly number[]; revRate: readonly number[] }, on: boolean, rpm: number, throttle: number, prox: { gain: number; pan: number }): void {
    const out = audioOut();
    if (!out) return;
    if (!this.samp) {
      const mix = c.createGain();
      mix.gain.value = 0;
      const pan = c.createStereoPanner();
      mix.connect(pan).connect(out);
      const layer = (buf: AudioBuffer): { s: AudioBufferSourceNode; g: GainNode } => {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        const g = c.createGain();
        g.gain.value = 0;
        s.connect(g).connect(mix);
        s.start(0, Math.random() * buf.duration);
        return { s, g };
      };
      const i = layer(S.idle);
      const r = layer(S.rev);
      this.samp = { mix, pan, idle: i.s, idleG: i.g, rev: r.s, revG: r.g };
    }
    const sv = this.samp;
    if (on && !this.wasOn) {
      // ligou: toca a partida inteira; a marcha lenta entra quando ela está acabando
      const s = c.createBufferSource();
      s.buffer = S.start;
      const g = c.createGain();
      g.gain.value = 0.9 * this.p.vol * prox.gain;
      s.connect(g).connect(sv.pan);
      s.start(t);
      this.gateAt = t + S.start.duration - 0.45;
    }
    this.wasOn = on;
    const live = on && t >= this.gateAt;
    const a = Math.min(1, Math.max(0, throttle));
    sv.idleG.gain.setTargetAtTime(1 - a * 0.85, t, 0.12);
    sv.revG.gain.setTargetAtTime(a, t, 0.1);
    sv.idle.playbackRate.setTargetAtTime(cfg.idleRate[0]! + rpm * cfg.idleRate[1]!, t, 0.1);
    sv.rev.playbackRate.setTargetAtTime(cfg.revRate[0]! + rpm * cfg.revRate[1]!, t, 0.1);
    sv.mix.gain.setTargetAtTime(live ? 0.9 * this.p.vol * prox.gain * (0.4 + 0.6 * a) : 0, t, live ? 0.25 : 0.08);
    sv.pan.pan.setTargetAtTime(prox.pan, t, 0.05);
  }

  /**
   * on: motor ligado; speed em m/s; (x, z) posição do veículo (a distância ao ouvinte dá volume e lado);
   * throttle 0..1 (moto cai de volume sem acelerar); skid 0..1 = intensidade da derrapagem.
   */
  update(on: boolean, speed: number, x: number, z: number, throttle = 1, skid = 0): void {
    if (!on && !this.osc) return;
    const c = audioCtx();
    if (!c || !this.start() || !this.gain || !this.osc || !this.osc2 || !this.filter || !this.pan || !this.skidGain || !this.skidFilter || !this.skidPan) return;
    const p = this.p;
    const bike = p.topSpeed < 25;
    const rpm = Math.min(1, Math.abs(speed) / p.topSpeed);
    const f = p.idle + (p.top - p.idle) * rpm;
    const t = c.currentTime;
    const prox = proximity(x, z, ENGINE_RANGE);
    const set = p.sample ? sampleBufs.get(p.sample) : undefined;
    if (p.sample && !set) loadSamples(p.sample);
    if (p.sample && set) {
      this.sampleEngine(c, t, set, SAMPLE_SETS[p.sample], on, rpm, throttle, prox);
      this.gain.gain.setTargetAtTime(0, t, 0.05); // o motor sintetizado fica mudo
    } else {
      this.osc.frequency.setTargetAtTime(f, t, 0.08);
      this.osc2.frequency.setTargetAtTime(f * p.ratio, t, 0.08);
      this.filter.frequency.setTargetAtTime(p.cutIdle + (p.cutTop - p.cutIdle) * rpm, t, 0.1);
      if (this.lope) this.lope.frequency.setTargetAtTime(p.lope + rpm * 22, t, 0.1); // a batida acelera com o giro
      // sem acelerar o barulho cai rápido (a moto mantém a velocidade, só o som diminui)
      const level = bike ? 0.12 + 0.88 * throttle : 0.55 + 0.45 * throttle;
      const vol = on ? (0.02 + rpm * 0.034) * p.vol * prox.gain * level : 0;
      this.gain.gain.setTargetAtTime(vol, t, throttle > 0 || !bike ? 0.15 : 0.05);
    }
    this.pan.pan.setTargetAtTime(prox.pan, t, 0.05);
    // pneu cantando: mais agudo e mais forte com a velocidade
    const sk = on ? Math.min(1, skid) : 0;
    const sp = proximity(x, z, SKID_RANGE);
    this.skidGain.gain.setTargetAtTime(sk * 0.11 * sp.gain, t, sk > 0 ? 0.05 : 0.12);
    this.skidFilter.frequency.setTargetAtTime(900 + rpm * 900 + (bike ? 250 : 0), t, 0.1);
    this.skidPan.pan.setTargetAtTime(sp.pan, t, 0.05);
  }
}

// ---------- tiros ----------

export type ShotKind = 'rifle' | 'pistol' | 'silenced';
const SHOT_RANGE = 130;

/** Tiro no ponto (x, z): volume e lado vêm da distância ao ouvinte. O fuzil é grave e longo; a pistola, seca e curta. */
export function playShotAt(x: number, z: number, kind: ShotKind): void {
  const prox = proximity(x, z, kind === 'silenced' ? SHOT_RANGE * 0.4 : SHOT_RANGE, 4);
  if (prox.gain < 0.01) return;
  const c = audioCtx();
  const out = audioOut();
  if (!c || !out) return;
  try {
    const rifle = kind === 'rifle';
    const quiet = kind === 'silenced'; // Honey Badger: tiro baixo e abafado
    const dur = rifle ? 0.16 : quiet ? 0.07 : 0.09;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** (rifle ? 1.6 : 2.4);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    // longe, o ar come os agudos
    lp.frequency.value = (rifle ? 2600 : quiet ? 1300 : 4200) * (0.35 + 0.65 * prox.gain);
    const g = c.createGain();
    g.gain.value = (rifle ? 0.3 : quiet ? 0.07 : 0.24) * prox.gain;
    const pan = c.createStereoPanner();
    pan.pan.value = prox.pan;
    src.connect(lp).connect(g).connect(pan).connect(out);
    src.start();
    // estrondo grave do disparo
    const boom = c.createOscillator();
    const bg = c.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(rifle ? 120 : 170, c.currentTime);
    boom.frequency.exponentialRampToValueAtTime(40, c.currentTime + dur);
    bg.gain.setValueAtTime((quiet ? 0.05 : 0.22) * prox.gain, c.currentTime);
    bg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    boom.connect(bg).connect(pan);
    boom.start();
    boom.stop(c.currentTime + dur + 0.02);
  } catch { /* sem áudio */ }
}

/** Chiado da lata de spray (~1,4 s) no ponto (x, z); só se ouve de perto. */
export function playSprayAt(x: number, z: number): void {
  const prox = proximity(x, z, 28, 3);
  if (prox.gain < 0.02) return;
  const c = audioCtx();
  const out = audioOut();
  if (!c || !out) return;
  try {
    const dur = 1.4;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 400) * Math.min(1, (len - i) / 3000);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0.16 * prox.gain;
    const pan = c.createStereoPanner();
    pan.pan.value = prox.pan;
    src.connect(bp).connect(g).connect(pan).connect(out);
    src.start();
  } catch { /* sem áudio */ }
}

/**
 * Buzina do veículo em (x, z): carro = duas notas graves; moto = uma nota mais aguda e fina;
 * `truck` (viatura com a sirene ligada) = buzina de caminhão de bombeiros: grave, longa e rascante.
 * Ouve-se até ~80 m (a de caminhão, 120 m).
 */
export function playHornAt(x: number, z: number, bike: boolean, truck = false): void {
  const prox = proximity(x, z, truck ? 120 : 80, 6);
  if (prox.gain < 0.02) return;
  const c = audioCtx();
  const out = audioOut();
  if (!c || !out) return;
  try {
    const t0 = c.currentTime;
    const dur = truck ? 1.0 : 0.42;
    const peak = (truck ? 0.3 : 0.2) * prox.gain;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (truck ? 0.05 : 0.02));
    g.gain.setValueAtTime(peak, t0 + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = truck ? 1300 : bike ? 2600 : 1800;
    const pan = c.createStereoPanner();
    pan.pan.value = prox.pan;
    g.connect(lp).connect(pan).connect(out);
    const notes: [number, OscillatorType][] = truck
      ? [[138, 'sawtooth'], [174, 'sawtooth'], [277, 'square'], [349, 'sawtooth']] // acorde grave de trompa de ar, como um caminhão de bombeiros
      : bike ? [[660, 'sawtooth'], [840, 'sawtooth']] : [[410, 'sawtooth'], [515, 'sawtooth']];
    for (const [f, type] of notes) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      if (truck) { // um leve vibrato de ar dá o "tuuuu" rascante
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = 7 + Math.random() * 2;
        lg.gain.value = f * 0.008;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.02);
      }
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
  } catch { /* sem áudio */ }
}

/** Batida de lataria (metal amassando): estalo de ruído + "clanks" metálicos; `k` 0..1 = força. */
export function playCrashAt(x: number, z: number, k: number): void {
  const prox = proximity(x, z, 90, 5);
  const v = prox.gain * Math.min(1, 0.35 + k);
  if (v < 0.02) return;
  const c = audioCtx();
  const out = audioOut();
  if (!c || !out) return;
  try {
    const t0 = c.currentTime;
    const dur = 0.5 + k * 0.3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.4 * v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const pan = c.createStereoPanner();
    pan.pan.value = prox.pan;
    g.connect(pan).connect(out);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.12));
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + k * 1200;
    bp.Q.value = 0.8;
    src.connect(bp).connect(g);
    src.start(t0);
    for (const f of [430, 790, 1310, 2150]) { // partes da lataria soltas batendo
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      const og = c.createGain();
      og.gain.setValueAtTime(0.08 * v, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25 + Math.random() * 0.25);
      o.connect(og).connect(pan);
      o.start(t0);
      o.stop(t0 + 0.55);
    }
  } catch { /* sem áudio */ }
}

/** Metal raspando na parede (lata riscando): ruído rascante contínuo; `update(k, x, z)` com k 0..1 a cada quadro (0 = parado). */
export class ScrapeSound {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private failed = false;

  private start(): boolean {
    if (this.src) return true;
    if (this.failed) return false;
    const c = audioCtx();
    const out = audioOut();
    if (!c || !out) { this.failed = true; return false; }
    try {
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.55 + 0.45 * Math.sin(i / c.sampleRate * 2 * Math.PI * 38)); // raspar: ruído com trepidação de ~38 Hz
      this.src = c.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.filt = c.createBiquadFilter();
      this.filt.type = 'bandpass';
      this.filt.frequency.value = 2600;
      this.filt.Q.value = 3.5;
      this.gain = c.createGain();
      this.gain.gain.value = 0;
      this.pan = c.createStereoPanner();
      this.src.connect(this.filt).connect(this.gain).connect(this.pan).connect(out);
      this.src.start();
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Para o ruído (veículo removido). */
  dispose(): void {
    try { this.src?.stop(); this.pan?.disconnect(); } catch { /* já parado */ }
    this.src = this.gain = this.pan = this.filt = null;
    this.failed = true;
  }

  update(k: number, x: number, z: number): void {
    if (k < 0.02) {
      if (this.gain && audioCtx()) this.gain.gain.setTargetAtTime(0, audioCtx()!.currentTime, 0.06);
      return;
    }
    const c = audioCtx();
    if (!c || !this.start() || !this.gain || !this.pan || !this.filt) return;
    const prox = proximity(x, z, 70, 5);
    const t = c.currentTime;
    this.gain.gain.setTargetAtTime(0.22 * k * prox.gain, t, 0.04);
    this.filt.frequency.setTargetAtTime(1800 + k * 2600, t, 0.05);
    this.pan.pan.setTargetAtTime(prox.pan, t, 0.05);
  }
}

/** Sirene da viatura (lamento que sobe e desce): um par por carro; volume e lado seguem a posição do veículo (ouve-se até ~160 m). */
export class SirenSound {
  private osc: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private failed = false;

  private start(): boolean {
    if (this.osc) return true;
    if (this.failed) return false;
    const c = audioCtx();
    const out = audioOut();
    if (!c || !out) { this.failed = true; return false; }
    try {
      this.osc = c.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 1000;
      this.lfo = c.createOscillator();
      this.lfo.type = 'triangle';
      this.lfo.frequency.value = 0.55; // um lamento a cada ~1,8 s
      const depth = c.createGain();
      depth.gain.value = 420; // varre de ~600 a ~1400 Hz
      this.lfo.connect(depth).connect(this.osc.frequency);
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1500;
      filt.Q.value = 0.6;
      this.gain = c.createGain();
      this.gain.gain.value = 0;
      this.pan = c.createStereoPanner();
      this.osc.connect(filt).connect(this.gain).connect(this.pan).connect(out);
      this.osc.start();
      this.lfo.start();
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Para a sirene (veículo removido). */
  dispose(): void { this.stop(); }

  private stop(): void {
    try { this.osc?.stop(); this.lfo?.stop(); this.gain?.disconnect(); } catch { /* já parado */ }
    this.osc = this.lfo = null;
    this.gain = null;
    this.pan = null;
  }

  update(on: boolean, x: number, z: number): void {
    if (!on) { if (this.osc) this.stop(); return; }
    const c = audioCtx();
    if (!c || !this.start() || !this.gain || !this.pan) return;
    const prox = proximity(x, z, 160, 8);
    const t = c.currentTime;
    this.gain.gain.setTargetAtTime(0.11 * prox.gain, t, 0.08);
    this.pan.pan.setTargetAtTime(prox.pan, t, 0.05);
  }
}

/** Clique de arma vazia (só quem atira ouve). */
export function playClick(): void {
  const c = audioCtx();
  const out = audioOut();
  if (!c || !out) return;
  try {
    const len = Math.floor(c.sampleRate * 0.02);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.08;
    src.connect(g).connect(out);
    src.start();
  } catch { /* sem áudio */ }
}
