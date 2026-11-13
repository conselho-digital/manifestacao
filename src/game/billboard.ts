// Outdoor da calçada em frente ao parque: um telão com um vídeo (ou live) do YouTube que o admin controla e todos veem/ouvem de perto.
// Estado compartilhado na tabela `billboard` do Supabase (uma linha; todos leem, só o admin altera; Realtime avisa na hora).
// O vídeo toca num quadro flutuante (YouTube IFrame API) quando o jogador está a menos de RANGE_ON m do telão; o volume cai com a distância.
// O telão no mapa mostra a miniatura do vídeo, e todos tocam na mesma posição (a posição esperada é calculada pela hora do servidor).
import * as THREE from 'three';
import { supabase } from '../net/supabase';
import { addBox, MAP_ID } from './map';

const POS = MAP_ID === 'esplanada' ? new THREE.Vector3(-92, 0, -60) : new THREE.Vector3(20.5, 0, -14.5); // Paulista: calçada de pedras do outro lado da avenida, em frente ao Parque Trianon; Esplanada: gramado junto à avenida oeste
const FACE = MAP_ID === 'esplanada' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1); // a frente do telão é virada para a rua (avenida) e para o museu
const W = 12;
const H = 6.75; // 16:9
const SCREEN_Y = 6.7; // centro do telão
const POST_X = W / 2 - 0.3;
const RANGE_ON = 58; // a partir daqui o quadro do vídeo aparece (e o som começa, bem baixo)
const RANGE_FULL = 12; // até aqui, volume cheio
const SYNC_EVERY = 1; // s entre conferências de sincronia
const DRIFT = 2.5; // s de diferença tolerados antes de pular para a posição certa

export interface BillboardState { videoId: string; live: boolean; playing: boolean; position: number; at: number }

// ---------- YouTube IFrame API (tipos mínimos) ----------

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void; pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(v: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: { width: string; height: string; playerVars: Record<string, string | number>; events: Record<string, (e: { data?: number; target: YTPlayer }) => void> }) => YTPlayer;
}
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); if (window.YT) resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('Não consegui carregar o player do YouTube.')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Tira o id (11 caracteres) de um link do YouTube: watch?v=, youtu.be/, /live/, /embed/, /shorts/ ou o próprio id. */
export function youtubeId(input: string): string {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : '';
    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = /^\/(?:live|embed|shorts|v)\/([\w-]{11})/.exec(u.pathname);
      if (m) return m[1]!;
    }
  } catch { /* não é um link */ }
  return '';
}

export interface BillboardInfo { has: boolean; videoId: string; time: number; duration: number; playing: boolean; live: boolean; error: string; ready: boolean }

const CSS = `
.bb-pip{position:fixed;z-index:15;left:10px;top:176px;width:min(30vw,300px);aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.25);display:none;pointer-events:none}
.bb-pip.on{display:block}
.bb-pip .yt{position:absolute;inset:0;pointer-events:none}
.bb-pip iframe{width:100%;height:100%;border:0;pointer-events:none}
.bb-pip .tag{position:absolute;left:0;top:0;padding:2px 8px;font:800 11px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.65);border-bottom-right-radius:8px}
.bb-pip .tag.live{background:#d00}
.bb-pip .x{position:absolute;right:3px;top:3px;width:24px;height:24px;border:0;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font-size:12px;pointer-events:auto;cursor:pointer}
.bb-pip .tap{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);color:#fff;font:800 14px system-ui,sans-serif;text-align:center;pointer-events:auto;border:0;cursor:pointer}
.bb-pip.blocked .tap{display:flex}
.bb-pip.admin{z-index:60;left:0;top:0;pointer-events:none}
.bb-pip.admin .x{display:none}
`;

