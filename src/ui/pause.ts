// Menu de pausa (engrenagem): equipe, personagem, armas que o jogador já tem, loja e (só para o admin) gerenciar equipes.
import type { CharacterName } from '../game/characters';
import { SHOP, WEAPON_IMG, WEAPON_NAMES, type Inventory, type ShopItem, type WeaponId } from '../game/inventory';
import { deleteTeam, getTeams, HEX, isAdmin, loadTeams, MAX_TEAM_NAME, saveTeam, type Team } from '../game/teams';
import { ICON } from './icons';
import { createCharacterPicker, createTeamPicker, el, PICKER_CSS, swatchStyle } from './pickers';

export type PauseTab = 'team' | 'char' | 'weapons' | 'shop' | 'admin';

export interface PauseDeps {
  inv: Inventory;
  getTeamId(): string;
  setTeam(id: string): void;
  getCharacter(): CharacterName;
  setCharacter(n: CharacterName): void;
  currentWeapon(): WeaponId;
  /** segundos de proteção restantes (sem armas enquanto > 0) */
  protectLeft(): number;
  equip(w: WeaponId): void;
  ammoOf(w: WeaponId): { mag: number; reserve: number };
  buy(item: ShopItem): { ok: boolean; msg: string };
  /** abriu/fechou (o main pausa e retoma o jogo) */
  onToggle(open: boolean): void;
  /** o admin mudou as equipes (o main reaplica a equipe do jogador) */
  onTeamsChanged(): void;
}

export interface PauseMenu {
  open(tab?: PauseTab): void;
  close(): void;
  readonly isOpen: boolean;
  /** compra feita por fora (dinheiro mudou) */
  refresh(): void;
}

const CSS = `
.ps{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(6,10,18,.72);backdrop-filter:blur(5px);font-family:system-ui,sans-serif;color:#fff;padding:10px;box-sizing:border-box}
.ps.open{display:flex}
.ps *{box-sizing:border-box}
.ps button{font-family:inherit;cursor:pointer}
.ps-panel{width:min(940px,100%);max-height:100%;display:flex;flex-direction:column;background:#1b2130;border:1px solid rgba(255,255,255,.14);border-radius:18px;overflow:hidden;box-shadow:0 16px 60px rgba(0,0,0,.6)}
.ps-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141926;border-bottom:1px solid rgba(255,255,255,.1)}
.ps-head h2{margin:0;font-size:18px;flex:1;white-space:nowrap}
.ps-money{font-weight:800;color:#8fe38a;font-size:17px}
.ps-x{width:38px;height:38px;border-radius:50%;border:0;background:#2a3144;color:#fff;font-size:18px}
.ps-tabs{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;background:#161c2b;border-bottom:1px solid rgba(255,255,255,.08);scrollbar-width:none}
.ps-tab{flex:0 0 auto;padding:9px 14px;border-radius:10px;border:2px solid transparent;background:#232b3e;color:#cfd8ea;font-size:14px;font-weight:700}
.ps-tab.on{border-color:#4cc2ff;background:#25415a;color:#fff}
.ps-tab.adm{background:#3d2d52}
.ps-body{flex:1;overflow:auto;padding:14px}
.ps-foot{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141926;border-top:1px solid rgba(255,255,255,.1)}
.ps-go{padding:11px 22px;font-size:16px;font-weight:800;border:0;border-radius:11px;background:#4cc2ff;color:#10202e}
.ps-credits{margin-left:auto;font-size:11px;opacity:.6;text-align:right;max-width:55%;line-height:1.3}
.ps-note{font-size:13px;opacity:.75;margin:0 0 10px}
.ps-msg{min-height:20px;font-size:13px;margin:0 0 8px;font-weight:700}
.ps-msg.err{color:#ff9b8f}.ps-msg.ok{color:#8fe38a}
.ps-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px}
.ps-card{display:flex;flex-direction:column;gap:6px;padding:10px;border:2px solid #3b4358;border-radius:14px;background:#141926;text-align:left;color:#fff}
.ps-card.sel{border-color:#4cc2ff;background:#25415a}
.ps-card .pic{height:70px;display:flex;align-items:center;justify-content:center;background:#2f6b2f;border-radius:10px;padding:6px}
.ps-card .pic img{max-width:100%;max-height:100%;object-fit:contain}
.ps-card .pic svg{width:46px;height:46px;fill:#fff}
.ps-card b{font-size:15px}
.ps-card small{font-size:12px;opacity:.75;line-height:1.3}
.ps-price{font-weight:800;color:#8fe38a}
.ps-buy{padding:9px;border:0;border-radius:9px;background:#4cc2ff;color:#10202e;font-weight:800;font-size:14px}
.ps-buy:disabled{opacity:.4;cursor:default}
.ps-tag{align-self:flex-start;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#4cc2ff;color:#10202e}
.ps-adm{display:flex;flex-direction:column;gap:10px}
.ps-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px;border:2px solid #3b4358;border-radius:14px;background:#141926}
.ps-row .pk-sw{width:38px;height:38px}
.ps-row input[type=text]{flex:1;min-width:140px;padding:10px;font-size:15px;border-radius:9px;border:2px solid #3b4358;background:#0f1420;color:#fff}
.ps-col{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;opacity:.9}
.ps-row input[type=color]{width:46px;height:38px;padding:0;border:2px solid #3b4358;border-radius:8px;background:#0f1420;cursor:pointer}
.ps-save{padding:10px 14px;border:0;border-radius:9px;background:#4cc2ff;color:#10202e;font-weight:800}
.ps-del{padding:10px 14px;border:0;border-radius:9px;background:#8c2f2f;color:#fff;font-weight:800}
.ps-add{align-self:flex-start;padding:11px 16px;border:2px dashed #4cc2ff;border-radius:11px;background:transparent;color:#bfe9ff;font-weight:800;font-size:14px}
.ps-center{display:flex;flex-direction:column;align-items:center;gap:12px}
@media (max-height:520px){.ps-head{padding:6px 12px}.ps-tab{padding:7px 11px;font-size:13px}.ps-body{padding:10px}.ps-go{padding:8px 18px}}
`;

