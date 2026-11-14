// Prepara uma imagem enviada pelo admin: reduz e converte para webp (leve); se o navegador não gera webp, usa PNG menor.

const MAX_SIDE = 512;
const MAX_BYTES = 300 * 1024;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir esta imagem.')); };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> => new Promise((res) => c.toBlob(res, type, q));

/** Reduz a imagem (lado maior até 512 px, mantendo o fundo transparente) e converte para webp abaixo de ~300 KB. */
export async function toLightImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (png, jpg, webp...).');
  if (file.size > 15 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 15 MB).');
  const img = await load(file);
  let side = MAX_SIDE;
  for (let tries = 0; tries < 4; tries++) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const b = await toBlob(c, 'image/webp', q);
      if (b && b.size <= MAX_BYTES) return b;
      if (b && b.type !== 'image/webp') break; // este navegador não gera webp: sai do loop de qualidade e reduz o tamanho
    }
    side = Math.round(side * 0.7);
  }
  throw new Error('Não consegui deixar a imagem leve o bastante. Tente uma menor.');
}

const POSTER_W = 1200;
const POSTER_H = 800;
const POSTER_MAX = 450 * 1024;

/** Cartaz de vitrine: corta a imagem no formato 3:2 (preenchendo), 1200 x 800 px, e converte para webp abaixo de ~450 KB. */
export async function toPosterImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (png, jpg, webp...).');
  if (file.size > 25 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 25 MB).');
  const img = await load(file);
  for (const w of [POSTER_W, 1000, 800, 640]) {
    const h = Math.round((w * POSTER_H) / POSTER_W);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * k;
    const dh = img.naturalHeight * k;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    for (const q of [0.86, 0.74, 0.62, 0.5]) {
      const b = await toBlob(c, 'image/webp', q);
      if (!b) break;
      if (b.type !== 'image/webp') throw new Error('Este navegador não gera imagens webp. Use o Chrome ou o Edge.');
      if (b.size <= POSTER_MAX) return b;
    }
  }
  throw new Error('Não consegui deixar a imagem leve o bastante. Tente uma menor.');
}
