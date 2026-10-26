import { useEffect, useRef, type MutableRefObject } from "react";
import type { VehicleId } from "@manifestacao/shared";
import { currentLocalVolume } from "../config/parkScreen.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";
import { maxSpeedOf } from "./driving.js";
import type { PlayerTransform } from "./Player.js";
import { useUserGestureUnlocked } from "./useUserGesture.js";

/**
 * Som de motor sintetizado (sem arquivos): cada veículo tem a sua "voz" (moto aguda, carro médio, caminhão diesel grave)
 * e as marchas são emuladas pela velocidade — a rotação sobe dentro da marcha, cai na troca e o motor "segura" ao
 * soltar o acelerador. Quem ouve é só quem está perto: o volume cai com a distância e o som vai para o lado em que o
 * veículo está. Nada disso trafega pela rede: a velocidade de cada veículo é estimada pelo deslocamento dele.
 */

interface EngineProfile {
  /** Frequência de ignição (Hz) em marcha lenta e no limite de giros. */
  idle: number;
  red: number;
  /** Velocidade (fração da máxima) em que cada marcha acaba; a última vai até 1. */
  gears: number[];
  /** Rotação (0–1) logo depois de engatar a marcha seguinte. */
  afterShift: number;
  /** Duração do corte de aceleração na troca (s). */
  shiftTime: number;
  /** Filtro: abertura (Hz) em baixa e alta rotação — quanto mais alto, mais "agudo/agressivo". */
  cutLow: number;
  cutHigh: number;
  /** Mistura: serra, quadrada (uma oitava abaixo), harmônico agudo, sopro/escapamento. */
  mix: { saw: number; square: number; high: number; noise: number };
  /** Profundidade do "trepidar" do motor (0–1) e volume geral. */
  rattle: number;
  volume: number;
  /** Distância (u) em que o som some. */
  radius: number;
}

const PROFILES: Partial<Record<VehicleId, EngineProfile>> = {
  moto: { idle: 38, red: 210, gears: [0.16, 0.34, 0.54, 0.76], afterShift: 0.5, shiftTime: 0.14, cutLow: 700, cutHigh: 4200, mix: { saw: 0.5, square: 0.25, high: 0.2, noise: 0.07 }, rattle: 0.14, volume: 0.9, radius: 36 },
  moto2: { idle: 44, red: 270, gears: [0.14, 0.3, 0.48, 0.68, 0.86], afterShift: 0.55, shiftTime: 0.11, cutLow: 900, cutHigh: 5600, mix: { saw: 0.55, square: 0.15, high: 0.3, noise: 0.07 }, rattle: 0.1, volume: 1, radius: 42 },
  carro: { idle: 25, red: 150, gears: [0.14, 0.3, 0.5, 0.74], afterShift: 0.45, shiftTime: 0.2, cutLow: 380, cutHigh: 2300, mix: { saw: 0.5, square: 0.4, high: 0.1, noise: 0.05 }, rattle: 0.1, volume: 0.85, radius: 34 },
  carro_som: { idle: 23, red: 140, gears: [0.14, 0.3, 0.5, 0.74], afterShift: 0.45, shiftTime: 0.22, cutLow: 340, cutHigh: 2000, mix: { saw: 0.45, square: 0.45, high: 0.08, noise: 0.05 }, rattle: 0.12, volume: 0.85, radius: 34 },
  caminhao: { idle: 14, red: 78, gears: [0.12, 0.26, 0.44, 0.66], afterShift: 0.5, shiftTime: 0.32, cutLow: 240, cutHigh: 1300, mix: { saw: 0.35, square: 0.6, high: 0.05, noise: 0.09 }, rattle: 0.38, volume: 1, radius: 48 },
};

const TICK_MS = 60;
/** Quantos motores tocam ao mesmo tempo (os mais próximos): mais que isso é bagunça e peso. */
const MAX_VOICES = 6;
/** Fração do volume que o motor do próprio veículo tem (ele está dentro do som, não ao lado). */
const SELF_GAIN = 0.55;

let sharedCtx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
function audioCtx(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

function softClip(): Float32Array<ArrayBuffer> {
  const n = 256;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 2.2);
  }
  return c;
}

/** Um motor tocando: osciladores → filtro → saturação → volume → lado. */
class EngineVoice {
  private readonly saw: OscillatorNode;
  private readonly square: OscillatorNode;
  private readonly high: OscillatorNode;
  private readonly lfo: OscillatorNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly trem: GainNode;
  private readonly out: GainNode;
  private readonly pan: StereoPannerNode | null;
  private readonly nodes: AudioNode[] = [];

