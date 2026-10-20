import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { BILLBOARDS, SIGN_INK, type BillboardAd, type BillboardSpot } from "@manifestacao/shared";

const W = 1024;
const H = 512;

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** Desenha o painel: texto do anunciante grande + lance atual; ou "telão livre". */
function drawBoard(ad: BillboardAd | undefined): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!ad) {
    ctx.fillStyle = "#1a1d21";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#ffd43b";
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = "#ffd43b";
    ctx.font = "800 84px system-ui, sans-serif";
    ctx.fillText("TELÃO LIVRE", W / 2, H / 2 - 40);
    ctx.fillStyle = "#c9ced4";
    ctx.font = "700 52px system-ui, sans-serif";
    ctx.fillText("A partir de R$ 20,00", W / 2, H / 2 + 50);
    ctx.font = "600 42px system-ui, sans-serif";
    ctx.fillText("Dê seu lance pelo botão Telões", W / 2, H / 2 + 120);
  } else {
    ctx.fillStyle = ad.color;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = SIGN_INK;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = SIGN_INK;
    const size = ad.text.length > 40 ? 64 : ad.text.length > 20 ? 84 : 108;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const lines: string[] = [];
    let line = "";
    for (const word of ad.text.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > W - 100 && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
    const lh = size * 1.12;
    const top = H / 2 - 50 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh, W - 80));
    ctx.fillStyle = SIGN_INK;
    ctx.fillRect(8, H - 92, W - 16, 84);
    ctx.fillStyle = ad.color;
    ctx.font = "700 56px system-ui, sans-serif";
    ctx.fillText(`Lance no ar: ${brl(ad.amount_cents)}`, W / 2, H - 50);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function Board({ spot, ad }: { spot: BillboardSpot; ad: BillboardAd | undefined }) {
  const texture = useMemo(() => drawBoard(ad), [ad?.id, ad?.text, ad?.color, ad?.amount_cents]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.rotationY, 0]}>
      {[-5, 5].map((px) => (
        <mesh key={px} position={[px, 3.5, 0]} castShadow>
          <boxGeometry args={[0.4, 7, 0.4]} />
          <meshStandardMaterial color="#3b434c" />
        </mesh>
      ))}
      <mesh position={[0, 8.2, -0.15]} castShadow>
        <boxGeometry args={[12.6, 6.6, 0.3]} />
        <meshStandardMaterial color="#20262c" />
      </mesh>
      <mesh position={[0, 8.2, 0.02]}>
        <planeGeometry args={[12, 6]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Os telões da avenida, com o lance no ar de cada um. */
export function Billboards({ ads }: { ads: Map<string, BillboardAd> }) {
  return (
    <>
      {BILLBOARDS.map((spot) => (
        <Board key={spot.id} spot={spot} ad={ads.get(spot.id)} />
      ))}
    </>
  );
}
