import { ICON } from './icons';
import { CARS } from '../game/vehicle';
import { COLLIDERS, MAP, MAP_BASE, PARKS, placeName, ROADS } from '../game/map';
import { addLook, queueCrouch, queueLights, queueInteract, queueJump, queueReload, queueSwitch, queueWeaponPick, queueWeaponStep, setAim, setCrouchHeld, setFire, setHorn, setPedals, setSprint, setTouchVector, setWheelie } from '../game/input';

/** Dados do jogo que o HUD mostra (preenchidos pelo main a cada quadro). */
export interface HudState {
  name: string;
  x: number;
  z: number;
  yaw: number;
  driving: boolean;
  bike: boolean;
  /** dirigindo uma viatura (mostra o botão das luzes) */
  police: boolean;
  /** luzes/sirene ligadas (botão aceso) */
  lightsOn: boolean;
  kmh: number;
  remotes: { name: string; x: number; z: number }[];
  players: number;
  maxPlayers: number;
  health: number;
  armor: number;
  money: number;
  /** segundos de proteção restantes (0 = sem) */
  protect: number;
  /** chave da arma (HUD_KEY): ak, fist, bat, pistol, sign, cricket, baseball, bottle, pipe, cleaver, sickle, axe */
  weapon: string;
  weaponName: string;
  /** id da arma na mão e lista das que o jogador tem (para o menu de seleção do botão Arma) */
  weaponId: number;
  weaponList: { id: number; key: string; name: string }[];
  mag: number;
  reserve: number;
  reloading: boolean;
  aiming: boolean;
  crouching: boolean;
  dead: boolean;
  respawnIn: number;
  /** sobem a cada acerto dado / dano recebido (disparam a animação) */
  hitTick: number;
  hurtTick: number;
  /** há um carro livre por perto (mostra o botão de entrar) */
  nearCar: boolean;
  scores: { name: string; k: number; d: number; me: boolean }[];
}

export interface MobileHudOptions {
  /** botão do microfone (voz por proximidade) */
  onVoiceTalk: (on: boolean) => void;
  /** engrenagem: pausa o jogo e abre o menu */
  onPause: () => void;
  /** abre a garagem (chamar um dos veículos da conta) */
  onGarage: () => void;
  /** loja: abre o menu de pausa na aba Loja */
}

export type VoiceUi = 'off' | 'live' | 'muted' | 'denied';

export interface MobileHud {
  update(s: HudState, dt: number): void;
  addChat(text: string): void;
  /** estado do microfone: aceso quando está falando; número de pessoas ao alcance da voz */
  setVoice(state: VoiceUi, peers: number): void;
}

