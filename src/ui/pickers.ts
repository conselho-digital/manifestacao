// Seletores reutilizados no menu inicial e no menu de pausa: personagem (carrosséis por categoria) e equipe (duas cores).
import { CATEGORIES, labelOf, type CharacterName } from '../game/characters';
import type { Team } from '../game/teams';

type Kids = (Node | string)[];
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: Kids): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

export const faceUrl = (n: CharacterName): string => `/faces/${n}.webp`;

export const PICKER_CSS = `
.pk-cats{width:100%;padding:8px 0 24px}
.pk-cat{margin:12px 0 4px}
.pk-cat h3{margin:0 16px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
.pk-row{position:relative}
.pk-track{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 16px 8px;scrollbar-width:none;scroll-behavior:smooth}
.pk-track::-webkit-scrollbar{display:none}
.pk-item{flex:0 0 auto;width:clamp(104px,22vw,140px);scroll-snap-align:start;border:3px solid #3b4358;border-radius:14px;background:#1b2130;color:#fff;padding:0;overflow:hidden;text-align:center;cursor:pointer;font-family:inherit}
.pk-item img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.pk-item span{display:block;padding:6px 2px;font-size:13px;font-weight:600}
.pk-item.sel{border-color:#4cc2ff;background:#25415a;transform:scale(1.04)}
.pk-arrow{position:absolute;top:calc(50% - 22px);width:36px;height:44px;border:0;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:22px;z-index:2;cursor:pointer}
.pk-arrow.l{left:4px}.pk-arrow.r{right:4px}
@media (hover:none){.pk-arrow{display:none}}
.pk-teams{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%}
.pk-team{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border:2px solid #3b4358;border-radius:12px;background:#141926;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.pk-team.sel{border-color:#4cc2ff;background:#25415a}
.pk-sw{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.65);flex:0 0 auto}
.pk-sw.none{background:#2a3144;display:flex;align-items:center;justify-content:center;font-size:15px}
`;

/** Bolinha de duas cores (metade de cada) — a bandeira da equipe. */
export const swatchStyle = (c1: string, c2: string): string => `background:linear-gradient(135deg,${c1} 0 50%,${c2} 50% 100%)`;

export interface CharacterPicker { root: HTMLElement; set(n: CharacterName): void; reveal(): void }

/** Carrosséis de personagens por categoria (só fotos de rosto). */
export function createCharacterPicker(initial: CharacterName, onPick: (n: CharacterName) => void): CharacterPicker {
  const items = new Map<CharacterName, HTMLButtonElement>();
  const root = el('div', 'pk-cats');
  let current = initial;
  const mark = (): void => items.forEach((b, n) => b.classList.toggle('sel', n === current));
  for (const cat of CATEGORIES) {
    const track = el('div', 'pk-track');
    for (const n of cat.names) {
      const img = el('img');
      img.src = faceUrl(n);
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      const b = el('button', 'pk-item', img, el('span', '', labelOf(n)));
      b.type = 'button';
      b.onclick = () => { current = n; mark(); onPick(n); };
      items.set(n, b);
      track.appendChild(b);
    }
    const arrow = (cls: 'l' | 'r', txt: string, dir: number): HTMLButtonElement => {
      const a = el('button', `pk-arrow ${cls}`, txt);
      a.type = 'button';
      a.onclick = () => track.scrollBy({ left: dir * track.clientWidth * 0.8 });
      return a;
    };
    root.appendChild(el('div', 'pk-cat', el('h3', '', cat.title), el('div', 'pk-row', arrow('l', '‹', -1), track, arrow('r', '›', 1))));
  }
  mark();
  return {
    root,
    set(n): void { current = n; mark(); },
    reveal(): void { items.get(current)?.scrollIntoView({ block: 'nearest', inline: 'center' }); },
  };
}

export interface TeamPicker { root: HTMLElement; setTeams(teams: Team[]): void; set(id: string): void }

/** Escolha de equipe: "Sem equipe" e uma bolinha de duas cores por equipe. */
export function createTeamPicker(teams: Team[], initialId: string, onPick: (id: string) => void): TeamPicker {
  const root = el('div', 'pk-teams');
  let list = teams;
  let current = initialId;
  const render = (): void => {
    root.textContent = '';
    const none = el('button', `pk-team${current === '' ? ' sel' : ''}`, el('span', 'pk-sw none', '∅'), 'Sem equipe');
    none.type = 'button';
    none.onclick = () => { current = ''; render(); onPick(''); };
    root.appendChild(none);
    for (const t of list) {
      const sw = el('span', 'pk-sw');
      sw.style.cssText = swatchStyle(t.c1, t.c2);
      const b = el('button', `pk-team${current === t.id ? ' sel' : ''}`, sw, t.name);
      b.type = 'button';
      b.onclick = () => { current = t.id; render(); onPick(t.id); };
      root.appendChild(b);
    }
  };
  render();
  return {
    root,
    setTeams(t): void { list = t; if (current && !t.some((x) => x.id === current)) current = ''; render(); },
    set(id): void { current = id; render(); },
  };
}
