import { applyBlur, getBlur } from '../game/scene';

/** Botão pequeno + controle deslizante para ajustar o desfoque da imagem 3D. */
export function createBlurControl(canvas: HTMLCanvasElement): void {
  const style = document.createElement('style');
  style.textContent = `
.blur-ui{position:fixed;left:122px;top:8px;z-index:30;font:600 12px system-ui,sans-serif;color:#fff;user-select:none;touch-action:manipulation}
.blur-ui button{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.45);color:#fff;font-size:16px;cursor:pointer}
.blur-ui .p{display:none;position:absolute;left:0;top:40px;width:180px;padding:10px;border-radius:10px;background:rgba(0,0,0,.65)}
.blur-ui.open .p{display:block}
.blur-ui input{width:100%}
.blur-ui .v{float:right}`;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'blur-ui';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '◐';
  btn.title = 'Desfoque';
  const panel = document.createElement('div');
  panel.className = 'p';
  const label = document.createElement('label');
  const val = document.createElement('span');
  val.className = 'v';
  label.append('Desfoque', val);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '2';
  slider.step = '0.05';
  const cur = getBlur();
  slider.value = String(cur);
  val.textContent = cur.toFixed(2);
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    val.textContent = v.toFixed(2);
    applyBlur(canvas, v, true);
  });
  panel.append(label, slider);
  box.append(btn, panel);
  btn.addEventListener('click', () => box.classList.toggle('open'));
  document.body.appendChild(box);
}
