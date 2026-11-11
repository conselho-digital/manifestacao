import { EMOTES, SPECIALS, WALK_STYLES } from '../game/anim';
import { getWalkClip, queueEmote, setWalkClip } from '../game/input';
import { createMobileHud, type MobileHud } from './mobile';
import { isTouchDevice, setViewportUnit } from './orientation';

const CSS = `
.hud{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
.hud *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.hud-btn{position:fixed;pointer-events:auto;touch-action:none;border:2px solid rgba(255,255,255,.5);background:rgba(20,30,45,.55);
  color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;font-size:14px}
.hud-btn:active,.hud-btn.on{background:rgba(76,194,255,.7)}
.hud-anim{right:10px;top:10px;height:40px;border-radius:20px;padding:0 14px}
.hud-panel{position:fixed;right:10px;top:58px;width:min(440px,calc(100vw - 20px));max-height:calc(100vh - 80px);overflow:auto;pointer-events:auto;
  background:rgba(20,26,38,.94);border-radius:14px;padding:12px;color:#fff;display:none;z-index:20}
.hud-panel.touch{right:auto;left:50%;transform:translateX(-50%);top:calc(var(--u,4px)*11);max-height:calc(var(--u,4px)*86)}
.hud-panel.open{display:block}
.hud-panel h3{margin:10px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.hud-panel h3:first-child{margin-top:0}
.hud-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.hud-grid button{padding:9px 4px;font-size:13px;border-radius:8px;border:2px solid #3b4358;background:#1b1f2a;color:#fff}
.hud-grid button.sel{border-color:#4cc2ff;background:#25415a}
.hud-help{font-size:11px;opacity:.6;margin-top:10px;line-height:1.4}
`;

/** Cria o HUD (celular e PC) e o menu de animações. */
export function createHud(onVoiceToggle: () => void): MobileHud {
  setViewportUnit();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.style.zIndex = '9';
  document.body.appendChild(hud);

  const touch = isTouchDevice();

  // Painel de animações (celular e PC)
  const panel = document.createElement('div');
  panel.className = touch ? 'hud-panel touch' : 'hud-panel';
  hud.appendChild(panel);
  const section = (title: string): HTMLElement => {
    const h = document.createElement('h3');
    h.textContent = title;
    const g = document.createElement('div');
    g.className = 'hud-grid';
    panel.append(h, g);
    return g;
  };
  const close = (): void => panel.classList.remove('open');
  const toggle = (): void => { panel.classList.toggle('open'); };
  const emotes = section('Poses (mexa para sair)');
  for (const e of EMOTES) {
    const b = document.createElement('button');
    b.textContent = e.label;
    b.onclick = () => { queueEmote(e.id); close(); };
    emotes.appendChild(b);
  }
  const specials = section('Ações');
  for (const e of SPECIALS) {
    const b = document.createElement('button');
    b.textContent = e.label;
    b.onclick = () => { queueEmote(e.id); close(); };
    specials.appendChild(b);
  }
  const styles = section('Jeito de andar');
  const styleBtns = new Map<string, HTMLButtonElement>();
  const refreshStyles = (): void => styleBtns.forEach((b, id) => b.classList.toggle('sel', id === getWalkClip()));
  for (const e of WALK_STYLES) {
    const b = document.createElement('button');
    b.textContent = e.label;
    b.onclick = () => { setWalkClip(e.id); refreshStyles(); };
    styles.appendChild(b);
    styleBtns.set(e.id, b);
  }
  refreshStyles();
  const help = document.createElement('div');
  help.className = 'hud-help';
  help.textContent = touch
    ? 'Joystick: pouco = anda, muito = corre. Arraste a tela para girar a câmera. Porta = entrar/sair do carro.'
    : 'WASD move · Shift anda · Q sprint · Espaço pula · E escala · F entra/sai do carro · arraste o mouse para girar · G abre este menu.';
  panel.appendChild(help);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyG') toggle(); });

  window.addEventListener('resize', setViewportUnit);
  return createMobileHud({ onAnimations: toggle, onVoiceToggle });
}