const CSS = `
.m-hud{position:fixed;inset:0;pointer-events:none;z-index:5;font-family:system-ui,Arial,sans-serif;font-weight:800;color:#fff;
  user-select:none;-webkit-user-select:none;touch-action:none;text-transform:uppercase}
.m-hud *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.m-look{position:fixed;inset:0;pointer-events:auto;touch-action:none}
.m-hud.desktop .m-look,.m-hud.desktop .m-stick,.m-hud.desktop .m-btn,.m-hud.desktop .m-wmenu,.m-hud.desktop .m-wback{display:none!important}
.m-keys{position:fixed;left:calc(var(--u)*1.6);bottom:calc(var(--u)*2);display:grid;grid-template-columns:auto auto auto auto;gap:calc(var(--u)*.4) calc(var(--u)*.9);align-items:center;
  padding:calc(var(--u)*1.2) calc(var(--u)*1.6);background:rgba(0,0,0,.5);border-radius:calc(var(--u)*1);font-size:calc(var(--u)*1.75);line-height:1.1;text-transform:none;font-weight:700;pointer-events:none;opacity:.92}
.m-keys kbd{font:800 calc(var(--u)*1.6)/1 system-ui,sans-serif;background:#e9ecef;color:#111;border-radius:calc(var(--u)*.5);padding:calc(var(--u)*.4) calc(var(--u)*.8);text-align:center;white-space:nowrap;box-shadow:0 calc(var(--u)*.25) 0 #6c757d}
.m-keys span{color:#f1f1f1;white-space:nowrap;margin-right:calc(var(--u)*1.2)}
.m-keys .free{grid-column:1/-1;color:#ffd84d;text-align:center;display:none}
.m-keys.unlocked .free{display:block}
.m-hud.driving .m-keys .foot-k,.m-hud:not(.driving) .m-keys .car-k{display:none}
.m-hud:not(.desktop) .m-keys,.m-keys.hidden{display:none}
.m-hud.driving .foot,.m-hud.driving .m-stick{display:none!important}
.m-steerL,.m-steerR{bottom:calc(var(--u)*10);width:calc(var(--u)*23.8);height:calc(var(--u)*23.8);}
.m-wheelie{left:calc(var(--u)*58);bottom:calc(var(--u)*10);width:calc(var(--u)*17);height:calc(var(--u)*17)}
.m-hud:not(.bike) .m-wheelie{display:none!important}
.m-steerL{left:calc(var(--u)*6)}
.m-steerR{left:calc(var(--u)*31.8)}
.m-hud:not(.driving) .car{display:none!important}
.m-out{text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 3px rgba(0,0,0,.6)}
.m-map{position:fixed;left:calc(var(--u)*1.6);top:calc(var(--u)*2.2);width:calc(var(--u)*21);height:calc(var(--u)*21);border-radius:50%;pointer-events:auto;touch-action:none;
  border:calc(var(--u)*.7) solid #fff;box-shadow:0 0 0 calc(var(--u)*.3) #000,0 0 calc(var(--u)*1.5) rgba(0,0,0,.6);overflow:hidden;background:#233}
.m-map canvas{width:100%;height:100%;display:block}
.m-bars{position:fixed;left:calc(var(--u)*24.5);top:calc(var(--u)*12.5);display:flex;flex-direction:column;gap:calc(var(--u)*1.2)}
.m-bar{display:flex;align-items:center;gap:calc(var(--u)*.8);height:calc(var(--u)*3.2)}
.m-bar i{display:block;width:calc(var(--u)*3.4);height:calc(var(--u)*3.4)}
.m-bar b{display:block;width:calc(var(--u)*25);height:calc(var(--u)*3);border:calc(var(--u)*.3) solid #000;background:rgba(0,0,0,.55);position:relative}
.m-bar b span{position:absolute;left:0;top:0;bottom:0;width:100%;transition:width .15s}
.m-hp span{background:#69b25a}.m-ar span{background:#3d7be0}
.m-fps{position:fixed;left:calc(var(--u)*24.5);top:calc(var(--u)*2.6);font:800 calc(var(--u)*3.4)/1 system-ui,sans-serif;color:#7CFC7C;text-shadow:0 0 calc(var(--u)*.5) #000,0 0 calc(var(--u)*.9) #000;pointer-events:none}
.m-place{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--u)*2.8);font-size:calc(var(--u)*3.8);letter-spacing:.03em;white-space:nowrap}
.m-money{position:fixed;right:calc(var(--u)*24.5);top:calc(var(--u)*2.2);font-size:calc(var(--u)*5);color:#d9d9d9}
.m-speed{position:fixed;right:calc(var(--u)*24.5);top:calc(var(--u)*9.5);width:calc(var(--u)*11);height:calc(var(--u)*2);border:calc(var(--u)*.3) solid #000;background:rgba(0,0,0,.5)}
.m-speed span{display:block;height:100%;background:#c0392b;width:0}
.m-weapon{pointer-events:auto;touch-action:none;position:fixed;right:calc(var(--u)*1.6);top:calc(var(--u)*2.2);width:calc(var(--u)*22);height:calc(var(--u)*13.5);background:rgba(47,107,47,.9);
  border:calc(var(--u)*.5) solid #000;border-radius:calc(var(--u)*1.2);display:flex;align-items:center;justify-content:center;padding:calc(var(--u)*.5)}
.m-weapon img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 calc(var(--u)*.4) rgba(0,0,0,.7))}
.m-ammo{position:fixed;right:calc(var(--u)*1.6);top:calc(var(--u)*16.2);width:calc(var(--u)*22);text-align:center;font-size:calc(var(--u)*3.6)}
.m-btn{position:fixed;pointer-events:auto;touch-action:none;border-radius:50%;background:rgba(31,84,34,.82);border:calc(var(--u)*.6) solid #0a140a;
  box-shadow:0 0 0 calc(var(--u)*.25) rgba(255,255,255,.55) inset;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;color:#fff;cursor:pointer}
.m-btn .ico{width:56%;height:56%;display:block}
.m-btn .lbl{font-size:calc(var(--u)*1.9);max-width:94%;line-height:1;margin-top:calc(var(--u)*-.2);text-align:center}
.m-btn.small .ico{width:44%;height:44%}
.m-btn:active,.m-btn.on{background:rgba(76,160,255,.85)}
.m-btn.spin .ico{animation:mspin .6s linear}
@keyframes mspin{to{transform:rotate(-360deg)}}
.m-reload{right:calc(var(--u)*13.6);top:calc(var(--u)*22.2);width:calc(var(--u)*12);height:calc(var(--u)*12)}
.m-crouch{right:calc(var(--u)*25.6);top:calc(var(--u)*22.2);width:calc(var(--u)*12);height:calc(var(--u)*12)}
.m-crouch.on{background:rgba(70,150,90,.85)}
.m-change{right:calc(var(--u)*1.6);top:calc(var(--u)*22.2);width:calc(var(--u)*12.5);height:calc(var(--u)*12.5)}
.m-wback{position:fixed;inset:0;pointer-events:auto;touch-action:none;z-index:7;display:none}
.m-wback.open,.m-wmenu.open{display:block}
.m-wmenu{position:fixed;right:calc(var(--u)*1.6);top:calc(var(--u)*36);width:calc(var(--u)*50);max-height:calc(var(--u)*60);overflow-y:auto;z-index:8;display:none;pointer-events:auto;
  background:rgba(14,22,16,.94);border:calc(var(--u)*.5) solid #000;border-radius:calc(var(--u)*1.4);padding:calc(var(--u)*1.2);touch-action:pan-y}
.m-wgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*1)}
.m-wopt{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.4);padding:calc(var(--u)*.8);border-radius:calc(var(--u)*1);background:rgba(47,107,47,.85);
  border:calc(var(--u)*.4) solid transparent;color:#fff;font:inherit;cursor:pointer;min-width:0}
.m-wopt.sel{border-color:#4cc2ff;background:rgba(37,90,125,.95)}
.m-wopt img,.m-wopt svg{width:100%;height:calc(var(--u)*6.5);object-fit:contain;fill:#fff}
.m-wopt span{font-size:calc(var(--u)*1.7);line-height:1.1;text-align:center;text-transform:none;font-weight:800}
.m-fire{right:calc(var(--u)*17.5);bottom:calc(var(--u)*24);width:calc(var(--u)*15.5);height:calc(var(--u)*15.5)}
.m-aim{right:calc(var(--u)*2.5);bottom:calc(var(--u)*29);width:calc(var(--u)*13.5);height:calc(var(--u)*13.5)}
.m-jump{right:calc(var(--u)*1.2);bottom:calc(var(--u)*9.5);width:calc(var(--u)*17);height:calc(var(--u)*17)}
/* a pé: entrar no carro fica à esquerda do Sprint (não o substitui) */
.m-door{right:calc(var(--u)*3.2);bottom:calc(var(--u)*43.5);width:calc(var(--u)*12);height:calc(var(--u)*12)}
/* o botão de entrar no carro só aparece perto de um carro */
.m-hud:not(.near-car):not(.driving) .m-door{display:none}
.m-hud.nogun .m-aim,.m-hud.nogun .m-reload{display:none!important}
/* dirigindo, o botão de sair fica acima do acelerar, um pouco afastado */
.m-hud.driving .m-door{right:calc(var(--u)*3.2);bottom:calc(var(--u)*33);width:calc(var(--u)*13);height:calc(var(--u)*13)}
/* Sprint à direita (o Escalar saiu: escala sozinho ao pular perto de um obstáculo) */
.m-sprint{right:calc(var(--u)*19.4);bottom:calc(var(--u)*8);width:calc(var(--u)*14);height:calc(var(--u)*14);font-size:calc(var(--u)*3.2)}
/* carro */
.m-gas{right:calc(var(--u)*1.2);bottom:calc(var(--u)*9.5);width:calc(var(--u)*17);height:calc(var(--u)*17)}
.m-brake{right:calc(var(--u)*19.4);bottom:calc(var(--u)*8);width:calc(var(--u)*14);height:calc(var(--u)*14)}
.m-hand{right:calc(var(--u)*34.6);bottom:calc(var(--u)*7);width:calc(var(--u)*12);height:calc(var(--u)*12)}
.m-lights{right:calc(var(--u)*34.6);bottom:calc(var(--u)*32);width:calc(var(--u)*11);height:calc(var(--u)*11)}
.m-hud:not(.police) .m-lights{display:none!important}
.m-lights.lit{background:rgba(40,90,220,.9);animation:micpulse 1s ease-in-out infinite}
.m-horn{right:calc(var(--u)*34.6);bottom:calc(var(--u)*20);width:calc(var(--u)*11);height:calc(var(--u)*11)}
.m-kmh{position:fixed;right:calc(var(--u)*17);top:calc(var(--u)*2.2);font-size:calc(var(--u)*6.5);color:#fff;text-align:right}
.m-kmh small{display:block;font-size:calc(var(--u)*2.6);color:#ccc}
.m-stick{position:fixed;left:calc(var(--u)*8);bottom:calc(var(--u)*9);width:calc(var(--u)*28);height:calc(var(--u)*28);border-radius:50%;pointer-events:auto;touch-action:none;
  background:rgba(31,84,34,.78);border:calc(var(--u)*.6) solid #0a140a;box-shadow:0 0 0 calc(var(--u)*.25) rgba(255,255,255,.55) inset}
.m-stick .a{position:absolute;width:0;height:0;border:calc(var(--u)*1.6) solid transparent;opacity:.55}
.m-stick .a.u{left:50%;top:calc(var(--u)*.6);transform:translateX(-50%);border-bottom-color:#fff;border-top-width:0}
.m-stick .a.d{left:50%;bottom:calc(var(--u)*.6);transform:translateX(-50%);border-top-color:#fff;border-bottom-width:0}
.m-stick .a.l{top:50%;left:calc(var(--u)*.6);transform:translateY(-50%);border-right-color:#fff;border-left-width:0}
.m-stick .a.r{top:50%;right:calc(var(--u)*.6);transform:translateY(-50%);border-left-color:#fff;border-right-width:0}
.m-knob{position:absolute;left:50%;top:50%;width:calc(var(--u)*11);height:calc(var(--u)*11);margin:calc(var(--u)*-5.5) 0 0 calc(var(--u)*-5.5);border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#f2f2f2,#bdbdbd);border:calc(var(--u)*.4) solid #222}
.m-chat{position:fixed;left:calc(var(--u)*1.6);top:calc(var(--u)*25);font-size:calc(var(--u)*3.3);line-height:1.22;max-width:calc(var(--u)*62);text-transform:none}
.m-chat p{margin:0}
.m-chat em,.m-score em{font-style:normal;color:#f1c40f}
.m-chatbtn{left:50%;transform:translateX(-50%);bottom:calc(var(--u)*1.5);width:calc(var(--u)*8);height:calc(var(--u)*8);font-size:calc(var(--u)*2.6)}
.m-protect{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--u)*19);padding:calc(var(--u)*.8) calc(var(--u)*2.4);border-radius:99px;background:rgba(40,120,200,.85);border:calc(var(--u)*.3) solid #fff;font-size:calc(var(--u)*3);display:none;white-space:nowrap}
.m-protect.on{display:block}
.m-gear{top:calc(var(--u)*9);width:calc(var(--u)*8.5);height:calc(var(--u)*8.5);left:calc(50% - var(--u)*4.25)}
.m-mic .ico{width:46%;height:46%}
.m-mic.talk{background:rgba(220,60,50,.88);animation:micpulse 1.2s ease-in-out infinite}
.m-mic.deaf{background:rgba(90,90,90,.85)}
@keyframes micpulse{50%{box-shadow:0 0 0 calc(var(--u)*1.2) rgba(255,90,80,.35)}}
.m-score{position:fixed;right:calc(var(--u)*1);bottom:calc(var(--u)*.8);text-align:right;font-size:calc(var(--u)*3.3);line-height:1.2}
.m-cross{position:fixed;left:50%;top:50%;width:calc(var(--u)*3);height:calc(var(--u)*3);margin:calc(var(--u)*-1.5) 0 0 calc(var(--u)*-1.5);border:2px solid rgba(255,255,255,.9);border-radius:50%;
  box-shadow:0 0 0 1px rgba(0,0,0,.6);transition:transform .12s;display:none}
.m-cross.show{display:block}.m-cross.aim{transform:scale(.6);border-color:#ff5a4a}
.m-hit{position:fixed;left:50%;top:44%;width:calc(var(--u)*6);height:calc(var(--u)*6);margin:calc(var(--u)*-3) 0 0 calc(var(--u)*-3);opacity:0;pointer-events:none}
.m-hit::before,.m-hit::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 3px #000}
.m-hit::before{transform:rotate(45deg)}.m-hit::after{transform:rotate(-45deg)}
.m-hit.go{animation:mhit .25s ease-out}
@keyframes mhit{from{opacity:1;transform:scale(1.4)}to{opacity:0;transform:scale(.8)}}
.m-hurt{position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(255,0,0,0) 35%,rgba(220,0,0,.55) 100%)}
.m-hurt.go{animation:mhurt .5s ease-out}
@keyframes mhurt{from{opacity:1}to{opacity:0}}
.m-dead{position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(80,0,0,.45);pointer-events:none;text-align:center}
.m-dead.show{display:flex}
.m-dead b{font-size:calc(var(--u)*11);color:#ff5a4a}.m-dead span{font-size:calc(var(--u)*4.5)}
.m-fullmap{position:fixed;inset:0;z-index:9;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;pointer-events:auto}
.m-fullmap.open{display:flex}
.m-fullmap canvas{width:calc(var(--u)*88);height:calc(var(--u)*88);border-radius:calc(var(--u)*2);border:calc(var(--u)*.6) solid #fff;background:#233}
.m-fullmap .x{position:fixed;right:calc(var(--u)*2);top:calc(var(--u)*2);width:calc(var(--u)*9);height:calc(var(--u)*9);font-size:calc(var(--u)*5)}
.m-fullmap .list{position:fixed;left:calc(var(--u)*2);top:calc(var(--u)*2);font-size:calc(var(--u)*3.2);line-height:1.35;text-align:left}
.m-fullmap .list em{font-style:normal;color:#f1c40f}
.m-fullmap .tip{position:fixed;left:0;right:0;bottom:calc(var(--u)*1.5);text-align:center;font-size:calc(var(--u)*3)}
`;

