/**
 * Ícone de bandeira do time: a imagem enviada no admin quando existir; senão uma forma vetorial simples (mastro +
 * pano) na cor do time. Desenhado por nós — não é um emoji nem reproduz nenhuma bandeira/símbolo real.
 */
export function TeamFlagIcon({ color, size = 18, imageUrl = null }: { color: string; size?: number; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        width={Math.round(size * 1.4)}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ flexShrink: 0, objectFit: "cover", borderRadius: 3, border: "1px solid var(--line)", background: color }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="1" width="1.6" height="16" rx="0.8" fill="currentColor" opacity="0.55" />
      <path d="M3.6 2 L15.5 4.3 L11.5 7 L15.5 9.7 L3.6 12 Z" fill={color} />
    </svg>
  );
}
