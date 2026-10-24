import { getSupabase } from "./supabase.js";

/** Imagens de cartaz/telão: viram WebP (até 1024 px de lado e ~550 KB) e vão para o bucket user-media do próprio usuário. */
const BUCKET = "user-media";
const MAX_SIDE = 1024;
const MAX_SOURCE_SIDE = 8000;
const MAX_BYTES = 550_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Copia o arquivo para a memória: no Android o seletor pode revogar a leitura depois que o input é limpo. */
export async function readPickedFile(file: File): Promise<File> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Imagem maior que 8 MB.");
  try {
    return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    throw new Error("Não consegui ler o arquivo. Escolha de novo (de preferência da galeria ou de Downloads).");
  }
}

async function toWebpUnder(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // PNG pequeno em bytes pode declarar dimensões gigantes: confere o cabeçalho antes de decodificar.
    const head = new DataView(await file.slice(0, 32).arrayBuffer());
    if (head.byteLength >= 24 && head.getUint32(12) === 0x49484452 && (head.getUint32(16) > MAX_SOURCE_SIDE || head.getUint32(20) > MAX_SOURCE_SIDE)) {
      throw new Error("Imagem grande demais (máx. 8000 px de lado).");
    }
    bitmap = await createImageBitmap(file);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Imagem grande")) throw e;
    throw new Error("Não consegui abrir a imagem. Use PNG, JPG ou WebP.");
  }
  try {
    for (const side of [MAX_SIDE, 800, 640, 480]) {
      const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * k));
      const h = Math.max(1, Math.round(bitmap.height * k));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Este navegador não consegue preparar a imagem.");
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const q of [0.85, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", q));
        if (!blob || blob.type !== "image/webp") throw new Error("Este navegador não consegue converter para WebP. Use outro navegador.");
        if (blob.size <= MAX_BYTES) return blob;
      }
    }
    throw new Error("A imagem ficou pesada demais. Tente uma menor.");
  } finally {
    bitmap.close();
  }
}

/** Converte e envia a imagem; devolve o caminho (`<usuário>/<id>.webp`) que vai no pedido do anúncio. */
export async function uploadUserImage(picked: File): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Entre com sua conta para enviar imagem.");
  const webp = await toWebpUnder(picked);
  const path = `${uid}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, webp, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(/limit|exceed|too many|policy/i.test(error.message) ? "Limite de imagens enviadas hoje atingido. Tente amanhã." : "Não foi possível enviar a imagem.");
  return path;
}

/** URL pública de uma imagem de anúncio (só caminhos no formato esperado). */
export function userImageUrl(path: string | null | undefined): string | null {
  if (!path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)) return null;
  const supabase = getSupabase();
  return supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** O anúncio ainda está dentro das 12 h? (sem `expires_at` = ainda não ativado/sem prazo registrado). */
export function notExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return !Number.isFinite(t) || t > now;
}
