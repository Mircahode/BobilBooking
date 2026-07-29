/* Bobil Booking — service worker
   Strategi:
   - App-skallet (HTML/ikoner/manifest) caches, slik at appen åpner umiddelbart
     og fungerer selv med dårlig dekning.
   - Nettverk først for selve HTML-fila, slik at du alltid får siste versjon når
     du har nett — cachen brukes bare som reserve.
   - Alt som går til Supabase går ALDRI via cache (data må være ferskt).
*/
const CACHE = "bobil-v1";
const SHELL = [
  "mobil.html",
  "manifest.json",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Data og innlogging skal alltid hentes ferskt.
  if (url.hostname.indexOf("supabase") !== -1) return;

  const isDoc = req.mode === "navigate" || url.pathname.endsWith(".html");

  if (isDoc) {
    // Nettverk først, cache som reserve.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("mobil.html")))
    );
    return;
  }

  // Øvrige ressurser: cache først, hent i bakgrunnen.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