function idleTexture(lines: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1024, 576);
  grad.addColorStop(0, '#10161f');
  grad.addColorStop(1, '#1d2b3f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 576);
  g.fillStyle = '#ff2b2b';
  g.fillRect(40, 40, 18, 18);
  g.fillStyle = '#fff';
  g.font = '800 40px system-ui, Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText('OUTDOOR', 70, 58);
  g.textAlign = 'center';
  lines.forEach((l, i) => {
    g.font = `${i === 0 ? '800 64px' : '600 36px'} system-ui, Arial, sans-serif`;
    g.fillStyle = i === 0 ? '#ffffff' : '#9fb4cf';
    g.fillText(l, 512, 290 + i * 60);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Faixa por cima da miniatura: AO VIVO / PAUSADO / ▶ e a dica para chegar perto. */
function badgeTexture(label: string, color: string, hint: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d')!;
  g.font = '800 36px system-ui, Arial, sans-serif';
  g.fillStyle = color;
  const w = g.measureText(label).width + 44;
  g.fillRect(36, 36, w, 58);
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.fillText(label, 58, 78);
  const grd = g.createLinearGradient(0, 480, 0, 576);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,.75)');
  g.fillStyle = grd;
  g.fillRect(0, 480, 1024, 96);
  g.fillStyle = '#fff';
  g.font = '700 34px system-ui, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(hint, 512, 548);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Billboard {
  readonly x = POS.x;
  readonly z = POS.z;
  private S: BillboardState = { videoId: '', live: false, playing: false, position: 0, at: 0 };
  private skew = 0; // servidor − relógio deste navegador (ms)
  private readonly screen: THREE.Mesh;
  private readonly overlay: THREE.Mesh;
  private shownId = '__none__';
  private shownBadge = '';
  private readonly thumbLoader = new THREE.TextureLoader();
  // player
  private box: HTMLDivElement | null = null;
  private tag: HTMLElement | null = null;
  private yt: YTPlayer | null = null;
  private ytReady = false;
  private loadedId = '';
  private creating = false;
  private hiddenByUser = false;
  private near = false;
  private previewing = false;
  private previewEl: HTMLElement | null = null;
  private previewTimer = 0;
  private lastVol = -1;
  private syncT = 0;
  private notPlayingFor = 0;
  private playingFor = 0;
  private admin = false;
  private error = '';
  private ready = false;

  constructor(scene: THREE.Scene) {
    const g = new THREE.Group();
    g.position.copy(POS);
    g.rotation.y = Math.atan2(FACE.x, FACE.z);
    const steel = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, H + 0.5, 0.35), steel);
    frame.position.set(0, SCREEN_Y, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, H + 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x14171b }));
    back.position.set(0, SCREEN_Y, -0.25);
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: idleTexture(['Sem vídeo no momento']), toneMapped: false }));
    this.screen.position.set(0, SCREEN_Y, 0.19);
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.overlay.position.set(0, SCREEN_Y, 0.2);
    this.overlay.visible = false;
    g.add(frame, back, this.screen, this.overlay);
    // duas colunas de aço até o chão e uma passarela/luminária em cima
    for (const sx of [-POST_X, POST_X]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, SCREEN_Y - H / 2, 0.5), steel);
      post.position.set(sx, (SCREEN_Y - H / 2) / 2, -0.1);
      g.add(post);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
    lamp.position.set(0, SCREEN_Y + H / 2 + 0.38, 0.35);
    g.add(lamp);
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    // colisão: as duas colunas (o telão fica no alto)
    g.updateMatrixWorld(true);
    for (const sx of [-POST_X, POST_X]) {
      const p = new THREE.Vector3(sx, 0, -0.1).applyMatrix4(g.matrixWorld);
      addBox(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3, SCREEN_Y - H / 2, '#2b3038');
    }
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.drawScreen();
  }

  // ---------- estado compartilhado ----------

  /** Hora do servidor agora (ms). */
  private serverNow(): number { return Date.now() + this.skew; }

  /** Posição em que o vídeo deveria estar agora (s). */
  private expected(): number {
    return this.S.playing ? this.S.position + Math.max(0, this.serverNow() - this.S.at) / 1000 : this.S.position;
  }

  /** Baixa o estado, mede a diferença de relógio e passa a ouvir as mudanças. */
  async start(): Promise<void> {
    if (!supabase) return;
    try {
      const t0 = Date.now();
      const { data } = await supabase.rpc('server_time');
      if (typeof data === 'string') {
        const server = Date.parse(data);
        if (Number.isFinite(server)) this.skew = server - (t0 + Date.now()) / 2;
      }
    } catch { /* sem a função: assume relógio certo */ }
    await this.fetchState();
    supabase.channel('billboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billboard' }, (p) => this.applyRow(p.new as Record<string, unknown>))
      .subscribe();
    window.setInterval(() => { void this.fetchState(); }, 20000); // garantia se o Realtime falhar
  }

  private async fetchState(): Promise<void> {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('billboard').select('video_id,live,playing,position,updated_at').eq('id', 1).maybeSingle();
      if (error) { this.error = 'Outdoor ainda não configurado no servidor.'; return; }
      this.ready = true;
      if (data) this.applyRow(data as Record<string, unknown>);
    } catch { /* offline */ }
  }

  private applyRow(r: Record<string, unknown>): void {
    const id = typeof r.video_id === 'string' && /^[\w-]{11}$/.test(r.video_id) ? r.video_id : '';
    const at = typeof r.updated_at === 'string' ? Date.parse(r.updated_at) : NaN;
    const position = typeof r.position === 'number' && Number.isFinite(r.position) ? Math.max(0, r.position) : 0;
    this.S = { videoId: id, live: r.live === true, playing: r.playing === true && !!id, position, at: Number.isFinite(at) ? at : this.serverNow() };
    this.drawScreen();
    this.syncT = SYNC_EVERY; // confere já
  }

  /** Telão do mapa: miniatura do vídeo + faixa de estado. */
  private drawScreen(): void {
    const id = this.S.videoId;
    if (id !== this.shownId) {
      this.shownId = id;
      const mat = this.screen.material as THREE.MeshBasicMaterial;
      if (!id) { mat.map = idleTexture(['Sem vídeo no momento']); mat.needsUpdate = true; }
      else {
        mat.map = idleTexture(['Carregando...']);
        mat.needsUpdate = true;
        this.thumbLoader.setCrossOrigin('anonymous');
        this.thumbLoader.load(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, (t) => {
          if (this.shownId !== id) return;
          t.colorSpace = THREE.SRGBColorSpace;
          mat.map = t;
          mat.needsUpdate = true;
        }, undefined, () => {
          if (this.shownId !== id) return;
          mat.map = idleTexture(['Vídeo no outdoor', 'chegue perto para assistir e ouvir']);
          mat.needsUpdate = true;
        });
      }
    }
    const badge = !id ? '' : this.S.live ? 'AO VIVO' : this.S.playing ? 'TOCANDO' : 'PAUSADO';
    if (badge !== this.shownBadge) {
      this.shownBadge = badge;
      const om = this.overlay.material as THREE.MeshBasicMaterial;
      this.overlay.visible = !!badge;
      if (badge) { om.map = badgeTexture(badge, this.S.live ? '#d00000' : '#1b6fd1', 'Chegue perto para assistir e ouvir'); om.needsUpdate = true; }
    }
  }

  // ---------- quadro do vídeo (player) ----------

  private makeBox(): void {
    if (this.box) return;
    const box = document.createElement('div');
    box.className = 'bb-pip';
    const host = document.createElement('div');
    host.className = 'yt';
    const tag = document.createElement('div');
    tag.className = 'tag';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.textContent = '✕';
    x.title = 'Fechar o vídeo do outdoor';
    x.onclick = () => { this.hiddenByUser = true; this.sync(); };
    const tap = document.createElement('button');
    tap.type = 'button';
    tap.className = 'tap';
    tap.textContent = 'Toque para ouvir o outdoor';
    tap.onclick = () => { this.yt?.playVideo(); box.classList.remove('blocked'); };
    box.append(host, tag, x, tap);
    document.body.appendChild(box);
    this.box = box;
    this.tag = tag;
  }

  private async ensurePlayer(): Promise<void> {
    if (this.yt || this.creating) return;
    this.creating = true;
    try {
      const YT = await loadYouTubeApi();
      this.makeBox();
      const host = this.box!.querySelector('.yt') as HTMLElement;
      const mount = document.createElement('div');
      host.appendChild(mount);
      this.yt = new YT.Player(mount, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: () => { this.ytReady = true; this.sync(); },
          onStateChange: () => { this.error = ''; },
          onError: (e) => {
            const c = e.data ?? 0;
            this.error = c === 101 || c === 150 ? 'O dono deste vídeo não permite incorporar em outros sites.' : c === 100 ? 'Vídeo não encontrado ou privado.' : c === 2 ? 'Endereço do vídeo inválido.' : `Erro do YouTube (${c}).`;
          },
        },
      });
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Falha no player.';
    } finally {
      this.creating = false;
    }
  }

  /** Chamado todo quadro: distância ao telão, mostra/esconde o quadro e acerta o volume; confere a sincronia a cada segundo. */
  update(dt: number, px: number, pz: number): void {
    const d = Math.hypot(px - POS.x, pz - POS.z);
    const near = d <= RANGE_ON;
    if (near !== this.near) { this.near = near; if (!near) this.hiddenByUser = false; }
    this.syncT += dt;
    if (this.syncT >= SYNC_EVERY) { this.syncT = 0; this.sync(); }
    if (!this.yt || !this.ytReady) return;
    const vol = this.previewing ? 100 : Math.round(100 * Math.max(0, 1 - Math.max(0, d - RANGE_FULL) / (RANGE_ON - RANGE_FULL)) ** 2);
    if (vol !== this.lastVol) { this.lastVol = vol; this.yt.setVolume(vol); }
    this.liveCheck(dt);
  }

  /** Admin: quando o vídeo toca e a duração é 0, é uma live: avisa todos. */
  private liveCheck(dt: number): void {
    if (!this.admin || !this.yt || !this.S.videoId || this.S.live) return;
    const st = this.yt.getPlayerState();
    this.playingFor = st === 1 ? this.playingFor + dt : 0;
    if (this.playingFor > 2.5 && this.yt.getDuration() === 0) void this.push({ live: true });
  }

  /** Põe o player do jeito que o estado compartilhado manda. */
  private sync(): void {
    const active = (this.near && !this.hiddenByUser && !!this.S.videoId) || this.previewing;
    if (active && !this.yt) void this.ensurePlayer();
    if (!this.box) return;
    this.box.classList.toggle('on', active);
    if (this.tag) {
      this.tag.textContent = this.S.live ? '● AO VIVO' : this.S.playing ? 'OUTDOOR' : 'OUTDOOR · pausado';
      this.tag.classList.toggle('live', this.S.live);
    }
    if (!this.yt || !this.ytReady) return;
    const yt = this.yt;
    if (!active) { if (yt.getPlayerState() === 1) yt.pauseVideo(); return; }
    const exp = this.expected();
    if (this.S.videoId !== this.loadedId) {
      this.loadedId = this.S.videoId;
      const o = { videoId: this.S.videoId, startSeconds: this.S.live ? undefined : exp };
      if (this.S.playing) yt.loadVideoById(o); else yt.cueVideoById(o);
      return;
    }
    const st = yt.getPlayerState(); // -1 não iniciado, 0 acabou, 1 tocando, 2 pausado, 3 carregando, 5 pronto
    const cur = yt.getCurrentTime();
    if (this.S.playing) {
      if (st !== 1 && st !== 3) yt.playVideo();
      if (!this.S.live && Math.abs(cur - exp) > DRIFT) yt.seekTo(exp, true);
      this.notPlayingFor = st === 1 || st === 3 ? 0 : this.notPlayingFor + SYNC_EVERY;
      this.box.classList.toggle('blocked', this.notPlayingFor >= 4); // o navegador não deixou tocar sozinho: pede um toque
    } else {
      if (st === 1 || st === 3) yt.pauseVideo();
      if (!this.S.live && Math.abs(cur - this.S.position) > 0.8) yt.seekTo(this.S.position, true);
      this.box.classList.remove('blocked');
    }
  }

  // ---------- controles do administrador ----------

  setAdmin(v: boolean): void { this.admin = v; }

  /** Estado do player para a janela do admin (tempo, duração, ao vivo...). */
  info(): BillboardInfo {
    const yt = this.yt && this.ytReady && this.loadedId === this.S.videoId ? this.yt : null;
    const cur = yt ? yt.getCurrentTime() : this.expected();
    return {
      has: !!this.S.videoId, videoId: this.S.videoId, time: Number.isFinite(cur) ? cur : 0,
      duration: yt ? Math.max(0, yt.getDuration() || 0) : 0, playing: this.S.playing, live: this.S.live, error: this.error || (this.ready ? '' : 'Outdoor ainda não configurado no servidor (migração pendente).'), ready: this.ready,
    };
  }

  /** O quadro do vídeo vira a prévia do admin: fica por cima da janela, no lugar do retângulo `el` (null = volta ao normal). */
  attachPreview(el: HTMLElement | null): void {
    window.clearInterval(this.previewTimer);
    this.previewEl = el;
    this.previewing = !!el;
    this.lastVol = -1;
    if (el) {
      this.makeBox();
      const place = (): void => {
        if (!this.box || !this.previewEl) return;
        const r = this.previewEl.getBoundingClientRect();
        Object.assign(this.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, aspectRatio: 'auto' });
      };
      this.box!.classList.add('admin');
      place();
      this.previewTimer = window.setInterval(place, 120);
    } else if (this.box) {
      this.box.classList.remove('admin');
      Object.assign(this.box.style, { left: '', top: '', width: '', height: '', aspectRatio: '' });
    }
    this.sync();
  }

  private async push(patch: { video_id?: string; live?: boolean; playing?: boolean; position?: number }): Promise<string | null> {
    if (!supabase) return 'Sem conexão com o servidor.';
    // aplica na hora aqui (sem esperar a volta do Realtime)
    const next: BillboardState = { ...this.S, at: this.serverNow() };
    if (patch.video_id !== undefined) next.videoId = patch.video_id;
    if (patch.live !== undefined) next.live = patch.live;
    if (patch.playing !== undefined) next.playing = patch.playing && !!next.videoId;
    if (patch.position !== undefined) next.position = patch.position;
    this.S = next;
    this.drawScreen();
    this.sync();
    const { data, error } = await supabase.from('billboard').update(patch).eq('id', 1).select('id');
    if (error) return /relation|does not exist|schema cache/i.test(error.message) ? 'O outdoor ainda não existe no servidor (migração pendente).' : /permission|row-level/i.test(error.message) ? 'Sem permissão: só o administrador controla o outdoor.' : error.message;
    if (!data || data.length === 0) return 'Sem permissão para alterar (só o administrador).';
    return null;
  }

  private cur(): number {
    const yt = this.yt && this.ytReady && this.loadedId === this.S.videoId ? this.yt : null;
    const t = yt ? yt.getCurrentTime() : this.expected();
    return Number.isFinite(t) ? t : 0;
  }

  /** Coloca um vídeo ou live (link ou id) no outdoor, parado no início. */
  async setVideo(input: string): Promise<string | null> {
    const id = youtubeId(input);
    if (!id) return 'Link do YouTube inválido. Cole o endereço do vídeo ou da live.';
    this.error = '';
    return this.push({ video_id: id, live: false, playing: true, position: 0 });
  }

  play(): Promise<string | null> { return this.push({ playing: true, position: this.cur() }); }
  pause(): Promise<string | null> { return this.push({ playing: false, position: this.cur() }); }
  stop(): Promise<string | null> { return this.push({ playing: false, position: 0 }); }
  seekBy(s: number): Promise<string | null> { return this.push({ position: Math.max(0, this.cur() + s), playing: this.S.playing }); }
  seekTo(t: number): Promise<string | null> { return this.push({ position: Math.max(0, t), playing: this.S.playing }); }
  /** Tira o vídeo do outdoor. */
  clear(): Promise<string | null> { return this.push({ video_id: '', live: false, playing: false, position: 0 }); }
}

/** Verifica se o vídeo existe e se pode ser incorporado (oEmbed do YouTube). */
export async function checkYoutube(input: string): Promise<{ ok: boolean; msg: string }> {
  const id = youtubeId(input);
  if (!id) return { ok: false, msg: 'Link do YouTube inválido.' };
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (r.status === 401 || r.status === 403) return { ok: false, msg: 'O dono do vídeo não permite incorporar em outros sites (ou o vídeo é privado). Não vai tocar no jogo.' };
    if (r.status === 404) return { ok: false, msg: 'Vídeo não encontrado.' };
    if (!r.ok) return { ok: false, msg: `Não consegui verificar (erro ${r.status}). Tente colocar no outdoor e veja se toca na prévia.` };
    const j = (await r.json()) as { title?: string; author_name?: string };
    return { ok: true, msg: `Pode incorporar: "${j.title ?? id}" — ${j.author_name ?? ''}. Lives também funcionam (aparece "AO VIVO" quando começa a tocar).` };
  } catch {
    return { ok: false, msg: 'Não consegui verificar daqui. Tente colocar no outdoor e veja se toca na prévia.' };
  }
}