const CREDITS = 'Modelos: Diddy_Blud_117 e Nxrmalman (CC-BY 4.0) — veja CREDITS.md';

export function createPauseMenu(d: PauseDeps): PauseMenu {
  const style = el('style');
  style.textContent = CSS + PICKER_CSS;
  document.head.appendChild(style);

  const money = el('span', 'ps-money');
  const closeX = el('button', 'ps-x', '✕');
  closeX.type = 'button';
  const tabsBar = el('div', 'ps-tabs');
  const body = el('div', 'ps-body');
  const goBtn = el('button', 'ps-go', 'Continuar jogando');
  goBtn.type = 'button';
  const panel = el('div', 'ps-panel',
    el('div', 'ps-head', el('h2', '', 'Jogo pausado'), money, closeX),
    tabsBar, body,
    el('div', 'ps-foot', goBtn, el('span', 'ps-credits', CREDITS)));
  const root = el('div', 'ps', panel);
  document.body.appendChild(root);

  let tab: PauseTab = 'team';
  let admin = false;
  let opened = false;
  void isAdmin().then((a) => { admin = a; if (opened) renderTabs(); });

  const tabs: { id: PauseTab; label: string; adm?: boolean }[] = [
    { id: 'team', label: 'Equipe' },
    { id: 'char', label: 'Personagem' },
    { id: 'weapons', label: 'Armas' },
    { id: 'shop', label: 'Loja' },
    { id: 'admin', label: 'Gerenciar equipes', adm: true },
  ];

  function renderTabs(): void {
    tabsBar.textContent = '';
    for (const t of tabs) {
      if (t.adm && !admin) continue;
      const b = el('button', `ps-tab${t.adm ? ' adm' : ''}${tab === t.id ? ' on' : ''}`, t.label);
      b.type = 'button';
      b.onclick = () => { tab = t.id; renderTabs(); renderBody(); };
      tabsBar.appendChild(b);
    }
  }

  const msg = (text: string, kind: '' | 'ok' | 'err' = ''): HTMLElement => {
    const m = el('p', `ps-msg ${kind}`, text);
    return m;
  };

  function renderTeam(): void {
    const picker = createTeamPicker(getTeams(), d.getTeamId(), (id) => d.setTeam(id));
    body.append(el('p', 'ps-note', 'Escolha a equipe: as duas cores aparecem no anel sob os seus pés e no seu nome para os outros jogadores.'), el('div', 'ps-center', picker.root));
    void loadTeams().then((t) => picker.setTeams(t));
  }

  function renderChar(): void {
    const picker = createCharacterPicker(d.getCharacter(), (n) => d.setCharacter(n));
    body.append(el('p', 'ps-note', 'Trocar de personagem vale na hora (a posição e a arma ficam como estão).'), picker.root);
    window.setTimeout(() => picker.reveal(), 50);
  }

  function renderWeapons(): void {
    const left = Math.ceil(d.protectLeft());
    body.append(el('p', 'ps-note', left > 0 ? `Você está protegido por mais ${left} s (sem dano), mas sem armas: elas voltam quando a proteção acabar.` : 'Só aparecem as armas que você já tem. Para conseguir mais, abra a Loja.'));
    const grid = el('div', 'ps-grid');
    const cur = d.currentWeapon();
    for (const w of [1, 3, 0, 2, 4, 5, 6] as const) {
      if (!d.inv.has(w)) continue;
      const pic = el('div', 'pic');
      const src = WEAPON_IMG[w];
      if (src) { const img = el('img'); img.src = src; img.alt = ''; pic.appendChild(img); } else pic.insertAdjacentHTML('beforeend', ICON.fist);
      const gun = w === 0 || w === 3;
      const a = d.ammoOf(w);
      const card = el('button', `ps-card${cur === w ? ' sel' : ''}`, pic, el('b', '', WEAPON_NAMES[w]), el('small', '', gun ? `Munição: ${a.mag}/${a.reserve}` : 'Corpo a corpo'));
      if (cur === w) card.appendChild(el('span', 'ps-tag', 'Na mão'));
      card.type = 'button';
      card.onclick = () => { d.equip(w); body.textContent = ''; renderWeapons(); };
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function renderShop(): void {
    const out = msg('');
    body.append(el('p', 'ps-note', 'Compre armas, munição, vida e colete com o seu dinheiro. Cada abate rende $100.'), out);
    const grid = el('div', 'ps-grid');
    for (const it of SHOP) {
      const pic = el('div', 'pic');
      if (it.img) { const img = el('img'); img.src = it.img; img.alt = ''; pic.appendChild(img); }
      else pic.insertAdjacentHTML('beforeend', it.kind === 'health' ? ICON.plus : it.kind === 'armor' ? ICON.shield : ICON.bullet);
      const owned = it.kind === 'weapon' && it.weapon !== undefined && d.inv.has(it.weapon);
      const buy = el('button', 'ps-buy', owned ? 'Você já tem' : 'Comprar');
      buy.type = 'button';
      buy.disabled = owned || d.inv.money < it.price;
      buy.onclick = () => {
        const r = d.buy(it);
        out.className = `ps-msg ${r.ok ? 'ok' : 'err'}`;
        out.textContent = r.msg;
        updateMoney();
        if (r.ok) { body.textContent = ''; renderShop(); const o2 = body.querySelector('.ps-msg'); if (o2) { o2.className = 'ps-msg ok'; o2.textContent = r.msg; } }
      };
      grid.appendChild(el('div', 'ps-card', pic, el('b', '', it.name), el('small', '', it.desc), el('span', 'ps-price', `$${it.price}`), buy));
    }
    body.appendChild(grid);
  }

  function renderAdmin(): void {
    const out = msg('');
    const list = el('div', 'ps-adm');
    body.append(el('p', 'ps-note', 'Administrador: adicione, altere ou apague equipes. Escolha as cores no seletor. Vale para todos os jogadores.'), out, list);

    const row = (t: Team | null): HTMLElement => {
      const state = { name: t?.name ?? 'Nova equipe', c1: t?.c1 ?? '#3366ff', c2: t?.c2 ?? '#ffffff' };
      const sw = el('span', 'pk-sw');
      const paint = (): void => { sw.style.cssText = swatchStyle(state.c1, state.c2); };
      paint();
      const name = el('input');
      name.type = 'text';
      name.maxLength = MAX_TEAM_NAME;
      name.value = state.name;
      name.oninput = () => { state.name = name.value; };
      const color = (key: 'c1' | 'c2', label: string): HTMLElement => {
        const inp = el('input');
        inp.type = 'color';
        inp.value = state[key];
        inp.oninput = () => { if (HEX.test(inp.value)) { state[key] = inp.value.toLowerCase(); paint(); } };
        return el('label', 'ps-col', inp, label);
      };
      const save = el('button', 'ps-save', t ? 'Salvar' : 'Criar');
      save.type = 'button';
      save.onclick = () => {
        save.disabled = true;
        void saveTeam({ id: t?.id, ...state }).then((e) => {
          out.className = `ps-msg ${e ? 'err' : 'ok'}`;
          out.textContent = e ?? 'Equipe salva.';
          if (!e) { d.onTeamsChanged(); body.textContent = ''; renderAdmin(); const o2 = body.querySelector('.ps-msg'); if (o2) { o2.className = 'ps-msg ok'; o2.textContent = 'Equipe salva.'; } }
          save.disabled = false;
        });
      };
      const kids: Node[] = [sw, name, color('c1', 'Cor 1'), color('c2', 'Cor 2'), save];
      if (t) {
        const del = el('button', 'ps-del', 'Apagar');
        del.type = 'button';
        del.onclick = () => {
          if (!window.confirm(`Apagar a equipe "${t.name}"?`)) return;
          void deleteTeam(t.id).then((e) => {
            if (e) { out.className = 'ps-msg err'; out.textContent = e; return; }
            d.onTeamsChanged();
            body.textContent = '';
            renderAdmin();
            const o2 = body.querySelector('.ps-msg');
            if (o2) { o2.className = 'ps-msg ok'; o2.textContent = 'Equipe apagada.'; }
          });
        };
        kids.push(del);
      }
      return el('div', 'ps-row', ...kids);
    };

    for (const t of getTeams()) list.appendChild(row(t));
    const add = el('button', 'ps-add', '+ Adicionar equipe');
    add.type = 'button';
    add.onclick = () => { list.insertBefore(row(null), add); add.scrollIntoView({ block: 'nearest' }); };
    list.appendChild(add);
  }

  function renderBody(): void {
    body.textContent = '';
    if (tab === 'team') renderTeam();
    else if (tab === 'char') renderChar();
    else if (tab === 'weapons') renderWeapons();
    else if (tab === 'shop') renderShop();
    else if (admin) renderAdmin();
  }

  function updateMoney(): void { money.textContent = `$${d.inv.money.toLocaleString('en-US')}`; }

  const api: PauseMenu = {
    get isOpen(): boolean { return opened; },
    open(t?: PauseTab): void {
      if (t) tab = t;
      if (tab === 'admin' && !admin) tab = 'team';
      if (document.pointerLockElement) document.exitPointerLock();
      opened = true;
      root.classList.add('open');
      updateMoney();
      renderTabs();
      renderBody();
      d.onToggle(true);
    },
    close(): void {
      if (!opened) return;
      opened = false;
      root.classList.remove('open');
      d.onToggle(false);
    },
    refresh(): void { updateMoney(); if (opened) renderBody(); },
  };
  closeX.onclick = () => api.close();
  goBtn.onclick = () => api.close();
  root.addEventListener('pointerdown', (e) => { if (e.target === root) api.close(); });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyP') { if (opened) api.close(); else api.open(); }
    else if (e.code === 'Escape' && opened) api.close();
  });
  return api;
}
