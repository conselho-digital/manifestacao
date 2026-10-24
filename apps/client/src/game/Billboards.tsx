import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { userImageUrl } from "../net/userImages.js";
import { BILLBOARDS, SIGN_INK, type BillboardAd, type BillboardSpot } from "@manifestacao/shared";

const W = 1024;
const H = 512;

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** Baixa a imagem do anúncio (CORS liberado no bucket); null se falhar. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * k;
  const ih = img.naturalHeight * k;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  return lines;
}

/** Desenha o painel: imagem (se houver) e/ou texto do anunciante + lance atual; ou "telão livre". */
function paintBoard(ctx: CanvasRenderingContext2D, ad: BillboardAd | undefined, img: HTMLImageElement | null): void {
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
    return;
  }
  const hasImage = Boolean(ad.image_path);
  ctx.fillStyle = ad.color;
  ctx.fillRect(0, 0, W, H);
  if (img) coverDraw(ctx, img, W, H - 92);
  ctx.strokeStyle = SIGN_INK;
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  if (ad.text) {
    const size = ad.text.length > 40 ? 64 : ad.text.length > 20 ? 84 : 108;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const lines = wrap(ctx, ad.text, W - 100);
    const lh = size * 1.12;
    if (hasImage) {
      // Com imagem, o texto vai numa faixa translúcida embaixo da figura.
      const bandH = lines.length * lh + 24;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(8, H - 92 - bandH, W - 16, bandH);
      ctx.fillStyle = "#fff";
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H - 92 - bandH + 12 + lh / 2 + i * lh, W - 40));
    } else {
      ctx.fillStyle = SIGN_INK;
      const top = H / 2 - 50 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh, W - 80));
    }
  }
  ctx.fillStyle = SIGN_INK;
  ctx.fillRect(8, H - 92, W - 16, 84);
  ctx.fillStyle = ad.color;
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillText(`Lance no ar: ${brl(ad.amount_cents)}`, W / 2, H - 50);
}

function Board({ spot, ad }: { spot: BillboardSpot; ad: BillboardAd | undefined }) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintBoard(ctx, ad, null);
    texture.needsUpdate = true;
    const url = userImageUrl(ad?.image_path);
    if (!url) return;
    let alive = true;
    void loadImage(url).then((img) => {
      if (!alive || !img) return;
      paintBoard(ctx, ad, img);
      texture.needsUpdate = true;
    });
    return () => {
      alive = false;
    };
  }, [ad?.id, ad?.text, ad?.color, ad?.amount_cents, ad?.image_path, canvas, texture]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.rotationY, 0]}>
      {[-5, 5].map((px) => (
        // Colunas debaixo do painel (param na base dele, y=4,9) e atrás do plano da tela: nunca cobrem a imagem.
        <mesh key={px} position={[px, 2.45, -0.15]} castShadow>
          <boxGeometry args={[0.4, 4.9, 0.3]} />
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
