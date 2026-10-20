// Filtro automático de conteúdo (1ª barreira; a 2ª é a fila manual do admin).
// Conservador de propósito: bloqueia o óbvio e deixa o resto para a revisão humana.

/** Início de palavra (radicais): pega "putaria" sem barrar "computador". */
const STEMS = [
  "porra", "caralho", "puta", "viado", "buceta", "cuzao", "arrombado", "fdp", "pqp", "vtnc", "vagabund",
  "nazista", "nazismo", "hitler", "estupr", "pedofil", "mate-se", "retardado", "preto de merda",
];
/** Termos longos e inequívocos: pegos mesmo colados/espaçados ("f i l h o d a p u t a"). */
const LONG = ["caralho", "buceta", "arrombado", "nazista", "pedofil", "vagabund", "filhodaputa"];

/** Remove invisíveis/bidi e combinantes; minúsculas; sem acento; leetspeak simples. */
function strip(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Cc}]/gu, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function normalize(text: string): string {
  return strip(text)
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    // 3+ letras repetidas viram uma ("puuuta" = "puta"); "rr"/"ss" legítimos ficam intactos.
    .replace(/(.)\1{2,}/g, "$1");
}

const STEMS_N = STEMS.map(normalize);
const LONG_N = LONG.map(normalize);

const TLDS = "com|net|org|br|io|gg|xyz|app|tv|ly|dev|link|site|online|shop|biz";
const URL_RE = new RegExp(`(https?:|www\\.|\\b[a-z0-9-]+\\.(${TLDS})(\\b|/)|\\(?\\s*ponto\\s*\\)?\\s*(${TLDS})\\b|\\bdot\\s*(${TLDS})\\b)`, "i");
// 10+ dígitos (com separadores) — ou DDD entre parênteses + número.
const PHONE_RE = /(\(\d{2}\)\s*\d{4,5}[-.\s]?\d{4})|((\d[\s.\-()]*){10,})/;
const HANDLE_RE = /(^|\s)@[a-z0-9_.]{3,}/i;

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: "link" | "telefone" | "palavra_proibida" | "contato" };

export function checkContent(...fields: string[]): ModerationResult {
  for (const raw of fields) {
    const f = strip(raw);
    if (URL_RE.test(f)) return { ok: false, reason: "link" };
    if (PHONE_RE.test(f)) return { ok: false, reason: "telefone" };
    if (HANDLE_RE.test(f)) return { ok: false, reason: "contato" };
    const n = normalize(raw);
    if (STEMS_N.some((w) => new RegExp(`(^|[^a-z])${w}`).test(n))) {
      return { ok: false, reason: "palavra_proibida" };
    }
    // Sem separadores: pega "p.u.t.a" e palavras coladas (só termos longos, evita falso positivo).
    const squashed = n.replace(/[^a-z]/g, "");
    if (LONG_N.some((w) => squashed.includes(w))) return { ok: false, reason: "palavra_proibida" };
    // Letras isoladas separadas ("p u t a"): junta sequências de letras soltas.
    const spaced = n.replace(/\b([a-z])\b[\s.\-_*]+(?=[a-z]\b)/g, "$1").replace(/\b([a-z])\b[\s.\-_*]*$/g, "$1");
    if (spaced !== n && STEMS_N.some((w) => new RegExp(`(^|[^a-z])${w}`).test(spaced))) {
      return { ok: false, reason: "palavra_proibida" };
    }
  }
  return { ok: true };
}

/** Texto salvo/exibido: sem caracteres invisíveis nem de controle bidi. */
export function sanitize(text: string): string {
  return text.replace(/[\p{Cf}\p{Cc}]/gu, "").trim().replace(/\s+/g, " ");
}
