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
}

/** Cada veículo tem seu motor: o Blista é um 4 cilindros agudo, o Buffalo e o Clover V8 graves, a Spin um 4 cilindros de van, etc. */
const PROFILES: Record<string, EngineProfile> = {
  blistac: { a: 'sawtooth', b: 'square', idle: 52, top: 130, ratio: 0.5, cutIdle: 330, cutTop: 900, lope: 0, lopeDepth: 0, vol: 1, topSpeed: 28 },
  buffalo: { a: 'sawtooth', b: 'sawtooth', idle: 30, top: 78, ratio: 0.5, cutIdle: 220, cutTop: 520, lope: 13, lopeDepth: 0.35, vol: 1.15, topSpeed: 28 },
  clover: { a: 'square', b: 'triangle', idle: 36, top: 96, ratio: 0.5, cutIdle: 260, cutTop: 620, lope: 9, lopeDepth: 0.25, vol: 1.05, topSpeed: 28 },
  spin: { a: 'sawtooth', b: 'sawtooth', idle: 60, top: 150, ratio: 0.501, cutIdle: 420, cutTop: 1100, lope: 0, lopeDepth: 0, vol: 0.9, topSpeed: 28 },
  harley: { a: 'sawtooth', b: 'square', idle: 26, top: 90, ratio: 0.5, cutIdle: 260, cutTop: 700, lope: 7, lopeDepth: 0.55, vol: 1.2, topSpeed: 20 },
  triumph: { a: 'sawtooth', b: 'square', idle: 58, top: 210, ratio: 0.5, cutIdle: 520, cutTop: 1500, lope: 0, lopeDepth: 0, vol: 1, topSpeed: 20 },
  bmw: { a: 'sawtooth', b: 'sawtooth', idle: 84, top: 330, ratio: 1.005, cutIdle: 800, cutTop: 2400, lope: 0, lopeDepth: 0, vol: 0.95, topSpeed: 20 },
  suzuki: { a: 'square', b: 'sawtooth', idle: 96, top: 380, ratio: 1.003, cutIdle: 900, cutTop: 2800, lope: 0, lopeDepth: 0, vol: 0.95, topSpeed: 20 },
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

/** Motor sintético por veículo + chiado de pneu ao derrapar. Um par por carro; o volume e o lado seguem a posição do veículo. */
export class EngineSound {
  private readonly p: EngineProfile;
  constructor(model?: string) { this.p = (model && PROFILES[model]) || FALLBACK; }

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
  private failed = false;

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
      return true;
    } catch {
      this.failed = true;
      return false;
    }
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
    this.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2.frequency.setTargetAtTime(f * p.ratio, t, 0.08);
    this.filter.frequency.setTargetAtTime(p.cutIdle + (p.cutTop - p.cutIdle) * rpm, t, 0.1);
    if (this.lope) this.lope.frequency.setTargetAtTime(p.lope + rpm * 22, t, 0.1); // a batida acelera com o giro
    const prox = proximity(x, z, ENGINE_RANGE);
    // sem acelerar o barulho cai rápido (a moto mantém a velocidade, só o som diminui)
    const level = bike ? 0.12 + 0.88 * throttle : 0.55 + 0.45 * throttle;
    const vol = on ? (0.02 + rpm * 0.034) * p.vol * prox.gain * level : 0;
    this.gain.gain.setTargetAtTime(vol, t, throttle > 0 || !bike ? 0.15 : 0.05);
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
