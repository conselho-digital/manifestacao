import { useEffect, useMemo } from "react";
import { CanvasTexture, DoubleSide, SRGBColorSpace } from "three";
import { SIGN_INK } from "@manifestacao/shared";
import type { SignData } from "./useSigns.js";

const W = 512;
const H = 256;

/** Desenha o texto do cartaz (quebra de linha por palavra, tamanho ajustado ao comprimento). */
function drawSign(sign: SignData): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = sign.color;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = SIGN_INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = SIGN_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const size = sign.text.length > 24 ? 44 : sign.text.length > 12 ? 58 : 76;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of sign.text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > W - 50 && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  lines.push(line);
  const lh = size * 1.15;
  const top = H / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh, W - 40));

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Cartaz numa vara, carregado ao lado do personagem. */
export function SignProp({ sign }: { sign: SignData }) {
  const texture = useMemo(() => drawSign(sign), [sign.text, sign.color]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[-0.55, 0, 0]}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 2.3, 8]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <planeGeometry args={[1.3, 0.65]} />
        <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}
