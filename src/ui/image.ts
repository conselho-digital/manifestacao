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
