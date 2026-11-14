// Troca de cartaz das vitrines (só o administrador): chegue na frente do cartaz, "Escolher imagem" (ou tecla U), veja a prévia (só você vê)
// e toque em "Salvar" para todos verem. Se você se afastar antes de salvar, a prévia some e nada é salvo.
import { clearPoster, hasPosterPreview, nearestPoster, posterHasImage, savePoster, setPosterPreview } from '../game/shops';
import { toPosterImage } from './image';

export interface PosterEditor { setAdmin(a: boolean): void; update(dt: number): void }

export function initPosterEditor(getPos: () => { x: number; z: number } | null): PosterEditor {
  let admin = false;
  let pending: { id: string; blob: Blob } | null = null;
  let busy = false;
  let shownFor = '';
  let t = 0;

  const style = document.createElement('style');
  style.textContent = `
  .pe-card{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:60;max-width:min(92vw,460px);background:rgba(18,22,28,.94);color:#eef2f7;border:1px solid #3a4658;border-radius:12px;padding:10px 12px;font:14px/1.35 system-ui,sans-serif;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 24px rgba(0,0,0,.45)}
  .pe-card[hidden]{display:none}
  .pe-card b{font-weight:650}
  .pe-card small{color:#aab6c6}
  .pe-row{display:flex;gap:8px;flex-wrap:wrap}
  .pe-card button{font:inherit;color:#eef2f7;background:#2a3444;border:1px solid #4a586c;border-radius:8px;padding:8px 14px;cursor:pointer}
  .pe-card button.go{background:#3fbf6f;border-color:#3fbf6f;color:#07130c;font-weight:650}
  .pe-card button:disabled{opacity:.5;cursor:default}
  .pe-msg{color:#f2c230;font-size:13px}
  .pe-toast{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:61;background:rgba(18,22,28,.94);color:#f2c230;border:1px solid #3a4658;border-radius:10px;padding:9px 14px;font:14px system-ui,sans-serif;pointer-events:none}
  .pe-toast[hidden]{display:none}`;
  document.head.appendChild(style);
  const card = document.createElement('div');
  card.className = 'pe-card';
  card.hidden = true;
  document.body.appendChild(card);
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.style.display = 'none';
  document.body.appendChild(file);

  let msg = '';
  const toastEl = document.createElement('div');
  toastEl.className = 'pe-toast';
  toastEl.hidden = true;
  document.body.appendChild(toastEl);
  let toastTimer = 0;
  const toast = (m: string): void => { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 3800); };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  const flash = (m: string): void => { toast(m); render(); };

  function cancel(why: string): void {
    if (!pending) return;
    setPosterPreview(pending.id, null);
    pending = null;
    flash(why);
  }

  function chooseFile(): void { if (!busy) file.click(); }

  file.onchange = () => {
    const f = file.files?.[0];
    file.value = '';
    const slot = nearestPoster(getPos()?.x ?? 1e9, getPos()?.z ?? 1e9);
    if (!f || !slot) return;
    busy = true;
    render();
    toPosterImage(f)
      .then((blob) => {
        const now = getPos();
        if (!now || nearestPoster(now.x, now.z, 1.35)?.id !== slot.id) { flash('Você se afastou do cartaz.'); return; }
        pending = { id: slot.id, blob };
        setPosterPreview(slot.id, blob);
        if (document.pointerLockElement) document.exitPointerLock(); // libera o mouse para clicar em Salvar
        msg = '';
      })
      .catch((e: unknown) => { msg = e instanceof Error ? e.message : 'Não consegui abrir a imagem.'; })
      .finally(() => { busy = false; render(); });
  };

  function render(): void {
    card.textContent = '';
    const id = pending?.id ?? shownFor;
    if (!id || !admin) { card.hidden = true; return; }
    card.hidden = false;
    card.append(el('b', `Cartaz ${id}`));
    const row = el('div', '', 'pe-row');
    if (pending) {
      card.append(el('small', 'Prévia: só você vê esta imagem. Salve para todos verem; se você se afastar, ela não é salva.'));
      const save = el('button', busy ? 'Salvando…' : 'Salvar', 'go');
      save.disabled = busy;
      save.onclick = () => {
        if (!pending || busy) return;
        const cur = pending;
        busy = true;
        render();
        void savePoster(cur.id, cur.blob).then((err) => {
          busy = false;
          if (err) { msg = err; render(); return; }
          pending = null;
          flash('Cartaz salvo! Todos já veem.');
        });
      };
      const cancelB = el('button', 'Cancelar');
      cancelB.disabled = busy;
      cancelB.onclick = () => cancel('Prévia descartada.');
      row.append(save, cancelB);
    } else {
      card.append(el('small', 'Escolha uma imagem (ela é cortada em 3:2).'));
      const pick = el('button', busy ? 'Preparando…' : 'Escolher imagem (U)', 'go');
      pick.disabled = busy;
      pick.onclick = chooseFile;
      row.append(pick);
      if (posterHasImage(id)) {
        const del = el('button', 'Remover cartaz');
        del.onclick = () => { void clearPoster(id).then((e) => flash(e ?? 'Cartaz removido.')); };
        row.append(del);
      }
    }
    card.append(row);
    if (msg) card.append(el('div', msg, 'pe-msg'));
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyU' || e.repeat || !admin || pending || busy) return;
    const tg = e.target as HTMLElement | null;
    if (tg && /^(input|textarea|select)$/i.test(tg.tagName)) return;
    if (shownFor) chooseFile();
  });

  return {
    setAdmin(a) { admin = a; render(); },
    update(dt) {
      t -= dt;
      if (t > 0) return;
      t = 0.2;
      const p = getPos();
      if (!p) return;
      if (pending && !busy) {
        // a prévia só vale enquanto você está na frente do cartaz (um pouco de folga na borda)
        if (nearestPoster(p.x, p.z, 1.35)?.id !== pending.id) { cancel('Você se afastou: a imagem não foi salva.'); shownFor = ''; render(); }
        return;
      }
      if (pending) return;
      const near = admin ? nearestPoster(p.x, p.z)?.id ?? '' : '';
      if (near !== shownFor) { shownFor = near; msg = ''; render(); }
      else if (hasPosterPreview(shownFor)) render();
    },
  };
}
