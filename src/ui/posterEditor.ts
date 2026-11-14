// Cartazes das vitrines: chegue na frente do cartaz (a menos de 4 m aparece o cartão; só BEM perto aparece o preço e o botão), escolha uma imagem,
// veja a prévia (só você vê) e pague para publicar. A 1ª imagem custa $2 e fica 24 h; antes disso só sai se alguém pagar mais.
// Se você se afastar antes de salvar, a prévia some, nada é salvo e nada é cobrado. O administrador não paga.
import { CLOSE_REACH, FIRST_PRICE, clearPoster, hasPosterPreview, nearestPoster, posterHasImage, posterInfo, posterMinPrice, posterName, savePoster, setPosterPreview } from '../game/shops';
import { toPosterImage } from './image';

export interface PosterEditor { setAdmin(a: boolean): void; update(dt: number): void }
export interface PosterDeps { getPos: () => { x: number; z: number } | null; money: () => number; spend: (n: number) => boolean }

export function initPosterEditor(deps: PosterDeps): PosterEditor {
  const getPos = deps.getPos;
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
  .pe-bid{display:flex;align-items:center;gap:4px}
  .pe-bid input{width:84px;font:inherit;color:#eef2f7;background:#10151c;border:1px solid #4a586c;border-radius:6px;padding:5px 8px}
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

  const CLOSE_STAY = CLOSE_REACH + 0.15; // folga para não piscar na borda
  let closeId = '';
  let bid = FIRST_PRICE;
  let lastKey = '';

  const left = (ms: number): string => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };

  function chooseFile(): void { if (!busy && closeId && !pending) file.click(); }

  file.onchange = () => {
    const f = file.files?.[0];
    file.value = '';
    const pos = getPos();
    const slot = pos ? nearestPoster(pos.x, pos.z, CLOSE_STAY) : null;
    if (!f || !slot) return;
    busy = true;
    render();
    toPosterImage(f)
      .then((blob) => {
        const now = getPos();
        if (!now || nearestPoster(now.x, now.z, 1.1)?.id !== slot.id) { flash('Você se afastou do cartaz.'); return; }
        pending = { id: slot.id, blob };
        bid = posterMinPrice(slot.id);
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
    if (!id) { card.hidden = true; return; }
    card.hidden = false;
    card.append(el('b', posterName(id)));
    const info = posterInfo(id);
    const minp = posterMinPrice(id);
    const near = !!pending || closeId === id;
    if (!near) { card.append(el('small', 'Chegue bem perto da vitrine para ver o preço e pôr uma imagem.')); return; }
    if (info) card.append(el('small', `No ar: valor pago $${info.price} · sai em ${left(info.expires - Date.now())}. Para trocar, pague mais que isso.`));
    else card.append(el('small', `Cartaz livre. Primeira imagem: $${FIRST_PRICE} (fica 24 h no ar).`));
    const row = el('div', '', 'pe-row');
    if (pending) {
      card.append(el('small', 'Prévia: só você vê esta imagem. Se você se afastar, ela não é salva e nada é cobrado.'));
      if (!admin && info) {
        const lab = el('label', `Pagar $ `, 'pe-bid');
        const inp = el('input');
        inp.type = 'number';
        inp.min = String(minp);
        inp.step = '1';
        inp.value = String(bid);
        inp.oninput = () => { bid = Math.floor(Number(inp.value)); };
        lab.append(inp, el('small', ` (mínimo $${minp})`));
        card.append(lab);
      }
      const cost = admin ? 0 : info ? bid : FIRST_PRICE;
      const save = el('button', busy ? 'Salvando…' : admin ? 'Salvar (grátis)' : `Pagar $${Number.isFinite(cost) ? cost : '?'} e salvar`, 'go');
      save.disabled = busy;
      save.onclick = () => {
        if (!pending || busy) return;
        const cur = pending;
        const price = admin ? 0 : Math.max(bid, posterMinPrice(cur.id));
        if (!admin && (!Number.isFinite(bid) || bid < posterMinPrice(cur.id))) { msg = `O mínimo é $${posterMinPrice(cur.id)}.`; render(); return; }
        if (!admin && deps.money() < price) { msg = `Você tem só $${deps.money()}.`; render(); return; }
        busy = true;
        msg = '';
        render();
        void savePoster(cur.id, cur.blob, price).then((res) => {
          busy = false;
          if ('error' in res) { msg = res.error; bid = Math.max(bid, posterMinPrice(cur.id)); render(); return; }
          if (!admin) deps.spend(price);
          pending = null;
          flash(admin ? 'Cartaz salvo! Todos já veem.' : `Cartaz publicado por $${price}! Fica 24 h no ar.`);
        });
      };
      const cancelB = el('button', 'Cancelar');
      cancelB.disabled = busy;
      cancelB.onclick = () => cancel('Prévia descartada. Nada foi cobrado.');
      row.append(save, cancelB);
    } else {
      card.append(el('small', `Escolha uma imagem (ela é cortada em 3:2). Você tem $${deps.money()}.`));
      const pick = el('button', busy ? 'Preparando…' : 'Escolher imagem (U)', 'go');
      pick.disabled = busy;
      pick.onclick = chooseFile;
      row.append(pick);
      if (admin && posterHasImage(id)) {
        const del = el('button', 'Remover cartaz');
        del.onclick = () => { void clearPoster(id).then((e) => flash(e ?? 'Cartaz removido.')); };
        row.append(del);
      }
    }
    card.append(row);
    if (msg) card.append(el('div', msg, 'pe-msg'));
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyU' || e.repeat || pending || busy) return;
    const tg = e.target as HTMLElement | null;
    if (tg && /^(input|textarea|select)$/i.test(tg.tagName)) return;
    chooseFile();
  });

  return {
    setAdmin(a) { admin = a; lastKey = ''; },
    update(dt) {
      t -= dt;
      if (t > 0) return;
      t = 0.2;
      const p = getPos();
      if (!p) return;
      if (pending && !busy) {
        // a prévia só vale enquanto você está na frente do cartaz (um pouco de folga na borda)
        if (nearestPoster(p.x, p.z, 1.1)?.id !== pending.id) { cancel('Você se afastou: a imagem não foi salva e nada foi cobrado.'); shownFor = ''; closeId = ''; lastKey = ''; }
      }
      if (!pending) {
        const near = nearestPoster(p.x, p.z)?.id ?? '';
        const close = near && nearestPoster(p.x, p.z, closeId === near ? CLOSE_STAY : CLOSE_REACH)?.id === near ? near : '';
        if (near !== shownFor) msg = '';
        shownFor = near;
        closeId = close;
      }
      const id = pending?.id ?? shownFor;
      const info = id ? posterInfo(id) : null;
      if (pending && bid < posterMinPrice(pending.id)) { bid = posterMinPrice(pending.id); msg = `Alguém pagou mais: o mínimo agora é $${bid}.`; lastKey = ''; }
      const key = `${id}|${closeId}|${pending ? 1 : 0}|${busy ? 1 : 0}|${msg}|${info?.price ?? -1}|${info ? Math.ceil((info.expires - Date.now()) / 60000) : 0}|${admin ? 1 : 0}|${deps.money()}|${hasPosterPreview(id) ? 1 : 0}`;
      if (key !== lastKey) { lastKey = key; render(); }
    },
  };
}
