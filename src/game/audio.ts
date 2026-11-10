let ctx: AudioContext | null = null;

/** Motor sintético baixo: dois osciladores graves filtrados. Um por carro. */
export class EngineSound {
  /** 'car' = grave e baixo; 'bike' = mais agudo e mais rápido a subir de giro (pronto para as motos) */
  constructor(private readonly kind: 'car' | 'bike' = 'car') {}

  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private failed = false;

  private start(): boolean {
    if (this.osc) return true;
    if (this.failed) return false;
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 320;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.osc = ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc.connect(this.filter);
      this.osc2.connect(this.filter);
      this.filter.connect(this.gain).connect(ctx.destination);
      this.osc.start();
      this.osc2.start();
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** on: motor ligado; speed em m/s (0 a 14); near: 0 a 1 (distância ao jogador). Volume sempre baixo. */
  update(on: boolean, speed: number, near: number, throttle = 1): void {
    if (!on && !this.osc) return;
    if (!this.start() || !ctx || !this.gain || !this.osc || !this.osc2 || !this.filter) return;
    const rpm = Math.min(1, Math.abs(speed) / (this.kind === 'bike' ? 20 : 28));
    const bike = this.kind === 'bike';
    const f = bike ? 70 + rpm * 190 : 38 + rpm * 70; // marcha lenta, sobe com a velocidade
    const t = ctx.currentTime;
    this.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.filter.frequency.setTargetAtTime(bike ? 500 + rpm * 900 : 260 + rpm * 380, t, 0.1);
    // sem acelerar o barulho cai rápido (a moto mantém a velocidade, só o som diminui)
    const level = this.kind === 'bike' ? 0.12 + 0.88 * throttle : 1;
    const vol = on ? (0.018 + rpm * 0.03) * Math.max(0, near) * level : 0;
    this.gain.gain.setTargetAtTime(vol, t, throttle > 0 || this.kind !== 'bike' ? 0.15 : 0.05);
  }
}

/** Som de tiro sintético (ruído curto). vol: 0 a 1 (já com distância aplicada). */
export function playShot(vol: number, empty = false): void {
  if (vol < 0.02) return;
  try {
    ctx ??= new AudioContext();
    const len = Math.floor(ctx.sampleRate * (empty ? 0.02 : 0.09));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = (empty ? 0.08 : 0.25) * Math.min(1, vol);
    src.connect(g).connect(ctx.destination);
    src.start();
  } catch { /* sem áudio */ }
}