type El = HTMLElement;
function make(cls: string, parent: El, tag = 'div'): El {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** Botão que fica ativo enquanto o dedo está nele. Com `look`, arrastar o dedo sem soltar também gira a câmera. */
function holdButton(el: El, onDown: () => void, onUp?: () => void, look = false): void {
  let lastX = 0;
  let lastY = 0;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('on');
    lastX = e.clientX;
    lastY = e.clientY;
    // dirigindo: os botões fazem o celular vibrar ao tocar (só onde o navegador deixa; no iPhone não existe)
    if (el.parentElement?.classList.contains('driving')) { try { navigator.vibrate?.(14); } catch { /* sem vibração */ } }
    onDown();
  });
  if (look) {
    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      addLook(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });
  }
  const up = (): void => { el.classList.remove('on'); onUp?.(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function circle(parent: El, cls: string, icon: string | null, label: string | null): El {
  const b = make(`m-btn ${cls}`, parent);
  if (icon) make('ico', b).insertAdjacentHTML('beforeend', icon);
  if (label) make('lbl m-out', b).textContent = label;
  return b;
}

const COLORS = ['#4da3ff', '#f1c40f', '#c77dff', '#ff7a59'];

interface View {
  /** rotação da câmera (minimapa gira; mapa grande usa 0 = norte para cima) */
  yaw: number;
  cx: number;
  cz: number;
  /** metros do centro à borda */
  range: number;
  labels: boolean;
  circle: boolean;
}

/** Desenha o mapa (minimapa e mapa grande usam a mesma função). */
function drawMap(canvas: HTMLCanvasElement, cssSize: number, s: HudState, v: View, dpr: number): void {
  const g = canvas.getContext('2d')!;
  const size = Math.round(cssSize * dpr);
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const R = size / 2;
  const k = R / v.range;
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const rx = -Math.cos(v.yaw);
  const rz = Math.sin(v.yaw);
  const proj = (x: number, z: number): [number, number] => {
    const dx = x - v.cx;
    const dz = z - v.cz;
    return [R + (dx * rx + dz * rz) * k, R - (dx * fx + dz * fz) * k];
  };
  const poly = (pts: [number, number][], fill: string | null, stroke?: string, w = 1): void => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = w; g.stroke(); }
  };
  g.clearRect(0, 0, size, size);
  g.save();
  if (v.circle) { g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip(); }
  g.fillStyle = '#1d2a1d';
  g.fillRect(0, 0, size, size);
  const rect = (r: { x0: number; x1: number; z0: number; z1: number }, fill: string, stroke?: string): void =>
    poly([proj(r.x0, r.z0), proj(r.x1, r.z0), proj(r.x1, r.z1), proj(r.x0, r.z1)], fill, stroke, 3 * dpr);
  rect({ x0: -MAP.halfX, x1: MAP.halfX, z0: -MAP.halfZ, z1: MAP.halfZ }, MAP_BASE, '#e8e8e8');
  for (const r of PARKS) rect(r, '#5d9a52');
  for (const r of ROADS) rect(r, '#44484e');
  for (const b of COLLIDERS) {
    if (b.maxX - b.minX < 1) continue; // troncos de árvore
    if ((b.bottom ?? 0) > 0 && b.top - (b.bottom ?? 0) < 20) rect({ x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ }, 'rgba(200,60,50,.85)');
    else rect({ x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ }, b.color ?? '#8a6f4d');
  }
  for (const c of CARS) {
    const sx = Math.sin(c.heading);
    const cz = Math.cos(c.heading);
    const corner = (a: number, f: number): [number, number] => proj(c.x + -cz * a + sx * f, c.z + sx * a + cz * f);
    poly([corner(-0.9, -2), corner(0.9, -2), corner(0.9, 2), corner(-0.9, 2)], c.driver ? '#ffffff' : '#e8c34a', '#000', dpr);
  }
  g.font = `bold ${Math.round(R * (v.labels ? 0.06 : 0.2))}px system-ui,sans-serif`;
  g.textAlign = 'center';
  g.lineWidth = 3 * dpr;
  s.remotes.forEach((p, i) => {
    const [x, y] = proj(p.x, p.z);
    g.fillStyle = COLORS[i % 4]!;
    g.beginPath();
    g.moveTo(x, y + 6 * dpr);
    g.lineTo(x - 5 * dpr, y - 5 * dpr);
    g.lineTo(x + 5 * dpr, y - 5 * dpr);
    g.closePath();
    g.fill();
    const label = v.labels ? p.name : `P${i + 2}`;
    g.strokeStyle = '#000';
    g.strokeText(label, x, y - 8 * dpr);
    g.fillStyle = '#fff';
    g.fillText(label, x, y - 8 * dpr);
  });
  // Eu: seta branca apontando para onde olho
  const [mx, my] = proj(s.x, s.z);
  const ang = v.circle ? 0 : -s.yaw;
  g.save();
  g.translate(mx, my);
  g.rotate(ang);
  g.fillStyle = '#fff';
  g.strokeStyle = '#000';
  g.lineWidth = 2 * dpr;
  g.beginPath();
  g.moveTo(0, -9 * dpr);
  g.lineTo(6 * dpr, 7 * dpr);
  g.lineTo(0, 3 * dpr);
  g.lineTo(-6 * dpr, 7 * dpr);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  if (v.circle) {
    // Norte (+Z do mundo)
    const nx = R + rz * (R - 11 * dpr);
    const ny = R - fz * (R - 11 * dpr);
    g.font = `bold ${Math.round(R * 0.2)}px system-ui,sans-serif`;
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 4 * dpr;
    g.strokeText('N', nx, ny + 5 * dpr);
    g.fillText('N', nx, ny + 5 * dpr);
  }
  g.restore();
}

