// Service worker do PWA. Estrategia: rede-primeiro para o "shell" (fica sempre
// atualizado online e funciona offline pelo cache). NUNCA intercepta dados
// privados nem os endpoints do app (deixa passar direto pra rede).
const CACHE = "fframe-shell-v8";
const SHELL = ["/", "/app.css", "/app.js", "/i18n.js", "/qrcode.min.js", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Dados privados e endpoints do app: sempre direto pra rede (nunca cachear).
  if (/^\/(_api|_media|_download|_auth|_status|v2|oauth2|_upload|api)/.test(url.pathname)) return;
  // Shell: rede-primeiro, cai pro cache se estiver offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return resp; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
