let ctx: AudioContext | null = null;

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
