/* Service worker mínimo (PWA): casca do app e modelos 3D em cache; tempo real, API e pagamentos NUNCA passam por aqui. */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const MODELS = `models-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google, Mercado Pago: direto na rede

  // Modelos 3D (pesados, raramente mudam): cache primeiro.
  if (url.pathname.startsWith("/models/")) {
    e.respondWith(
      caches.open(MODELS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Páginas: rede primeiro; sem rede, volta a casca em cache (o jogo em si exige internet).
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }

  // Arquivos com hash (/assets/...): cache primeiro, são imutáveis.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
  }
});
