import { enterLandscape } from './orientation';
import { CATEGORIES, CHARACTERS, labelOf, type CharacterName } from '../game/characters';
import { authAvailable, currentUser, signInWithGoogle, signOut, type AuthUser } from '../net/auth';

export interface Profile {
  name: string;
  character: CharacterName;
}

const STORAGE_KEY = 'arena-profile';
const MAX_NAME = 16;
const DEFAULT_CHARACTER: CharacterName = 'Carlos';

function loadSaved(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Profile>;
    const character = CHARACTERS.includes(raw.character as CharacterName)
      ? (raw.character as CharacterName)
      : DEFAULT_CHARACTER;
    return { name: (raw.name ?? '').slice(0, MAX_NAME), character };
  } catch {
    return { name: '', character: DEFAULT_CHARACTER };
  }
}

const saveProfile = (p: Profile): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* sem armazenamento */ }
};

const face = (n: CharacterName): string => `/faces/${n}.webp`;

const CSS = `
.lobby{position:fixed;inset:0;z-index:10;font-family:system-ui,sans-serif;color:#fff;box-sizing:border-box;
  background:linear-gradient(rgba(10,16,28,.55),rgba(10,16,28,.15) 40%,rgba(10,16,28,.6));overflow:hidden}
.lobby *{box-sizing:border-box}
.lobby button{font-family:inherit;cursor:pointer}
.lb-home,.lb-select{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px}
/* tela larga: cartão à esquerda, a cidade aparece à direita */
@media (min-aspect-ratio:13/10){.lb-home{align-items:flex-start;padding-left:max(24px,7vw)}.lb-credits{text-align:left!important;padding-left:max(24px,7vw)}}
.lb-select{display:none;justify-content:flex-start;background:rgba(14,20,32,.9);backdrop-filter:blur(6px);padding:0}
.lobby.picking .lb-home{display:none}
.lobby.picking .lb-select{display:flex}
.lb-title{margin:0 0 14px;font-size:clamp(26px,5vw,40px);letter-spacing:.04em;text-shadow:0 3px 14px rgba(0,0,0,.7)}
.lb-sub{margin:-8px 0 14px;font-size:13px;opacity:.8;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.lb-card{width:min(360px,100%);background:rgba(27,33,48,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;
  display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.lb-face{width:min(200px,42vh);aspect-ratio:1;border-radius:16px;border:3px solid #4cc2ff;padding:0;overflow:hidden;background:#41506b;position:relative}
.lb-face img{width:100%;height:100%;object-fit:cover;display:block}
.lb-face{color:#fff}
.lb-face span{position:absolute;left:0;right:0;bottom:0;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,.75));font-size:15px;font-weight:700;color:#fff}
.lb-facecol{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.lb-hint{font-size:12px;opacity:.65;margin:0;text-align:center}
.lb-card label{align-self:flex-start;font-size:13px;opacity:.8;margin-bottom:-6px}
.lb-card input{width:100%;padding:12px;font-size:16px;border-radius:10px;border:2px solid #3b4358;background:#141926;color:#fff}
.lb-btn{width:100%;padding:13px;font-size:17px;font-weight:700;border:0;border-radius:11px;background:#4cc2ff;color:#10202e}
.lb-btn:disabled{opacity:.4;cursor:default}
.lb-google{display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#2b2f36}
.lb-google svg{width:20px;height:20px}
.lb-who{font-size:12px;opacity:.8;text-align:center;line-height:1.4}
.lb-who button{background:none;border:0;color:#7fd0ff;text-decoration:underline;font-size:12px;padding:0 2px}
.lb-err{font-size:12px;color:#ff9b8f;text-align:center;min-height:0}
.lb-credits{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:11px;opacity:.55;text-shadow:0 1px 4px #000}
.lb-bar{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:rgba(10,14,22,.8);border-bottom:1px solid rgba(255,255,255,.1)}
.lb-bar h2{margin:0;font-size:18px;flex:1}
.lb-bar .mini{width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #4cc2ff}
.lb-bar button{padding:10px 16px;font-size:15px;font-weight:700;border:0;border-radius:10px;background:#4cc2ff;color:#10202e}
.lb-cats{flex:1;overflow:auto;width:100%;padding:8px 0 24px}
.lb-cat{margin:12px 0 4px}
.lb-cat h3{margin:0 16px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
.lb-row{position:relative}
.lb-track{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 16px 8px;scrollbar-width:none;scroll-behavior:smooth}
.lb-track::-webkit-scrollbar{display:none}
.lb-item{flex:0 0 auto;width:clamp(104px,22vw,140px);scroll-snap-align:start;border:3px solid #3b4358;border-radius:14px;background:#1b2130;color:#fff;padding:0;overflow:hidden;text-align:center}
.lb-item img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.lb-item span{display:block;padding:6px 2px;font-size:13px;font-weight:600}
.lb-item.sel{border-color:#4cc2ff;background:#25415a;transform:scale(1.04)}
.lb-arrow{position:absolute;top:calc(50% - 22px);width:36px;height:44px;border:0;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:22px;z-index:2}
.lb-arrow.l{left:4px}.lb-arrow.r{right:4px}
@media (hover:none){.lb-arrow{display:none}}
@media (max-height:520px){.lb-title{font-size:20px;margin:0 0 6px}.lb-card{flex-direction:row;align-items:center;width:min(600px,100%);padding:12px;gap:14px}.lb-facecol{width:auto;flex:0 0 auto}.lb-face{width:min(38vh,150px)}.lb-credits{display:none}.lb-card input,.lb-btn{padding:9px;font-size:15px}.lb-form{flex:1;width:auto!important;gap:8px!important}}
`;

