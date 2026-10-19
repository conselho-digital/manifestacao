/**
 * Cookies do jogo (LGPD — CLAUDE.md §9). Hoje só guarda a própria decisão de
 * consentimento (estritamente necessário, não precisa de consentimento
 * prévio pra existir); nenhum cookie de analytics/rastreio é gravado antes
 * do usuário aceitar — ver ui/CookieConsent.tsx.
 */

export const CONSENT_COOKIE_NAME = "manifestacao_cookies";
const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentChoice = "accepted" | "rejected";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** true só se o cookie de aceite já existe (recusa nunca grava nada — ver `recordAccepted`). */
export function hasAcceptedCookie(): boolean {
  return readCookie(CONSENT_COOKIE_NAME) === "accepted";
}

/**
 * Grava o aceite num cookie de verdade (não localStorage) — é essa a peça
 * que o banner existe pra pedir permissão antes de criar. `SameSite=Lax` e
 * sem `Secure` fixo porque o jogo também roda em `http://localhost` no
 * desenvolvimento (navegadores rejeitam `Secure` fora de HTTPS).
 *
 * Recusar NUNCA grava cookie nenhum — "só salva quando aceitar" é a regra:
 * quem recusa só tem o banner escondido nesta sessão (volta a aparecer na
 * próxima visita, já que nada fica persistido).
 *
 * Retorna se a gravação realmente colou (relê o cookie depois de escrever)
 * — cookies bloqueados/modo privado restrito fariam `document.cookie =` ser
 * um no-op silencioso; sem essa checagem, "Aceitar" pareceria funcionar mas
 * o banner voltaria pra sempre na próxima visita, sem nenhum aviso.
 */
export function recordAccepted(): boolean {
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=accepted; max-age=${maxAge}; path=/; SameSite=Lax${secure}`;
  return hasAcceptedCookie();
}
