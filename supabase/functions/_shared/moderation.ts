// Filtro automático de conteúdo (1ª barreira; a 2ª é a fila manual do admin).
// Conservador de propósito: bloqueia o óbvio e deixa o resto para a revisão humana.

const BLOCKED_RAW = [
  "porra", "caralho", "puta", "viado", "buceta", "cuzao", "arrombado", "fdp",
  "nazista", "nazismo", "hitler", "estupr", "pedofil", "suicid", "mate-se",
  "preto de merda", "macaco", "retardado",
];

/** minúsculas, sem acento, leetspeak simples e sem separadores repetidos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/(.)\1+/g, "$1");
}

// Letras repetidas viram uma só dos dois lados ("puuuta" = "puta"; "porra" = "pora").
const BLOCKED = BLOCKED_RAW.map(normalize);

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|gg|me|xyz|app)\b)/i;
const PHONE_RE = /(\+?55)?\s*\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/;

export type ModerationResult = { ok: true } | { ok: false; reason: "link" | "telefone" | "palavra_proibida" };

export function checkContent(...fields: string[]): ModerationResult {
  for (const f of fields) {
    if (URL_RE.test(f)) return { ok: false, reason: "link" };
    if (PHONE_RE.test(f)) return { ok: false, reason: "telefone" };
    const n = normalize(f);
    // Início de palavra: pega "putaria" sem barrar "computador"/"reputação".
    if (BLOCKED.some((w) => new RegExp(`(^|[^a-z])${w}`).test(n))) {
      return { ok: false, reason: "palavra_proibida" };
    }
  }
  return { ok: true };
}
