/** Celular/tablet (tela de toque). */
export const isTouchDevice = (): boolean =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has('touch');

interface LockableOrientation { lock?: (o: string) => Promise<void> }

let overlay: HTMLElement | null = null;

function setViewportUnit(): void {
  // 1 unidade = 1% da altura visível (evita o problema da barra do navegador no celular)
  document.documentElement.style.setProperty('--u', `${window.innerHeight / 100}px`);
}

function updateOverlay(): void {
  setViewportUnit();
  if (!overlay) return;
  const portrait = window.innerHeight > window.innerWidth;
  overlay.style.display = portrait ? 'flex' : 'none';
}

/**
 * Coloca o jogo em paisagem. Tem que ser chamado dentro de um toque do jogador
 * (o navegador só libera tela cheia e travar a rotação assim).
 * Onde o navegador não deixa travar (iPhone), mostra o aviso "Gire o celular".
 */
export async function enterLandscape(): Promise<void> {
  if (!isTouchDevice()) return;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch { /* sem tela cheia: segue */ }
  try {
    await (screen.orientation as unknown as LockableOrientation).lock?.('landscape');
  } catch { /* não suportado: o aviso cobre */ }

  if (!overlay) {
    const style = document.createElement('style');
    style.textContent = `
.rotate-overlay{position:fixed;inset:0;z-index:100;display:none;flex-direction:column;align-items:center;justify-content:center;
  background:#10161f;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;gap:18px}
.rotate-overlay svg{width:84px;height:84px;animation:rot 1.8s ease-in-out infinite}
.rotate-overlay p{margin:0;font-size:20px;font-weight:700}
.rotate-overlay small{opacity:.65;font-size:14px}
@keyframes rot{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}`;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.className = 'rotate-overlay';
    overlay.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" fill="#fff"><path d="M16.5 2h-9A2.5 2.5 0 0 0 5 4.5v15A2.5 2.5 0 0 0 7.5 22h9a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 16.5 2zM12 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5-3H7V5h10v13z"/></svg>' +
      '<p>Gire o celular para jogar</p><small>O jogo funciona na horizontal</small>');
    document.body.appendChild(overlay);
    window.addEventListener('resize', updateOverlay);
    window.addEventListener('orientationchange', updateOverlay);
  }
  updateOverlay();
}

export { setViewportUnit };
