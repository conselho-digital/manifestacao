/*
 * Paulista Livre: the game bundle failed to start (an old browser that cannot read it, a file that did not download).
 * Plain ES5 on purpose, loaded before the game: it reports the failure through the game's socket as the entry screen
 * would (server/frontend-errors.ts kind "boot") and tells the player, instead of a page that stays on its first frame.
 * Nothing here runs once the game has started (client/main.ts sets __PAULISTA_BOOT__).
 */
(function () {
  var errors = [], sent = false;
  function booted() { return !!window.__PAULISTA_BOOT__; }
  function socketUrl() {
    var base = location.pathname.indexOf('/manifestacao/') === 0 ? '/manifestacao/' : '/';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + base + 'ws';
  }
  function tell(text) {
    var app = document.getElementById('app');
    if (!app || booted()) return;
    var box = document.createElement('p');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'max-width:520px;margin:40px auto;padding:20px;font:16px/1.5 system-ui,sans-serif;color:#f3f6f6;background:#19232c;border:1px solid #60727c;border-radius:12px';
    box.textContent = text;
    app.appendChild(box);
  }
  function send(message, timedOut) {
    if (sent || booted()) return;
    sent = true;
    var report = {
      kind: 'boot', message: String(message).slice(0, 300), stack: JSON.stringify(errors).slice(0, 2000), at: Date.now(), build: 'boot-check',
      browser: navigator.userAgent.slice(0, 180),
      state: { dpr: window.devicePixelRatio || 1, width: window.innerWidth, height: window.innerHeight, visibility: document.visibilityState || '' }
    };
    try {
      var ws = new WebSocket(socketUrl());
      ws.onopen = function () {
        ws.send(JSON.stringify({ t: 'lobby' }));
        ws.send(JSON.stringify({ t: 'client_error', report: report }));
        setTimeout(function () { ws.close(); }, 1500);
      };
    } catch (e) { /* nothing more to try */ }
    if (!timedOut) tell('O jogo não conseguiu abrir neste navegador. Atualize o navegador (no iPhone e no iPad, atualize o iOS) ou use o Chrome, o Edge ou o Firefox atualizados, e recarregue a página.');
  }
  // a module this browser cannot read, or the bundle that did not download
  window.addEventListener('error', function (e) {
    if (booted()) return;
    var target = e.target, file = (e.filename || (target && target.src) || '').split('?')[0];
    if (errors.length < 5) errors.push({ m: String(e.message || (target && target.tagName) || 'error').slice(0, 200), f: file.slice(-80), l: e.lineno || 0 });
    if (/\/assets\/index-[\w-]+\.js$/.test(file)) send(e.message || 'O pacote do jogo não carregou.', false);
  }, true);
  // no module support at all: the game's script is never even fetched
  if (!('noModule' in document.createElement('script'))) setTimeout(function () { send('Navegador sem suporte a módulos JavaScript.', false); }, 0);
  // the game neither started nor failed after a minute with the page in view: reported, not shown (a slow connection)
  setTimeout(function () { if (document.visibilityState === 'visible') send('O jogo não iniciou em 60 s.', true); }, 60000);
})();