  constructor(private readonly ctx: AudioContext, private readonly p: EngineProfile) {
    const mk = <T extends AudioNode>(n: T): T => (this.nodes.push(n), n);
    this.saw = mk(ctx.createOscillator());
    this.saw.type = "sawtooth";
    this.square = mk(ctx.createOscillator());
    this.square.type = "square";
    this.high = mk(ctx.createOscillator());
    this.high.type = "sawtooth";
    this.lfo = mk(ctx.createOscillator());
    this.lfo.type = "sine";
    const gSaw = mk(ctx.createGain());
    gSaw.gain.value = p.mix.saw;
    const gSq = mk(ctx.createGain());
    gSq.gain.value = p.mix.square;
    const gHi = mk(ctx.createGain());
    gHi.gain.value = p.mix.high;
    this.filter = mk(ctx.createBiquadFilter());
    this.filter.type = "lowpass";
    this.filter.Q.value = 2.2;
    const shaper = mk(ctx.createWaveShaper());
    shaper.curve = softClip();
    this.trem = mk(ctx.createGain());
    this.trem.gain.value = 1 - p.rattle / 2;
    const lfoDepth = mk(ctx.createGain());
    lfoDepth.gain.value = p.rattle / 2;
    this.out = mk(ctx.createGain());
    this.out.gain.value = 0;
    this.saw.connect(gSaw).connect(this.filter);
    this.square.connect(gSq).connect(this.filter);
    this.high.connect(gHi).connect(this.filter);
    this.filter.connect(shaper).connect(this.trem).connect(this.out);
    this.lfo.connect(lfoDepth).connect(this.trem.gain);
    // Sopro do escapamento: ruído em faixa média, mais forte com carga.
    this.noise = mk(ctx.createBufferSource());
    this.noise.buffer = noiseBuffer(ctx);
    this.noise.loop = true;
    const band = mk(ctx.createBiquadFilter());
    band.type = "bandpass";
    band.frequency.value = 700;
    band.Q.value = 0.7;
    this.noiseGain = mk(ctx.createGain());
    this.noiseGain.gain.value = 0;
    this.noise.connect(band).connect(this.noiseGain).connect(this.out);
    this.pan = typeof ctx.createStereoPanner === "function" ? mk(ctx.createStereoPanner()) : null;
    if (this.pan) this.out.connect(this.pan).connect(ctx.destination);
    else this.out.connect(ctx.destination);
    for (const o of [this.saw, this.square, this.high, this.lfo]) o.start();
    this.noise.start();
    this.set(0, 0, 0, 0);
  }

  /** rpm 0–1 (marcha lenta → limite), load 0–1 (aceleração), vol 0–1, pan −1..1. */
  set(rpm: number, load: number, vol: number, pan: number): void {
    const { ctx, p } = this;
    const t = ctx.currentTime;
    const f = p.idle + (p.red - p.idle) * rpm;
    const k = 0.05;
    this.saw.frequency.setTargetAtTime(f, t, k);
    this.square.frequency.setTargetAtTime(f * 0.5, t, k);
    this.high.frequency.setTargetAtTime(f * 2.004, t, k);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, k);
    this.filter.frequency.setTargetAtTime(p.cutLow + (p.cutHigh - p.cutLow) * rpm * (0.55 + 0.45 * load), t, k);
    this.noiseGain.gain.setTargetAtTime(p.mix.noise * (0.25 + 0.75 * load) * (0.4 + 0.6 * rpm), t, k);
    const level = p.volume * vol * (0.4 + 0.6 * load) * (0.55 + 0.45 * rpm);
    this.out.gain.setTargetAtTime(level, t, 0.06);
    this.pan?.pan.setTargetAtTime(pan, t, 0.1);
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    window.setTimeout(() => {
      for (const o of [this.saw, this.square, this.high, this.lfo]) {
        try {
          o.stop();
        } catch {
          /* já parado */
        }
      }
      try {
        this.noise.stop();
      } catch {
        /* já parado */
      }
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch {
          /* já desconectado */
        }
      }
    }, 300);
  }
}

/** Estado de um veículo ouvido: estimativa de velocidade, marcha e rotação. */
interface Tracker {
  voice: EngineVoice;
  vehicle: VehicleId;
  x: number;
  z: number;
  at: number;
  speed: number;
  accel: number;
  gear: number;
  rpm: number;
  shiftUntil: number;
  seen: number;
}

/** Marcha para a velocidade (fração da máxima), com histerese para não ficar trocando na fronteira. */
function pickGear(gears: number[], s: number, current: number): number {
  let g = Math.min(current, gears.length);
  while (g < gears.length && s > gears[g]!) g++;
  while (g > 0 && s < gears[g - 1]! - 0.04) g--;
  return g;
}

/** Rotação (0–1) dentro da marcha: sobe linear da rotação pós-troca até o giro máximo. */
function rpmFor(p: EngineProfile, gear: number, s: number): number {
  if (s < 0.01) return 0;
  const start = gear === 0 ? 0 : p.gears[gear - 1]!;
  const end = gear < p.gears.length ? p.gears[gear]! : 1;
  const frac = Math.max(0, Math.min(1, (s - start) / Math.max(0.001, end - start)));
  const lo = gear === 0 ? 0.12 : p.afterShift;
  return lo + (1 - lo) * frac * (gear === p.gears.length ? 0.9 : 1);
}

