// Menu de pausa (engrenagem): equipe, personagem, armas que o jogador já tem, loja e (só para o admin) gerenciar equipes.
import type { CharacterName } from '../game/characters';
import { ALL_WEAPONS, GARAGE_ITEMS, isGunId, SHOP, WEAPON_IMG, WEAPON_NAMES, type Inventory, type ShopItem, type WeaponId } from '../game/inventory';
import { brl, isReal, loadPrices, loadPurchases, payUrlOf, priceOf, REAL_ITEMS, safeUrl, savePrice } from '../game/shop';
import { clearTeamGraffiti, deleteTeam, getTeams, HEX, isAdmin, loadTeams, MAX_TEAM_NAME, saveTeam, saveTeamGraffiti, type Team } from '../game/teams';
import { toLightImage } from './image';
import { checkYoutube, type Billboard } from '../game/billboard';
import { ICON } from './icons';
import { createCharacterPicker, createTeamPicker, el, PICKER_CSS, swatchStyle } from './pickers';

export type PauseTab = 'team' | 'char' | 'weapons' | 'garage' | 'shop' | 'admin' | 'prices' | 'outdoor';

export interface PauseDeps {
  inv: Inventory;
  /** outdoor da praça (o admin controla o vídeo) */
  billboard: Billboard;
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
  /** veículo pessoal: modelo chamado agora ('' = nenhum), chamar um modelo perto do jogador e guardar */
  garage: { current(): string; call(model: string): string; park(): void };
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
.ps-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141926;border-bottom:1px solid rgba(255,255,255,.1)}
.ps-head h2{margin:0;font-size:18px;flex:1;white-space:nowrap}
.ps-money{font-weight:800;color:#8fe38a;font-size:17px}
.ps-x{width:38px;height:38px;border-radius:50%;border:0;background:#2a3144;color:#fff;font-size:18px}
.ps-tabs{flex:0 0 auto;display:flex;gap:6px;padding:8px 10px;overflow-x:auto;background:#161c2b;border-bottom:1px solid rgba(255,255,255,.08);scrollbar-width:none}
.ps-tab{flex:0 0 auto;padding:9px 14px;border-radius:10px;border:2px solid transparent;background:#232b3e;color:#cfd8ea;font-size:14px;font-weight:700}
.ps-tab.on{border-color:#4cc2ff;background:#25415a;color:#fff}
.ps-tab.adm{background:#3d2d52}
.ps-body{flex:1;overflow:auto;padding:14px}
.ps-foot{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141926;border-top:1px solid rgba(255,255,255,.1)}
.ps-go{padding:11px 22px;font-size:16px;font-weight:800;border:0;border-radius:11px;background:#4cc2ff;color:#10202e}
.ps-credits{margin-left:auto;font-size:11px;opacity:.6;text-align:right;max-width:55%;line-height:1.3}
.ps-note{font-size:13px;opacity:.75;margin:0 0 10px}
.ps-msg{min-height:20px;font-size:13px;margin:0 0 8px;font-weight:700}
.ps-msg.err{color:#ff9b8f}.ps-msg.ok{color:#8fe38a}
.ps-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px}
.ps-card{display:flex;flex-direction:column;gap:6px;padding:10px;border:2px solid #3b4358;border-radius:14px;background:#141926;text-align:left;color:#fff}
.ps-card.sel{border-color:#4cc2ff;background:#25415a}
.ps-card .pic{height:108px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#3f8a3f,#2a5a2a);border-radius:10px;padding:8px}
.ps-card .pic img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}
.ps-card .pic svg{width:76px;height:76px}
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
.ps-save:disabled,.ps-del:disabled{opacity:.4;cursor:default}
.ps-del{padding:10px 14px;border:0;border-radius:9px;background:#8c2f2f;color:#fff;font-weight:800}
.ps-add{align-self:flex-start;padding:11px 16px;border:2px dashed #4cc2ff;border-radius:11px;background:transparent;color:#bfe9ff;font-weight:800;font-size:14px}
.ps-h3{margin:16px 0 8px;font-size:15px;color:#bfe9ff}
.ps-name{font-weight:800;min-width:130px}
.ps-row input[type=number]{width:90px;padding:10px;font-size:15px;border-radius:9px;border:2px solid #3b4358;background:#0f1420;color:#fff}
.ps-img{display:flex;align-items:center;gap:8px;flex-basis:100%;padding-top:8px;border-top:1px dashed #3b4358;font-size:13px}
.ps-img img{width:54px;height:54px;object-fit:contain;border-radius:8px;background:#0f1420;border:2px solid #3b4358}
.ps-img .none{width:54px;height:54px;border-radius:8px;border:2px dashed #3b4358;display:flex;align-items:center;justify-content:center;font-size:10px;opacity:.7;text-align:center}
.ps-file{padding:9px 13px;border-radius:9px;background:#3d2d52;color:#fff;font-weight:800;cursor:pointer}
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
  let admin = import.meta.env.DEV && new URLSearchParams(location.search).has('admin'); // ?admin=1 só no npm run dev: mostra as abas do admin para testar a tela
  let opened = false;
  void isAdmin().then((a) => { admin = a || admin; d.inv.admin = a; d.billboard.setAdmin(a); if (opened) { renderTabs(); renderBody(); } });
  void loadPrices();

  const tabs: { id: PauseTab; label: string; adm?: boolean }[] = [
    { id: 'team', label: 'Equipe' },
    { id: 'char', label: 'Personagem' },
    { id: 'weapons', label: 'Armas' },
    { id: 'garage', label: 'Garagem' },
    { id: 'shop', label: 'Loja' },
    { id: 'admin', label: 'Gerenciar equipes', adm: true },
    { id: 'prices', label: 'Preços', adm: true },
    { id: 'outdoor', label: 'Outdoor', adm: true },
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
    for (const w of ALL_WEAPONS) {
      if (!d.inv.has(w)) continue;
      const pic = el('div', 'pic');
      const src = WEAPON_IMG[w];
      if (src) { const img = el('img'); img.src = src; img.alt = ''; pic.appendChild(img); } else pic.insertAdjacentHTML('beforeend', ICON.fist);
      const gun = isGunId(w);
      const a = d.ammoOf(w);
      const card = el('button', `ps-card${cur === w ? ' sel' : ''}`, pic, el('b', '', WEAPON_NAMES[w]), el('small', '', gun ? `Munição: ${a.mag}/${a.reserve}` : 'Corpo a corpo'));
      if (cur === w) card.appendChild(el('span', 'ps-tag', 'Na mão'));
      card.type = 'button';
      card.onclick = () => { d.equip(w); body.textContent = ''; renderWeapons(); };
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function renderGarage(): void {
    const out = msg('');
    const cur = d.garage.current();
    body.append(el('p', 'ps-note', 'Escolha o seu veículo: ele aparece perto de você e só você e a sua equipe podem entrar. Um veículo por vez. As cores são as da sua equipe.'), out);
    const mine = GARAGE_ITEMS.filter((it) => d.inv.hasItem(it.id));
    if (mine.length === 0) { body.appendChild(el('p', 'ps-note', 'Você ainda não tem veículos. Compre na Loja.')); return; }
    const grid = el('div', 'ps-grid');
    for (const it of mine) {
      const pic = el('div', 'pic');
      if (it.img) { const img = el('img'); img.src = it.img; img.alt = ''; pic.appendChild(img); }
      const here = cur === it.model;
      const go = el('button', 'ps-buy', here ? 'Guardar' : 'Chamar');
      go.type = 'button';
      go.onclick = () => {
        if (here) d.garage.park();
        else { const r = d.garage.call(it.model!); if (r) { out.className = 'ps-msg err'; out.textContent = r; return; } }
        api.close();
      };
      const card = el('div', `ps-card${here ? ' sel' : ''}`, pic, el('b', '', it.name), el('small', '', it.desc));
      if (here) card.appendChild(el('span', 'ps-tag', 'Perto de você'));
      card.appendChild(go);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function shopCard(it: ShopItem, out: HTMLElement): HTMLElement {
    const pic = el('div', 'pic');
    if (it.img) { const img = el('img'); img.src = it.img; img.alt = ''; pic.appendChild(img); }
    else pic.insertAdjacentHTML('beforeend', it.kind === 'health' ? ICON.plus : it.kind === 'armor' ? ICON.shield : ICON.bullet);
    const real = isReal(it);
    const owned = real && d.inv.hasItem(it.id);
    const url = payUrlOf(it);
    const buy = el('button', 'ps-buy', owned ? 'Você já tem' : real ? 'Comprar' : 'Comprar');
    buy.type = 'button';
    buy.disabled = owned || (!real && d.inv.money < it.price);
    buy.onclick = () => {
      if (real) {
        const u = safeUrl(url);
        out.className = 'ps-msg err';
        if (!u) { out.textContent = 'O pagamento deste item ainda não foi configurado.'; return; }
        window.open(u, '_blank', 'noopener');
        out.className = 'ps-msg ok';
        out.textContent = 'Pagamento aberto em outra aba. Depois de pagar, toque em "Já paguei" para atualizar.';
        return;
      }
      const r = d.buy(it);
      out.className = `ps-msg ${r.ok ? 'ok' : 'err'}`;
      out.textContent = r.msg;
      updateMoney();
      if (r.ok) { body.textContent = ''; renderShop(); const o2 = body.querySelector('.ps-msg'); if (o2) { o2.className = 'ps-msg ok'; o2.textContent = r.msg; } }
    };
    return el('div', 'ps-card', pic, el('b', '', it.name), el('small', '', it.desc), el('span', 'ps-price', real ? brl(priceOf(it)) : `$${it.price}`), buy);
  }

  function renderShop(): void {
    const out = msg('');
    const paid = el('button', 'ps-save', 'Já paguei');
    paid.type = 'button';
    paid.onclick = () => {
      paid.disabled = true;
      void loadPurchases(d.inv, admin).then(() => {
        body.textContent = '';
        renderShop();
        const o2 = body.querySelector('.ps-msg');
        if (o2) { o2.className = 'ps-msg ok'; o2.textContent = 'Compras atualizadas. Se o item ainda não apareceu, a liberação pode levar alguns minutos.'; }
      });
    };
    body.append(el('p', 'ps-note', 'Armas e veículos são vendidos em reais (R$). Munição, vida e colete usam o dinheiro do jogo ($); cada abate rende $100.'), el('div', 'ps-center', paid), out);
    const sections: [string, ShopItem[]][] = [
      ['Armas de fogo', SHOP.filter((i) => i.kind === 'weapon' && i.weapon !== undefined && isGunId(i.weapon))],
      ['Armas brancas', SHOP.filter((i) => i.kind === 'weapon' && i.weapon !== undefined && !isGunId(i.weapon))],
      ['Veículos', SHOP.filter((i) => i.kind === 'vehicle')],
      ['Munição, vida e colete', SHOP.filter((i) => !isReal(i))],
    ];
    for (const [title, items] of sections) {
      body.appendChild(el('h3', 'ps-h3', title));
      const grid = el('div', 'ps-grid');
      for (const it of items) grid.appendChild(shopCard(it, out));
      body.appendChild(grid);
    }
  }

  function renderPrices(): void {
    const out = msg('');
    const list = el('div', 'ps-adm');
    body.append(el('p', 'ps-note', 'Administrador: preço em reais e link de pagamento (Mercado Pago) de cada arma e veículo. O link precisa começar com https://. Vale para todos os jogadores.'), out, list);
    for (const it of REAL_ITEMS) {
      const price = el('input');
      price.type = 'number';
      price.min = '0';
      price.max = '9999';
      price.step = '0.01';
      price.value = String(priceOf(it));
      const link = el('input');
      link.type = 'text';
      link.placeholder = 'Link de pagamento (https://...)';
      link.value = payUrlOf(it);
      link.maxLength = 500;
      const save = el('button', 'ps-save', 'Salvar');
      save.type = 'button';
      save.onclick = () => {
        save.disabled = true;
        void savePrice(it.id, Number(price.value.replace(',', '.')), link.value).then((e) => {
          out.className = `ps-msg ${e ? 'err' : 'ok'}`;
          out.textContent = e ?? `${it.name}: salvo.`;
          save.disabled = false;
        });
      };
      const label = el('span', 'ps-name', it.name);
      list.appendChild(el('div', 'ps-row', label, el('label', 'ps-col', price, 'R$'), link, save));
    }
  }

  let outdoorTimer = 0;
  function stopOutdoor(): void {
    window.clearInterval(outdoorTimer);
    outdoorTimer = 0;
    d.billboard.attachPreview(null);
  }

  const mmss = (s: number): string => {
    const t = Math.max(0, Math.floor(s));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    return `${h > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(m)}:${String(sec).padStart(2, '0')}`;
  };

  /** Controle do outdoor da praça: vídeo/live do YouTube, play/pause, parar, ±10 s e linha do tempo. */
  function renderOutdoor(): void {
    const out = msg('');
    const url = el('input');
    url.type = 'text';
    url.placeholder = 'Link do vídeo ou da live do YouTube';
    url.maxLength = 300;
    const check = el('button', 'ps-save', 'Verificar');
    check.type = 'button';
    const set = el('button', 'ps-save', 'Colocar no outdoor');
    set.type = 'button';
    const clear = el('button', 'ps-del', 'Tirar o vídeo');
    clear.type = 'button';
    const preview = el('div', 'ps-prev');
    preview.style.cssText = 'width:min(100%,360px);aspect-ratio:16/9;background:#000;border-radius:12px;border:2px solid #3b4358;margin:10px auto 0;display:flex;align-items:center;justify-content:center;color:#7f8aa3;font-size:13px';
    preview.textContent = 'A prévia do vídeo aparece aqui';
    const btn = (label: string, title: string): HTMLButtonElement => { const b = el('button', 'ps-save', label); b.type = 'button'; b.title = title; b.style.minWidth = '64px'; return b; };
    const back = btn('⏪ 10', 'Voltar 10 segundos');
    const playPause = btn('▶ Tocar', 'Tocar ou pausar');
    const stopB = btn('⏹ Parar', 'Parar e voltar ao início');
    const fwd = btn('10 ⏩', 'Pular 10 segundos');
    const bar = el('input');
    bar.type = 'range';
    bar.min = '0';
    bar.max = '1';
    bar.step = '0.5';
    bar.value = '0';
    bar.style.cssText = 'flex:1;min-width:160px;accent-color:#ff2b2b;height:28px';
    const time = el('span', 'ps-name', '0:00 / 0:00');
    time.style.minWidth = '110px';
    const badge = el('span', 'ps-tag', '');
    badge.style.cssText = 'display:none;background:#d00;color:#fff';
    const ctl = el('div', 'ps-row', back, playPause, stopB, fwd);
    const line = el('div', 'ps-row', bar, time, badge);
    body.append(
      el('p', 'ps-note', 'Administrador: o vídeo do outdoor da calçada em frente ao parque (de frente para a avenida) toca igual para todos. Quem chega perto vê o quadro do vídeo e ouve; o volume cai com a distância. Aceita vídeos e lives do YouTube (o dono precisa permitir incorporar).'),
      out, el('div', 'ps-row', url, check, set, clear), preview, ctl, line);

    const run = (p: Promise<string | null>, ok = ''): void => {
      void p.then((e) => { out.className = `ps-msg ${e ? 'err' : 'ok'}`; out.textContent = e ?? ok; });
    };
    check.onclick = () => {
      out.className = 'ps-msg';
      out.textContent = 'Verificando...';
      void checkYoutube(url.value).then((r) => { out.className = `ps-msg ${r.ok ? 'ok' : 'err'}`; out.textContent = r.msg; });
    };
    set.onclick = () => run(d.billboard.setVideo(url.value), 'Vídeo colocado no outdoor.');
    clear.onclick = () => run(d.billboard.clear(), 'Outdoor sem vídeo.');
    back.onclick = () => run(d.billboard.seekBy(-10));
    fwd.onclick = () => run(d.billboard.seekBy(10));
    stopB.onclick = () => run(d.billboard.stop());
    playPause.onclick = () => run(d.billboard.info().playing ? d.billboard.pause() : d.billboard.play());
    let dragging = false;
    bar.oninput = () => { dragging = true; time.textContent = `${mmss(Number(bar.value))} / ${mmss(Number(bar.max))}`; };
    bar.onchange = () => { dragging = false; run(d.billboard.seekTo(Number(bar.value))); };

    d.billboard.attachPreview(preview);
    outdoorTimer = window.setInterval(() => {
      const i = d.billboard.info();
      playPause.textContent = i.playing ? '⏸ Pausar' : '▶ Tocar';
      for (const b of [back, playPause, stopB, fwd, clear]) b.disabled = !i.has && b !== clear;
      clear.disabled = !i.has;
      badge.style.display = i.live ? 'inline-block' : 'none';
      badge.textContent = '● AO VIVO';
      bar.disabled = !i.has || i.live;
      if (!i.live && !dragging) {
        const max = Math.max(i.duration, i.time, 1);
        bar.max = String(Math.ceil(max));
        bar.value = String(i.time);
        time.textContent = `${mmss(i.time)} / ${mmss(i.duration)}`;
      } else if (i.live) time.textContent = 'ao vivo';
      if (i.error && !out.textContent) { out.className = 'ps-msg err'; out.textContent = i.error; }
    }, 250);
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
      const rowEl = el('div', 'ps-row', ...kids);
      if (t && !t.id.startsWith('padrao-')) rowEl.appendChild(graffitiPart(t));
      return rowEl;
    };

    /** Imagem do grafite (lata de spray) da equipe: escolhe o arquivo, converte para webp leve e envia. */
    const graffitiPart = (t: Team): HTMLElement => {
      const thumb = t.graffiti ? Object.assign(el('img'), { src: t.graffiti, alt: '' }) : el('span', 'none', 'sem imagem');
      const input = el('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      const pick = el('label', 'ps-file', t.graffiti ? 'Trocar imagem do spray' : 'Enviar imagem do spray', input);
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        pick.style.opacity = '.5';
        out.className = 'ps-msg';
        out.textContent = 'Convertendo para webp e enviando...';
        void toLightImage(f).then((blob) => saveTeamGraffiti(t.id, blob).then((e) => ({ e, kb: Math.round(blob.size / 1024) })))
          .then(({ e, kb }) => {
            out.className = `ps-msg ${e ? 'err' : 'ok'}`;
            out.textContent = e ?? `Imagem enviada (${kb} KB, webp). Os jogadores já veem nas próximas pinturas.`;
            if (!e) { body.textContent = ''; renderAdmin(); const o2 = body.querySelector('.ps-msg'); if (o2) { o2.className = 'ps-msg ok'; o2.textContent = `Imagem enviada (${kb} KB).`; } }
          })
          .catch((err: unknown) => { out.className = 'ps-msg err'; out.textContent = err instanceof Error ? err.message : 'Falha ao enviar a imagem.'; })
          .finally(() => { pick.style.opacity = ''; input.value = ''; });
      };
      const kids: Node[] = [thumb, pick, el('span', '', 'Imagem pintada na parede por esta equipe (png, jpg ou webp; fundo transparente fica melhor).')];
      if (t.graffiti) {
        const del = el('button', 'ps-del', 'Tirar imagem');
        del.type = 'button';
        del.onclick = () => {
          void clearTeamGraffiti(t.id).then((e) => {
            out.className = `ps-msg ${e ? 'err' : 'ok'}`;
            out.textContent = e ?? 'Imagem removida (volta ao desenho padrão).';
            if (!e) { body.textContent = ''; renderAdmin(); const o2 = body.querySelector('.ps-msg'); if (o2) { o2.className = 'ps-msg ok'; o2.textContent = 'Imagem removida.'; } }
          });
        };
        kids.push(del);
      }
      return el('div', 'ps-img', ...kids);
    };

    for (const t of getTeams()) list.appendChild(row(t));
    const add = el('button', 'ps-add', '+ Adicionar equipe');
    add.type = 'button';
    add.onclick = () => { list.insertBefore(row(null), add); add.scrollIntoView({ block: 'nearest' }); };
    list.appendChild(add);
  }

  function renderBody(): void {
    stopOutdoor();
    body.textContent = '';
    if (tab === 'team') renderTeam();
    else if (tab === 'char') renderChar();
    else if (tab === 'weapons') renderWeapons();
    else if (tab === 'garage') renderGarage();
    else if (tab === 'shop') renderShop();
    else if (admin && tab === 'prices') renderPrices();
    else if (admin && tab === 'outdoor') renderOutdoor();
    else if (admin) renderAdmin();
  }

  function updateMoney(): void { money.textContent = `$${d.inv.money.toLocaleString('en-US')}`; }

  const api: PauseMenu = {
    get isOpen(): boolean { return opened; },
    open(t?: PauseTab): void {
      if (t) tab = t;
      if ((tab === 'admin' || tab === 'prices' || tab === 'outdoor') && !admin) tab = 'team';
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
      stopOutdoor();
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