/** HUD (paisagem): minimapa, barras, arma, botões, chat e placar. No carro vira acelerador/freio/freio de mão. */
export function createMobileHud(opts: MobileHudOptions): MobileHud {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const hud = make('m-hud' + (touch ? '' : ' desktop'), document.body);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Efeitos de tela
  const hurt = make('m-hurt', hud);
  const cross = make('m-cross', hud);
  const hitMark = make('m-hit', hud);
  const dead = make('m-dead m-out', hud);
  make('', dead, 'b').textContent = 'Você morreu';
  const deadSub = make('', dead, 'span');

  // Arrastar a tela gira a câmera (celular)
  const look = make('m-look', hud);
  const last = new Map<number, { x: number; y: number }>();
  look.addEventListener('pointerdown', (e) => { look.setPointerCapture(e.pointerId); last.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  look.addEventListener('pointermove', (e) => {
    const p0 = last.get(e.pointerId);
    if (!p0) return;
    addLook(e.clientX - p0.x, e.clientY - p0.y);
    last.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const endLook = (e: PointerEvent): void => { last.delete(e.pointerId); };
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  // Minimapa (toque = abre o mapa grande)
  const mapBox = make('m-map', hud);
  const canvas = make('', mapBox, 'canvas') as HTMLCanvasElement;
  const full = make('m-fullmap', hud);
  const fullCanvas = make('', full, 'canvas') as HTMLCanvasElement;
  const fullClose = circle(full, 'x', null, '✕');
  make('tip m-out', full).textContent = 'Toque para fechar';
  const list = make('list m-out', full);
  let mapOpen = false;
  const setMap = (open: boolean): void => { mapOpen = open; full.classList.toggle('open', open); };
  mapBox.addEventListener('pointerdown', (e) => { e.preventDefault(); setMap(true); });
  full.addEventListener('pointerdown', () => setMap(false));
  fullClose.addEventListener('pointerdown', () => setMap(false));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyM') setMap(!mapOpen);
    if (e.code === 'Escape') setMap(false);
  });

  // Vida e colete
  const bars = make('m-bars', hud);
  const hp = make('m-bar m-hp', bars);
  make('', hp, 'i').insertAdjacentHTML('beforeend', ICON.plus);
  const hpFill = make('', make('', hp, 'b'), 'span');
  const ar = make('m-bar m-ar', bars);
  make('', ar, 'i').insertAdjacentHTML('beforeend', ICON.shield);
  const arFill = make('', make('', ar, 'b'), 'span');

  // Nome do lugar onde estou (topo, ao lado do botão Animações)
  const place = make('m-place m-out', hud);
  const fpsEl = make('m-fps', hud);
  let fpsFrames = 0;
  let fpsT = performance.now();

  // PC: legenda das teclas (a pé e dirigindo) no lugar dos botões de toque
  const keys = make('m-keys', hud);
  const KEYS_FOOT: [string, string][] = [
    ['W A S D', 'Mover'], ['Shift / Q', 'Correr'], ['Espaço', 'Pular'], ['E', 'Escalar'], ['Z / Ctrl', 'Agachar'], ['F', 'Entrar no carro'],
    ['Clique', 'Atirar / bater'], ['Botão direito', 'Mirar'], ['R', 'Recarregar'], ['Scroll', 'Trocar de arma'], ['B', 'Loja'], ['C', 'Veículos'],
    ['T', 'Falar (segure)'], ['M', 'Mapa'], ['L', 'Esconder esta legenda'], ['P', 'Menu / configurações'],
  ];
  const KEYS_CAR: [string, string][] = [
    ['W / S', 'Acelerar / freio'], ['A / D', 'Virar'], ['Espaço', 'Freio de mão'], ['H', 'Buzina'], ['Shift / V', 'Empinar (moto)'], ['L', 'Luzes da viatura'],
    ['F', 'Sair do veículo'], ['C', 'Veículos'], ['B', 'Loja'], ['M', 'Mapa'], ['P', 'Menu'],
  ];
  for (const [list, cls] of [[KEYS_FOOT, 'foot-k'], [KEYS_CAR, 'car-k']] as const) {
    for (const [k, t] of list) {
      const key = make(cls, keys, 'kbd');
      key.textContent = k;
      make(cls, keys, 'span').textContent = t;
    }
  }
  const esc = make('', keys, 'kbd');
  esc.textContent = 'Esc';
  make('', keys, 'span').textContent = 'Mostrar o mouse';
  make('free', keys).textContent = 'Mouse livre: clique no jogo para voltar';
  // L mostra/esconde a legenda das teclas (dirigindo, L continua sendo as luzes da viatura)
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.repeat || e.code !== 'KeyL' || hud.classList.contains('driving')) return;
    keys.classList.toggle('hidden', !keys.classList.contains('hidden'));
  });
  const syncLock = (): void => { keys.classList.toggle('unlocked', !document.pointerLockElement); };
  document.addEventListener('pointerlockchange', syncLock);
  syncLock();

  // Dinheiro, velocidade, arma e munição (a pé) / velocímetro (no carro)
  const money = make('m-money m-out foot', hud);
  const speedBar = make('m-speed foot', hud);
  const speedFill = make('', speedBar, 'span');
  const weaponBox = make('m-weapon foot', hud);
  const ammo = make('m-ammo m-out foot', hud);
  const kmh = make('m-kmh m-out car', hud);
  const protectEl = make('m-protect m-out', hud);

  holdButton(circle(hud, 'm-reload foot', ICON.reload, 'Recarga'), queueReload);
  // Botão Arma: arrastar para cima = próxima arma, para baixo = anterior; tocar abre o menu de seleção (com mais de 3 armas) ou passa para a próxima
  const wback = make('m-wback', hud);
  const wmenu = make('m-wmenu', hud);
  let weaponList: HudState['weaponList'] = [];
  let weaponId = -1;
  let wsig = '';
  const closeWeaponMenu = (): void => { wback.classList.remove('open'); wmenu.classList.remove('open'); };
  const renderWeaponMenu = (): void => {
    wmenu.textContent = '';
    const grid = make('m-wgrid', wmenu);
    for (const w of weaponList) {
      const b = make(`m-wopt${w.id === weaponId ? ' sel' : ''}`, grid, 'button');
      if (w.key === 'fist') b.insertAdjacentHTML('beforeend', ICON.fist);
      else b.insertAdjacentHTML('beforeend', `<img src="/hud/w-${w.key}.png" alt="" draggable="false">`);
      make('', b, 'span').textContent = w.name;
      b.onclick = () => { queueWeaponPick(w.id); closeWeaponMenu(); };
    }
    wmenu.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  wback.addEventListener('pointerdown', (e) => { e.preventDefault(); closeWeaponMenu(); });
  // A janela da arma no HUD é o botão de trocar de arma: tocar abre o menu (mais de 3 armas) ou passa para a próxima; arrastar para cima/baixo passa para a próxima/anterior
  const changeBtn = weaponBox;
  {
    let y0 = 0;
    let dragged = false;
    changeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      changeBtn.setPointerCapture(e.pointerId);
      changeBtn.classList.add('on');
      y0 = e.clientY;
      dragged = false;
    });
    changeBtn.addEventListener('pointermove', (e) => {
      if (!changeBtn.hasPointerCapture(e.pointerId)) return;
      const step = Math.max(22, changeBtn.getBoundingClientRect().height * 0.4);
      const dy = e.clientY - y0;
      if (Math.abs(dy) < step) return;
      dragged = true; // arrastou: troca e recomeça a medir (arrastar mais continua passando)
      queueWeaponStep(dy < 0 ? 1 : -1);
      y0 = e.clientY;
    });
    const end = (tap: boolean): void => {
      changeBtn.classList.remove('on');
      if (!tap || dragged) return;
      if (weaponList.length > 3) {
        const open = !wmenu.classList.contains('open');
        if (open) { renderWeaponMenu(); wback.classList.add('open'); wmenu.classList.add('open'); } else closeWeaponMenu();
      } else queueSwitch();
    };
    changeBtn.addEventListener('pointerup', () => end(true));
    changeBtn.addEventListener('pointercancel', () => end(false));
  }
  // O botão que era de trocar de arma agora chama os veículos da conta (abre a garagem)
  holdButton(circle(hud, 'm-change foot', ICON.car, 'Veículo'), opts.onGarage);
  const crouchBtn = circle(hud, 'm-crouch foot', ICON.crouch, 'Agachar');
  holdButton(crouchBtn, () => { queueCrouch(); setCrouchHeld(true); }, () => setCrouchHeld(false));

  // Ações da direita (a pé)
  holdButton(circle(hud, 'm-fire foot', ICON.bullet, null), () => setFire(true), () => setFire(false), true);
  let aimOn = false;
  const aim = circle(hud, 'm-aim foot', ICON.crosshair, null);
  aim.addEventListener('pointerdown', (e) => { e.preventDefault(); aimOn = !aimOn; setAim(aimOn); aim.classList.toggle('on', aimOn); });
  holdButton(circle(hud, 'm-jump foot', ICON.run, null), queueJump, undefined, true);
  holdButton(circle(hud, 'm-door', ICON.door, null), queueInteract);
  holdButton(circle(hud, 'm-sprint small foot', null, 'Sprint'), () => setSprint(true), () => setSprint(false), true);

  // No carro: acelerador, freio e freio de mão
  let gas = false;
  let brake = false;
  let hand = false;
  const pedals = (): void => setPedals(gas, brake, hand);
  holdButton(circle(hud, 'm-gas car', ICON.gas, null), () => { gas = true; pedals(); }, () => { gas = false; pedals(); });
  holdButton(circle(hud, 'm-brake car', ICON.brake, null), () => { brake = true; pedals(); }, () => { brake = false; pedals(); });
  holdButton(circle(hud, 'm-hand car', ICON.handbrake, null), () => { hand = true; pedals(); }, () => { hand = false; pedals(); });
  holdButton(circle(hud, 'm-horn car', ICON.horn, null), () => setHorn(true), () => setHorn(false)); // buzina
  const lightsBtn = circle(hud, 'm-lights car', ICON.siren, null); // luzes da viatura (liga/desliga)
  holdButton(lightsBtn, queueLights);

  // No carro: dois botões para virar para os lados (no lugar do joystick)
  holdButton(circle(hud, 'm-wheelie car', ICON.up, null), () => setWheelie(true), () => setWheelie(false));
  let steer = 0;
  const applySteer = (): void => setTouchVector(steer, 0, steer !== 0);
  holdButton(circle(hud, 'm-steerL car', ICON.left, null), () => { steer = -1; applySteer(); }, () => { steer = steer === -1 ? 0 : steer; applySteer(); });
  holdButton(circle(hud, 'm-steerR car', ICON.right, null), () => { steer = 1; applySteer(); }, () => { steer = steer === 1 ? 0 : steer; applySteer(); });



  // Joystick (a pé: anda; no carro: só esterça)
  const stick = make('m-stick', hud);
  for (const c of ['u', 'd', 'l', 'r']) make(`a ${c}`, stick);
  const knob = make('m-knob', stick);
  let active: number | null = null;
  const move = (e: PointerEvent): void => {
    const r = stick.getBoundingClientRect();
    const radius = r.width * 0.36;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    setTouchVector(dx / radius, -dy / radius, true);
  };
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); active = e.pointerId; stick.setPointerCapture(e.pointerId); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === active) move(e); });
  const release = (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    active = null;
    knob.style.transform = '';
    setTouchVector(0, 0, false);
  };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  // Chat e placar
  const chat = make('m-chat m-out', hud);
  const score = make('m-score m-out', hud);
  // Engrenagem (pausa; a loja é uma aba do menu)
  holdButton(circle(hud, 'm-gear small', ICON.gear, null), opts.onPause);

  // Voz por proximidade: o botão liga o microfone (1º toque) e depois alterna falar/mudo; T faz o mesmo no PC
  const micBtn = circle(hud, 'm-chatbtn m-mic small', ICON.mic, 'Voz');
  const micLbl = micBtn.querySelector('.lbl') as HTMLElement | null;
  // aperte para falar (push to talk): só transmite enquanto o botão ou a tecla T está apertado
  let talking = false;
  const talk = (on: boolean): void => { if (on === talking) return; talking = on; opts.onVoiceTalk(on); };
  micBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { micBtn.setPointerCapture(e.pointerId); } catch { /* sem captura */ } talk(true); });
  micBtn.addEventListener('pointerup', () => talk(false));
  micBtn.addEventListener('pointercancel', () => talk(false));
  micBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); talk(true); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyT') talk(false); });
  window.addEventListener('blur', () => talk(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) talk(false); });
  const setVoice = (state: VoiceUi, peers: number): void => {
    micBtn.classList.toggle('talk', state === 'live');
    micBtn.classList.toggle('deaf', state === 'denied');
    const ico = micBtn.querySelector('.ico');
    if (ico) { ico.textContent = ''; ico.insertAdjacentHTML('beforeend', state === 'denied' ? ICON.micOff : ICON.mic); }
    if (micLbl) micLbl.textContent = state === 'live' ? (peers > 0 ? `Falando ${peers}` : 'Falando') : state === 'denied' ? 'Sem mic' : 'Segure';
  };

  const addChat = (text: string): void => {
    const p = document.createElement('p');
    const idx = text.indexOf(':');
    if (idx > 0) {
      const em = document.createElement('em');
      em.textContent = text.slice(0, idx + 1);
      p.append(em, document.createTextNode(text.slice(idx + 1)));
    } else p.textContent = text;
    chat.appendChild(p);
    while (chat.childElementCount > 5) chat.firstElementChild?.remove();
    window.setTimeout(() => p.remove(), 14000);
  };

  let prev: { x: number; z: number } | null = null;
  let speed = 0;
  let lastHit = 0;
  let lastHurt = 0;
  const cache = { l1: '', score: '', list: '', money: '', ammo: '', weapon: '' };
  const retrigger = (el: El): void => { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); };

  return {
    addChat,
    setVoice,
    update(s, dt): void {
      // contador de quadros por segundo (conta no relógio real, não no dt do jogo, que é limitado a 50 ms)
      fpsFrames++;
      const nowMs = performance.now();
      if (nowMs - fpsT >= 500) {
        const fps = Math.round((fpsFrames * 1000) / (nowMs - fpsT));
        fpsFrames = 0;
        fpsT = nowMs;
        fpsEl.textContent = `${fps} FPS`;
        fpsEl.style.color = fps >= 50 ? '#7CFC7C' : fps >= 30 ? '#ffd84d' : '#ff6b5e';
      }
      hud.classList.toggle('driving', s.driving);
      hud.classList.toggle('bike', s.driving && s.bike);
      hud.classList.toggle('police', s.driving && s.police);
      lightsBtn.classList.toggle('lit', s.lightsOn);
      if (!s.driving && steer !== 0) { steer = 0; applySteer(); } // saiu do carro com o dedo no botão
      hud.classList.toggle('near-car', s.nearCar);
      if (prev && dt > 0) {
        const inst = Math.hypot(s.x - prev.x, s.z - prev.z) / dt;
        speed += (inst - speed) * Math.min(1, dt * 6);
      }
      prev = { x: s.x, z: s.z };
      speedFill.style.width = `${Math.min(100, (speed / 7.5) * 100).toFixed(0)}%`;
      kmh.textContent = '';
      kmh.append(document.createTextNode(String(Math.round(s.kmh))), Object.assign(document.createElement('small'), { textContent: 'km/h' }));

      const prot = Math.ceil(s.protect);
      protectEl.classList.toggle('on', prot > 0 && !s.dead);
      if (prot > 0) protectEl.textContent = `Protegido: ${prot} s — sem armas e sem dano`;
      hpFill.style.width = `${Math.max(0, s.health)}%`;
      arFill.style.width = `${Math.max(0, s.armor)}%`;
      const mny = `$${s.money.toLocaleString('en-US')}`;
      if (mny !== cache.money) { cache.money = mny; money.textContent = mny; }
      weaponList = s.weaponList;
      weaponId = s.weaponId;
      const sig = `${s.weaponId}|${s.weaponList.map((w) => w.id).join(',')}`;
      if (sig !== wsig) { wsig = sig; if (wmenu.classList.contains('open')) { if (weaponList.length > 3) renderWeaponMenu(); else closeWeaponMenu(); } }
      if (s.weapon !== cache.weapon) {
        cache.weapon = s.weapon;
        weaponBox.textContent = '';
        // imagens das armas renderizadas dos próprios modelos (public/hud, geradas por dev/weapon-icons.html); o punho continua um ícone
        if (s.weapon === 'fist') weaponBox.insertAdjacentHTML('beforeend', ICON.fist);
        else weaponBox.insertAdjacentHTML('beforeend', `<img src="/hud/w-${s.weapon}.png" alt="${s.weaponName}" draggable="false">`);
      }
      const gun = ['ak', 'pistol', 'm4', 'm16', 'hb'].includes(s.weapon);
      const am = !gun ? '--' : s.reloading ? '...' : `${s.mag}/${s.reserve}`;
      if (am !== cache.ammo) { cache.ammo = am; ammo.textContent = am; }

      hud.classList.toggle('nogun', !gun); // sem arma de fogo: nada de mirar nem recarregar
      if (!gun && aimOn) { aimOn = false; setAim(false); aim.classList.remove('on'); }
      cross.classList.toggle('show', gun && !s.driving && !s.dead);
      cross.classList.toggle('aim', s.aiming);
      crouchBtn.classList.toggle('on', s.crouching);
      if (s.hitTick !== lastHit) { lastHit = s.hitTick; retrigger(hitMark); }
      if (s.hurtTick !== lastHurt) { lastHurt = s.hurtTick; retrigger(hurt); }
      dead.classList.toggle('show', s.dead);
      if (s.dead) deadSub.textContent = `Renasce em ${Math.max(0, Math.ceil(s.respawnIn))}s`;

      const pn = placeName(s.x, s.z);
      if (pn !== cache.l1) { cache.l1 = pn; place.textContent = pn; }
      // Canto inferior direito: só uma linha, com o nome e a equipe
      const sc = s.name;
      if (sc !== cache.score) {
        cache.score = sc;
        score.textContent = '';
        const em = document.createElement('em');
        em.textContent = `${s.name}:`;
        score.append(em, document.createTextNode(' EQUIPE LIVRE'));
      }
      // O placar de kills e mortes fica no mapa grande
      if (mapOpen) {
        const key = s.scores.map((r) => `${r.name}|${r.k}|${r.d}`).join(';');
        if (key !== cache.list) {
          cache.list = key;
          list.textContent = '';
          s.scores.forEach((r, i) => {
            const div = document.createElement('div');
            const em = document.createElement('em');
            em.textContent = `P${i + 1}:`;
            div.append(em, document.createTextNode(` ${r.name}  ${r.k} Kills/${r.d} Deaths`));
            list.appendChild(div);
          });
        }
      }
      drawMap(canvas, mapBox.clientWidth, s, { yaw: s.yaw, cx: s.x, cz: s.z, range: 32, labels: false, circle: true }, dpr);
      if (mapOpen) drawMap(fullCanvas, fullCanvas.clientWidth, s, { yaw: 0, cx: 0, cz: 0, range: Math.max(MAP.halfX, MAP.halfZ) * 1.06, labels: true, circle: false }, dpr);
    },
  };
}
