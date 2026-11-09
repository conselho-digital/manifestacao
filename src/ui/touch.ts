import { EMOTES, SPECIALS, WALK_STYLES } from '../game/anim';
import { addLook, getWalkClip, queueClimb, queueEmote, queueJump, setSprint, setTouchVector, setWalkClip } from '../game/input';

const CSS = `
.hud{position:fixed;inset:0;pointer-events:none;z-index:5;font-family:system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
.hud *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.hud-look{position:fixed;inset:0;pointer-events:auto;touch-action:none}
.hud-stick{position:fixed;left:max(20px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));width:140px;height:140px;border-radius:50%;
  background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);pointer-events:auto;touch-action:none}
.hud-knob{position:absolute;left:42px;top:42px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.55)}
.hud-btn{position:fixed;pointer-events:auto;touch-action:none;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(20,30,45,.55);
  color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;font-size:14px}
.hud-btn:active,.hud-btn.on{background:rgba(76,194,255,.7)}
.hud-jump{right:max(24px,env(safe-area-inset-right));bottom:max(30px,env(safe-area-inset-bottom));width:88px;height:88px;font-size:16px}
.hud-climb{right:calc(max(24px,env(safe-area-inset-right)) + 100px);bottom:max(30px,env(safe-area-inset-bottom));width:70px;height:70px}
.hud-sprint{right:max(34px,env(safe-area-inset-right));bottom:calc(max(30px,env(safe-area-inset-bottom)) + 100px);width:70px;height:70px}
.hud-anim{right:10px;top:10px;width:auto;height:40px;border-radius:20px;padding:0 14px;position:fixed}
.hud-panel{position:fixed;right:10px;top:58px;width:min(440px,calc(100vw - 20px));max-height:calc(100vh - 80px);overflow:auto;pointer-events:auto;
  background:rgba(20,26,38,.92);border-radius:14px;padding:12px;color:#fff;display:none}
.hud-panel.open{display:block}
.hud-panel h3{margin:10px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.hud-panel h3:first-child{margin-top:0}
.hud-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.hud-grid button{padding:9px 4px;font-size:13px;border-radius:8px;border:2px solid #3b4358;background:#1b1f2a;color:#fff}
.hud-grid button.sel{border-color:#4cc2ff;background:#25415a}
.hud-help{font-size:11px;opacity:.6;margin-top:10px;line-height:1.4}
`;

const isTouch = (): boolean =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has('touch');

function holdButton(el: HTMLElement, onDown: () => void, onUp?: () => void): void {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); onDown(); });
  const up = (): void => { el.classList.remove('on'); onUp?.(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** Cria o HUD: controles de toque (celular) e o painel de animações (celular e PC). */
export function createHud(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.appendChild(hud);

  const touch = isTouch();
  if (touch) {
    // Arrastar o dedo na tela gira a câmera
    const look = document.createElement('div');
    look.className = 'hud-look';
    hud.appendChild(look);
    const last = new Map<number, number>();
    look.addEventListener('pointerdown', (e) => { look.setPointerCapture(e.pointerId); last.set(e.pointerId, e.clientX); });
    look.addEventListener('pointermove', (e) => {
      const x0 = last.get(e.pointerId);
      if (x0 === undefined) return;
      addLook(e.clientX - x0);
      last.set(e.pointerId, e.clientX);
    });
    const end = (e: PointerEvent): void => { last.delete(e.pointerId); };
    look.addEventListener('pointerup', end);
    look.addEventListener('pointercancel', end);

    // Joystick
    const stick = document.createElement('div');
    stick.className = 'hud-stick';
    stick.innerHTML = '<div class="hud-knob"></div>';
    hud.appendChild(stick);
    const knob = stick.firstElementChild as HTMLElement;
    const R = 50;
    let active: number | null = null;
    const setKnob = (e: PointerEvent): void => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      setTouchVector(dx / R, -dy / R, true);
    };
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); active = e.pointerId; stick.setPointerCapture(e.pointerId); setKnob(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === active) setKnob(e); });
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== active) return;
      active = null;
      knob.style.transform = '';
      setTouchVector(0, 0, false);
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    const mk = (cls: string, label: string): HTMLElement => {
      const b = document.createElement('div');
      b.className = `hud-btn ${cls}`;
      b.textContent = label;
      hud.appendChild(b);
      return b;
    };
    holdButton(mk('hud-jump', 'Pular'), queueJump);
    holdButton(mk('hud-climb', 'Escalar'), queueClimb);
    holdButton(mk('hud-sprint', 'Correr+'), () => setSprint(true), () => setSprint(false));
  }

  // Painel de animações
  const btn = document.createElement('div');
  btn.className = 'hud-btn hud-anim';
  btn.textContent = touch ? 'Animações' : 'Animações (G)';
  hud.appendChild(btn);
  const panel = document.createElement('div');
  panel.className = 'hud-panel';
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
    ? 'Joystick: pouco = anda, muito = corre. Arraste a tela para girar a câmera.'
    : 'WASD move · Shift anda · Q sprint · Espaço pula · E escala · arraste o mouse para girar · G abre este menu.';
  panel.appendChild(help);

  holdButton(btn, () => panel.classList.toggle('open'));
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyG') panel.classList.toggle('open'); });
}
