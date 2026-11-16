// Felipe a partir do atlas pintado pelo dono (rosto/barba/orelhas): usa só o retângulo do rosto (0..323) sobre o atlas do Xandão, com ajuste vertical (WARP), pescoço e íris castanha.
// Uso: node felipe-atlas.mjs Xandao.glb atlas-do-dono.png Felipe.glb (o atlas do dono NÃO fica no repositório).
// Felipe a partir do atlas feito pelo dono: só o retângulo do rosto (0..323) entra no atlas original do Xandão (o terno fica como era).
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import sharp from 'sharp';
const [inGlb, userPng, outGlb] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const d = await io.read(inGlb);
const tex = d.getRoot().listTextures()[0];
const at = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = at.info.width, H = at.info.height, A = at.data;
const u = await sharp(userPng).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer(); console.log('atlas', W, H);
const FX = +(process.env.FX || 324), FY = +(process.env.FY || 324);
// o rosto do dono está maior na vertical que a ilha de UV da cabeça: comprime olhos→queixo (só no centro, com mistura nas bordas)
const WARP = JSON.parse(process.env.WARP || '[[0,0],[100,112],[187,202],[235,233],[268,256],[318,283],[321,285],[340,303]]'); // [y da imagem do dono, y no atlas]
const srcY = (yd) => { for (let i = 0; i < WARP.length - 1; i++) { const a = WARP[i], b = WARP[i + 1]; if (yd >= a[1] && yd <= b[1]) return a[0] + (yd - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); } return yd; };
const smx = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const px = (x, y, c) => { y = Math.min(y, 321); x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1.001, y)); const y0 = Math.floor(y), f = y - y0; return u[(y0 * W + x) * 3 + c] * (1 - f) + u[((y0 + 1) * W + x) * 3 + c] * f; };
for (let y = 0; y < FY; y++) for (let x = 0; x < FX; x++) for (let c = 0; c < 3; c++) {
  const wgt = smx(60, 95, x) * (1 - smx(235, 270, x)); const v = px(x, srcY(y), c) * wgt + px(x, y, c) * (1 - wgt);
  A[(y * W + x) * 3 + c] = Math.round(v);
}
// cor da pele (bochecha do rosto do dono) para o pescoço e para as esferas dos olhos
const skin = [0, 1, 2].map((c) => { let t = 0, n = 0; for (let y = 205; y < 235; y++) for (let x = 108; x < 140; x++) { t += A[(y * W + x) * 3 + c]; n++; } return t / n; });
// pescoço: abaixo da barba o rosto do dono acaba; funde a última linha da barba com a pele
for (let x = 80; x < 252; x++) for (let y = 286; y < FY; y++) { const k = Math.min(1, (y - 286) / 14); const o = (y * W + x) * 3, r = (285 * W + x) * 3; for (let c = 0; c < 3; c++) { const base = A[r + c] * (1 - k) + skin[c] * k; A[o + c] = Math.round(base * 0.92); } }
// esferas dos olhos: a íris azul do Agent 47 vira castanha (as esferas ficam NA FRENTE dos olhos pintados do rosto: os dois coincidem)
for (let y = 70; y < 120; y++) for (let x = 262; x < 314; x++) { const r = Math.hypot(x - 287.5, y - 94.5); const o = (y * W + x) * 3; if (r < 3.4) { A[o] = 15; A[o + 1] = 10; A[o + 2] = 8; } else if (r < 8.8) { const k = 0.8 + 0.4 * (1 - (r - 3.4) / 5.4); A[o] = 78 * k; A[o + 1] = 48 * k; A[o + 2] = 30 * k; } }
const buf = await sharp(A, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 90 }).toBuffer();
tex.setImage(new Uint8Array(buf)); await io.write(outGlb, d); console.log('ok', buf.length);
