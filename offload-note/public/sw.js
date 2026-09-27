// Offload notes: keeps the form usable with weak or no signal.
// Pages: network first, cached copy when offline. Static files: cache first.
// API calls are never cached; the send queue lives in IndexedDB.
const CACHE = "offload-notes-v1";
const PAGES = ["/note", "/note/new"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(PAGES.map((p) => fetch(p, { credentials: "same-origin" }).then((r) => (r.ok && !r.redirected ? c.put(p, r) : null)).catch(() => null)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/note")) return;
  if (url.pathname.startsWith("/note/api/")) return;

  if (url.pathname.startsWith("/note/_next/static/") || /\.(woff2?|jpg|png|svg)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
            return r;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const key = url.pathname.replace(/\/$/, "") || "/note";
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok && !r.redirected && PAGES.includes(key)) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return r;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match("/note/new")).then((hit) => hit || new Response("No signal. Open the app again when you have signal.", { status: 503, headers: { "Content-Type": "text/plain" } }))),
    );
  }
});
