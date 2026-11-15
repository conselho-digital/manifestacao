// Aviso curto no topo da tela (ex.: "Sem munição"). Um só elemento, reaproveitado.
let el: HTMLDivElement | null = null;
let timer = 0;

export function showNotice(text: string, ms = 5000): void {
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:70;max-width:min(92vw,520px);text-align:center;background:rgba(18,22,28,.94);color:#ffd45a;border:1px solid #5a4a1a;border-radius:12px;padding:10px 16px;font:600 15px/1.35 system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.45)';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => { if (el) el.hidden = true; }, ms);
}