const GOOGLE_G = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

type Kids = (Node | string)[];
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: Kids): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

/**
 * Tela inicial: a cidade vista de cima ao fundo (o main desenha), foto do rosto do personagem, nome e login Google.
 * O personagem é escolhido numa tela própria, em carrosséis por categoria. Resolve quando o jogador entra no jogo.
 */
export function showLobby(): Promise<Profile> {
  const saved = loadSaved();
  let selected: CharacterName = saved.character;
  let user: AuthUser | null = null;

  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // ----- tela inicial -----
  const faceImg = el('img');
  faceImg.alt = '';
  faceImg.draggable = false;
  const faceName = el('span');
  const faceBtn = el('button', 'lb-face', faceImg, faceName);
  faceBtn.type = 'button';
  faceBtn.title = 'Trocar personagem';
  const nameInput = el('input');
  nameInput.id = 'lobby-name';
  nameInput.autocomplete = 'off';
  nameInput.placeholder = 'Digite seu nome';
  nameInput.maxLength = MAX_NAME;
  nameInput.value = saved.name;
  const nameLabel = el('label', '', 'Seu nome');
  nameLabel.htmlFor = 'lobby-name';
  const who = el('div', 'lb-who');
  const err = el('div', 'lb-err');
  const googleBtn = el('button', 'lb-btn lb-google');
  googleBtn.type = 'button';
  const goBtn = el('button', 'lb-btn lobby-go', 'Entrar no jogo');
  goBtn.type = 'button';
  const form = el('div', 'lb-form', nameLabel, nameInput, who, googleBtn, goBtn, err);
  form.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:10px';
  const card = el('div', 'lb-card', el('div', 'lb-facecol', faceBtn, el('p', 'lb-hint', 'Toque na foto para escolher o personagem')), form);
  const home = el('div', 'lb-home', el('h1', 'lb-title', 'Arena Online 3D'), card,
    el('p', 'lb-credits', 'Modelos: Diddy_Blud_117 e Nxrmalman (CC-BY 4.0) — veja CREDITS.md'));

  // ----- tela de seleção: um carrossel por categoria -----
  const miniFace = el('img', 'mini');
  miniFace.alt = '';
  const miniName = el('h2');
  const okBtn = el('button', '', 'Confirmar');
  okBtn.type = 'button';
  const bar = el('div', 'lb-bar', miniFace, miniName, okBtn);
  const cats = el('div', 'lb-cats');
  const items = new Map<CharacterName, HTMLButtonElement>();
  for (const cat of CATEGORIES) {
    const track = el('div', 'lb-track');
    for (const n of cat.names) {
      const img = el('img');
      img.src = face(n);
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      const b = el('button', 'lb-item', img, el('span', '', labelOf(n)));
      b.type = 'button';
      b.onclick = () => { selected = n; refresh(); };
      items.set(n, b);
      track.appendChild(b);
    }
    const arrow = (cls: 'l' | 'r', txt: string, dir: number): HTMLButtonElement => {
      const a = el('button', `lb-arrow ${cls}`, txt);
      a.type = 'button';
      a.onclick = () => track.scrollBy({ left: dir * track.clientWidth * 0.8 });
      return a;
    };
    cats.appendChild(el('div', 'lb-cat', el('h3', '', cat.title), el('div', 'lb-row', arrow('l', '‹', -1), track, arrow('r', '›', 1))));
  }
  const select = el('div', 'lb-select', bar, cats);

  const root = el('div', 'lobby', home, select);
  document.body.appendChild(root);

  function refresh(): void {
    faceImg.src = face(selected);
    faceName.textContent = labelOf(selected);
    miniFace.src = face(selected);
    miniName.textContent = labelOf(selected);
    items.forEach((b, n) => b.classList.toggle('sel', n === selected));
    const hasName = nameInput.value.trim().length > 0;
    googleBtn.style.display = user ? 'none' : '';
    goBtn.style.display = user ? '' : 'none';
    goBtn.disabled = !hasName;
    googleBtn.disabled = !authAvailable();
    saveProfile({ name: nameInput.value.trim().slice(0, MAX_NAME), character: selected });
  }

  function renderUser(): void {
    googleBtn.textContent = '';
    googleBtn.insertAdjacentHTML('beforeend', GOOGLE_G);
    googleBtn.append('Entrar com Google para continuar');
    who.textContent = '';
    if (user) {
      const out = el('button', '', 'trocar conta');
      out.type = 'button';
      out.onclick = () => { void signOut().then(() => { user = null; renderUser(); refresh(); }); };
      who.append(user.name ? `Conectado: ${user.name} · ` : 'Conectado com Google · ', out);
    } else {
      who.textContent = authAvailable() ? 'Para entrar no jogo, entre com sua conta Google.' : 'Login indisponível (Supabase não configurado).';
    }
  }

  faceBtn.onclick = () => { root.classList.add('picking'); items.get(selected)?.scrollIntoView({ block: 'nearest', inline: 'center' }); };
  okBtn.onclick = () => root.classList.remove('picking');
  nameInput.addEventListener('input', refresh);
  refresh();
  renderUser();

  void currentUser().then((u) => {
    user = u;
    if (u && !nameInput.value.trim() && u.name) nameInput.value = u.name.split(' ')[0]!.slice(0, MAX_NAME); // sugere o primeiro nome da conta
    renderUser();
    refresh();
  });

  googleBtn.onclick = () => {
    err.textContent = '';
    googleBtn.disabled = true;
    saveProfile({ name: nameInput.value.trim().slice(0, MAX_NAME), character: selected }); // o nome e o personagem voltam depois do Google
    void signInWithGoogle().then((msg) => {
      if (msg) { err.textContent = msg; googleBtn.disabled = false; }
    });
  };

  return new Promise((resolve) => {
    const submit = (): void => {
      const name = nameInput.value.trim();
      if (!name || !user) return; // só entra quem fez login e escolheu um nome
      void enterLandscape(); // tela cheia + paisagem (precisa ser dentro do toque)
      const profile: Profile = { name, character: selected };
      saveProfile(profile);
      root.remove();
      style.remove();
      resolve(profile);
    };
    goBtn.onclick = submit;
    nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  });
}