export function EngineSounds({
  playersRef,
  posRef,
  selfVehicle,
}: {
  playersRef: MutableRefObject<Map<string, RemotePlayer>>;
  posRef: MutableRefObject<PlayerTransform>;
  selfVehicle: VehicleId;
}) {
  const unlocked = useUserGestureUnlocked();
  const selfRef = useRef(selfVehicle);
  selfRef.current = selfVehicle;

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const trackers = new Map<string, Tracker>();
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.max(0.01, (now - last) / 1000);
      last = now;
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const me = posRef.current;
      const master = currentLocalVolume() / 100;

      // Quem pode ser ouvido: o próprio veículo + os dos outros jogadores dentro do alcance.
      const found: { key: string; vehicle: VehicleId; x: number; z: number; dist: number }[] = [];
      const sv = selfRef.current;
      if (PROFILES[sv]) found.push({ key: "self", vehicle: sv, x: me.x, z: me.z, dist: 0 });
      for (const [id, p] of playersRef.current) {
        const prof = PROFILES[p.vehicle];
        if (!prof) continue;
        if (p.x === 0 && p.z === 0) continue;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < prof.radius) found.push({ key: id, vehicle: p.vehicle, x: p.x, z: p.z, dist: d });
      }
      found.sort((a, b) => a.dist - b.dist);
      const audible = found.slice(0, MAX_VOICES);
      const keep = new Set(audible.map((f) => f.key));
      for (const [key, t] of trackers) {
        if (!keep.has(key) || t.vehicle !== found.find((f) => f.key === key)?.vehicle) {
          t.voice.dispose();
          trackers.delete(key);
        }
      }

      for (const f of audible) {
        const prof = PROFILES[f.vehicle]!;
        let t = trackers.get(f.key);
        if (!t) {
          t = { voice: new EngineVoice(ctx, prof), vehicle: f.vehicle, x: f.x, z: f.z, at: now, speed: 0, accel: 0, gear: 0, rpm: 0, shiftUntil: 0, seen: now };
          trackers.set(f.key, t);
        }
        // Velocidade: deslocamento numa janela de ~0,25 s (a rede entrega a posição em degraus, então leituras curtas oscilam).
        const span = (now - t.at) / 1000;
        if (span >= 0.22) {
          const inst = Math.hypot(f.x - t.x, f.z - t.z) / span;
          const prev = t.speed;
          t.speed += (Math.min(inst, maxSpeedOf(f.vehicle) * 1.3) - t.speed) * 0.55;
          t.accel += ((t.speed - prev) / span - t.accel) * 0.6;
          t.x = f.x;
          t.z = f.z;
          t.at = now;
        }

        const s = Math.min(1, t.speed / maxSpeedOf(f.vehicle));
        const g = pickGear(prof.gears, s, t.gear);
        if (g > t.gear) t.shiftUntil = now + prof.shiftTime * 1000; // troca para cima: corta o acelerador um instante
        t.gear = g;
        const target = rpmFor(prof, g, s);
        // Sobe rápido, desce devagar (o motor leva um tempo para perder giro na troca).
        const rate = target > t.rpm ? 9 : 4.5;
        t.rpm += (target - t.rpm) * Math.min(1, dt * rate);

        // Carga: acelerando = cheio; em velocidade constante = médio; soltou o pé = baixo; troca = corte.
        let load = t.accel > 0.25 ? 1 : t.accel < -0.4 ? 0.1 : s < 0.01 ? 0.25 : 0.55;
        if (now < t.shiftUntil) load = 0;

        const dist = f.dist;
        const fall = Math.pow(Math.max(0, 1 - dist / prof.radius), 1.6);
        const vol = master * fall * (f.key === "self" ? SELF_GAIN : 1);
        let pan = 0;
        if (f.key !== "self" && dist > 0.5) {
          const dx = (f.x - me.x) / dist;
          const dz = (f.z - me.z) / dist;
          // Direita de quem olha para (sin r, cos r) é (−cos r, sin r).
          pan = Math.max(-1, Math.min(1, (dx * -Math.cos(me.rotationY) + dz * Math.sin(me.rotationY)) * 0.8));
        }
        t.voice.set(t.rpm, load, vol, pan);
        t.seen = now;
      }
    };

    const timer = window.setInterval(tick, TICK_MS);
    const onVisibility = () => {
      if (document.hidden) void ctx.suspend().catch(() => undefined);
      else void ctx.resume().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const t of trackers.values()) t.voice.dispose();
      trackers.clear();
    };
  }, [unlocked, playersRef, posRef]);

  return null;
}
