import { MAP_ID, MAPS } from '../game/map';
import { goFullscreenLandscape, isTouchDevice } from './orientation';

// Tela de carregamento ao entrar no mapa: uma foto da cidade vista de cima em preto e branco que vai ganhando cor
// conforme o carregamento avança (public/loading/<mapa>.webp, gerada do próprio jogo: ver CLAUDE.md).

const CSS = `
.ld{position:fixed;inset:0;z-index:1000;background:#0b1118;color:#fff;font-family:system-ui,sans-serif;overflow:hidden;opacity:1;transition:opacity .6s ease}
.ld.out{opacity:0;pointer-events:none}
.ld img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) brightness(.8);transition:filter .7s ease}
.ld::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(5,8,14,.55),rgba(5,8,14,0) 35%,rgba(5,8,14,0) 55%,rgba(5,8,14,.75));pointer-events:none}
.ld-box{position:absolute;left:0;right:0;bottom:max(28px,env(safe-area-inset-bottom,0px) + 16px);z-index:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:0 24px;text-shadow:0 2px 10px rgba(0,0,0,.8)}
.ld-title{margin:0;font-size:clamp(18px,3.4vw,26px);font-weight:800;letter-spacing:.04em}
.ld-txt{font-size:13px;opacity:.85;min-height:16px}
.ld-bar{width:min(420px,100%);height:8px;border-radius:5px;background:rgba(255,255,255,.2);overflow:hidden}
.ld-go{font-size:16px;font-weight:800;letter-spacing:.03em;animation:ldpulse 1.4s ease-in-out infinite}
@keyframes ldpulse{50%{opacity:.45}}
.ld-fill{height:100%;width:0;background:#4cc2ff;border-radius:5px;transition:width .5s ease}
`;

export interface Loading {
  /** progresso de 0 a 1 (a foto ganha cor) e o texto do passo atual */
  set(p: number, text?: string): void;
  /** completa, deixa a cor aparecer inteira e some */
  finish(onFade?: () => void): Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Espera o navegador desenhar (para a barra e a foto aparecerem antes de um trabalho pesado). */
export function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export function showLoading(): Loading {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.src = `/loading/${MAP_ID}.webp`;
  img.onerror = () => { img.style.display = 'none'; };
  const title = document.createElement('h2');
  title.className = 'ld-title';
  title.textContent = `Carregando ${MAPS.find((m) => m.id === MAP_ID)?.name ?? ''}`;
  const txt = document.createElement('div');
  txt.className = 'ld-txt';
  const fill = document.createElement('div');
  fill.className = 'ld-fill';
  const bar = document.createElement('div');
  bar.className = 'ld-bar';
  bar.appendChild(fill);
  const box = document.createElement('div');
  box.className = 'ld-box';
  box.append(title, bar, txt);
  const root = document.createElement('div');
  root.className = 'ld';
  root.append(img, box);
  document.body.appendChild(root);

  // celular em pé: a tela de carregamento aparece em formato paisagem (girada 90°), como será o jogo; em paisagem ou no PC fica normal
  const touch = isTouchDevice();
  const layout = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (touch && h > w) {
      root.style.cssText = `inset:auto;left:0;top:0;width:${h}px;height:${w}px;transform-origin:0 0;transform:translateX(${w}px) rotate(90deg)`;
    } else root.style.cssText = '';
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);

  let last = 0;
  const set = (p: number, text?: string): void => {
    last = Math.max(last, Math.min(1, p)); // nunca volta atrás
    img.style.filter = `grayscale(${1 - last}) brightness(${0.8 + last * 0.2})`;
    fill.style.width = `${Math.round(last * 100)}%`;
    if (text !== undefined) txt.textContent = text;
  };
  set(0, 'Preparando...');
  return {
    set,
    async finish(onFade) {
      set(1, 'Pronto!');
      await wait(750); // a cor termina de aparecer
      // só entra no mapa (e começa o voo de entrada) quando o jogador clica ou toca; no celular o toque também liga a tela cheia em paisagem
      txt.className = 'ld-txt ld-go';
      txt.textContent = touch ? 'Toque na tela para entrar em tela cheia' : 'Clique para entrar';
      await new Promise<void>((resolve) => {
        const go = (): void => {
          root.removeEventListener('pointerdown', go);
          window.removeEventListener('keydown', onKey);
          if (touch) void goFullscreenLandscape(); // dentro do toque: o navegador só libera tela cheia e travar a rotação assim
          resolve();
        };
        const onKey = (e: KeyboardEvent): void => { if (!touch && (e.code === 'Enter' || e.code === 'Space')) go(); };
        root.addEventListener('pointerdown', go);
        window.addEventListener('keydown', onKey);
      });
      if (touch) { txt.textContent = 'Entrando...'; await wait(700); } // dá tempo da tela cheia e da rotação acontecerem antes do voo da câmera
      if (!touch) document.querySelector('canvas')?.requestPointerLock?.(); // PC: o clique também esconde o mouse (gesto que o navegador exige)
      txt.textContent = '';
      onFade?.();
      root.classList.add('out');
      await wait(650);
      window.removeEventListener('resize', layout);
      window.removeEventListener('orientationchange', layout);
      root.remove();
      style.remove();
    },
  };
}
