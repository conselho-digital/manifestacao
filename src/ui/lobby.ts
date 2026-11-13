import { enterLandscape } from './orientation';
import { CHARACTERS, labelOf, type CharacterName } from '../game/characters';
import { authAvailable, currentUser, renderGoogleButton, signOut, type AuthUser } from '../net/auth';
import { createCharacterPicker, createTeamPicker, el, faceUrl, PICKER_CSS } from './pickers';
import { MAP_ID, MAPS, saveMapChoice } from '../game/map';
import { getTeams, loadTeams, savedTeamId, saveTeamId, validTeamId } from '../game/teams';

export interface Profile {
  name: string;
  character: CharacterName;
  /** id da equipe escolhida (sempre uma equipe; '' só se não houver nenhuma) */
  team: string;
  /** id da conta Google que entrou */
  userId: string;
}

const STORAGE_KEY = 'arena-profile';
const MAX_NAME = 16;
const DEFAULT_CHARACTER: CharacterName = 'Carlos';

function loadSaved(): { name: string; character: CharacterName } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { name?: string; character?: string };
    const character = CHARACTERS.includes(raw.character as CharacterName) ? (raw.character as CharacterName) : DEFAULT_CHARACTER;
    return { name: (raw.name ?? '').slice(0, MAX_NAME), character };
  } catch {
    return { name: '', character: DEFAULT_CHARACTER };
  }
}

const saveProfile = (p: { name: string; character: CharacterName }): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* sem armazenamento */ }
};

const CSS = `
.lobby{position:fixed;inset:0;z-index:10;font-family:system-ui,sans-serif;color:#fff;box-sizing:border-box;
  background:linear-gradient(rgba(10,16,28,.55),rgba(10,16,28,.15) 40%,rgba(10,16,28,.6));overflow:hidden}
.lobby *{box-sizing:border-box}
.lobby button{font-family:inherit;cursor:pointer}
.lb-maps{display:flex;gap:8px}.lb-map{flex:1;display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:left;cursor:pointer;font:inherit}
.lb-map b{font-size:15px}.lb-map small{opacity:.7;font-size:11px}.lb-map.on{border-color:#4cc2ff;background:rgba(76,194,255,.18)}
.lb-home,.lb-select{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px}
/* tela larga: cartão à esquerda, a cidade aparece à direita */
@media (min-aspect-ratio:13/10){.lb-home{align-items:flex-start;padding-left:max(24px,7vw)}}
.lb-select{display:none;justify-content:flex-start;background:rgba(14,20,32,.9);backdrop-filter:blur(6px);padding:0}
.lobby.picking .lb-home{display:none}
.lobby.picking .lb-select{display:flex}
.lb-title{margin:0 0 14px;font-size:clamp(26px,5vw,40px);letter-spacing:.04em;text-shadow:0 3px 14px rgba(0,0,0,.7)}
.lb-card{width:min(380px,100%);max-height:calc(100% - 60px);overflow:auto;background:rgba(27,33,48,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;
  display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.lb-face{width:min(180px,36vh);aspect-ratio:1;border-radius:16px;border:3px solid #4cc2ff;padding:0;overflow:hidden;background:#41506b;position:relative;color:#fff}
.lb-face img{width:100%;height:100%;object-fit:cover;display:block}
.lb-face span{position:absolute;left:0;right:0;bottom:0;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,.75));font-size:15px;font-weight:700;color:#fff}
.lb-facecol{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.lb-hint{font-size:12px;opacity:.65;margin:0;text-align:center}
.lb-card label{align-self:flex-start;font-size:13px;opacity:.8;margin-bottom:-6px}
.lb-card input{width:100%;padding:12px;font-size:16px;border-radius:10px;border:2px solid #3b4358;background:#141926;color:#fff}
.lb-btn{width:100%;padding:13px;font-size:17px;font-weight:700;border:0;border-radius:11px;background:#4cc2ff;color:#10202e}
.lb-btn:disabled{opacity:.4;cursor:default}
.lb-login{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.lb-gslot{min-height:44px;display:flex;justify-content:center;width:100%;color-scheme:light}
.lb-who{font-size:12px;opacity:.8;text-align:center;line-height:1.4}
.lb-who button{background:none;border:0;color:#7fd0ff;text-decoration:underline;font-size:12px;padding:0 2px}
.lb-err{font-size:12px;color:#ff9b8f;text-align:center;min-height:0}
.lb-bar{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:rgba(10,14,22,.8);border-bottom:1px solid rgba(255,255,255,.1)}
.lb-bar h2{margin:0;font-size:18px;flex:1}
.lb-bar .mini{width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #4cc2ff}
.lb-bar button{padding:10px 16px;font-size:15px;font-weight:700;border:0;border-radius:10px;background:#4cc2ff;color:#10202e}
.lb-cats{flex:1;overflow:auto;width:100%}
@media (max-height:520px){.lb-title{font-size:20px;margin:0 0 6px}.lb-card{flex-direction:row;flex-wrap:wrap;align-items:center;width:min(640px,100%);padding:12px;gap:12px}.lb-facecol{width:auto;flex:0 0 auto}.lb-face{width:min(34vh,130px)}.lb-card input,.lb-btn{padding:9px;font-size:15px}.lb-form{flex:1;min-width:260px;width:auto!important;gap:8px!important}}
`;

/**
 * Tela inicial: a cidade vista de cima ao fundo (o main desenha), foto do rosto do personagem, nome, equipe e login Google.
 * O personagem é escolhido numa tela própria, em carrosséis por categoria. Resolve quando o jogador entra no jogo.
 */
export function showLobby(): Promise<Profile> {
  const saved = loadSaved();
  let selected: CharacterName = saved.character;
  let teamId = validTeamId(savedTeamId());
  let user: AuthUser | null = null;

  const style = el('style');
  style.textContent = CSS + PICKER_CSS;
  document.head.appendChild(style);

  // ----- tela inicial -----
  const faceImg = el('img');
  faceImg.alt = '';
  faceImg.draggable = false;
  const faceName = el('span');
  const faceBtn = el('button', 'lb-face', faceImg, faceName);
  faceBtn.type = 'button';
  const nameInput = el('input');
  nameInput.id = 'lobby-name';
  nameInput.autocomplete = 'off';
  nameInput.placeholder = 'Digite seu nome';
  nameInput.maxLength = MAX_NAME;
  nameInput.value = saved.name;
  const nameLabel = el('label', '', 'Seu nome');
  nameLabel.htmlFor = 'lobby-name';
  const teamLabel = el('label', '', 'Sua equipe');
  const teamPicker = createTeamPicker(getTeams(), teamId, (id) => { teamId = id; saveTeamId(id); });
  // mapa: trocar recarrega a página (o mapa é montado ao abrir o jogo); o nome e o personagem ficam salvos
  const mapLabel = el('label', '', 'Mapa');
  const mapRow = el('div', 'lb-maps');
  for (const m of MAPS) {
    const b = el('button', `lb-map${m.id === MAP_ID ? ' on' : ''}`, el('b', '', m.name), el('small', '', m.desc));
    b.type = 'button';
    b.onclick = () => {
      if (m.id === MAP_ID) return;
      saveProfile({ name: nameInput.value.trim().slice(0, MAX_NAME), character: selected });
      saveMapChoice(m.id);
      const u = new URL(location.href);
      u.searchParams.set('mapa', m.id);
      location.href = u.toString();
    };
    mapRow.appendChild(b);
  }
  const who = el('div', 'lb-who');
  const err = el('div', 'lb-err');
  // botão oficial do Google (o popup mostra o endereço do site); não há outro método de login
  const googleSlot = el('div', 'lb-gslot');
  const login = el('div', 'lb-login', googleSlot);
  const goBtn = el('button', 'lb-btn lobby-go', 'Entrar no jogo');
  goBtn.type = 'button';
  const form = el('div', 'lb-form', nameLabel, nameInput, teamLabel, teamPicker.root, mapLabel, mapRow, who, login, goBtn, err);
  form.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:10px';
  const card = el('div', 'lb-card', el('div', 'lb-facecol', faceBtn, el('p', 'lb-hint', 'Toque na foto para escolher o personagem')), form);
  const home = el('div', 'lb-home', el('h1', 'lb-title', 'Arena Online 3D'), card);

  // ----- tela de seleção: um carrossel por categoria -----
  const miniFace = el('img', 'mini');
  miniFace.alt = '';
  const miniName = el('h2');
  const okBtn = el('button', '', 'Confirmar');
  okBtn.type = 'button';
  const bar = el('div', 'lb-bar', miniFace, miniName, okBtn);
  const picker = createCharacterPicker(selected, (n) => { selected = n; refresh(); });
  const select = el('div', 'lb-select', bar, el('div', 'lb-cats', picker.root));

  const root = el('div', 'lobby', home, select);
  document.body.appendChild(root);

  function refresh(): void {
    faceImg.src = faceUrl(selected);
    faceName.textContent = labelOf(selected);
    miniFace.src = faceUrl(selected);
    miniName.textContent = labelOf(selected);
    picker.set(selected);
    const hasName = nameInput.value.trim().length > 0;
    login.style.display = user ? 'none' : '';
    goBtn.style.display = user ? '' : 'none';
    goBtn.disabled = !hasName;
    saveProfile({ name: nameInput.value.trim().slice(0, MAX_NAME), character: selected });
  }

  function renderUser(): void {
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

  faceBtn.onclick = () => { root.classList.add('picking'); picker.reveal(); };
  okBtn.onclick = () => root.classList.remove('picking');
  nameInput.addEventListener('input', refresh);
  refresh();
  renderUser();

  // equipes do servidor (as 4 padrão aparecem até chegar)
  void loadTeams().then((t) => {
    teamPicker.setTeams(t);
    teamId = validTeamId(teamId);
    teamPicker.set(teamId);
  });

  void currentUser().then((u) => {
    user = u;
    if (u && !nameInput.value.trim() && u.name) nameInput.value = u.name.split(' ')[0]!.slice(0, MAX_NAME); // sugere o primeiro nome da conta
    renderUser();
    refresh();
  });

  // botão do Google: aparece assim que o script carrega
  const onGoogle = (u: AuthUser | null, msg?: string): void => {
    if (msg) { err.textContent = msg; return; }
    user = u;
    err.textContent = '';
    if (u && !nameInput.value.trim() && u.name) nameInput.value = u.name.split(' ')[0]!.slice(0, MAX_NAME);
    renderUser();
    refresh();
  };
  if (authAvailable()) {
    void renderGoogleButton(googleSlot, form.clientWidth || 300, onGoogle).then((ok) => {
      if (!ok) err.textContent = 'Não foi possível carregar o login do Google. Desative bloqueadores de anúncios e recarregue a página.';
    });
  }

  return new Promise((resolve) => {
    const submit = (): void => {
      const name = nameInput.value.trim();
      if (!name || !user) return; // só entra quem fez login e escolheu um nome
      void enterLandscape(); // tela cheia + paisagem (precisa ser dentro do toque)
      const profile: Profile = { name, character: selected, team: teamId, userId: user.id };
      saveProfile({ name, character: selected });
      saveTeamId(teamId);
      root.remove();
      style.remove();
      resolve(profile);
    };
    goBtn.onclick = submit;
    nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  });
}
