/* Il piccolo mondo di Ila: service worker (v3).
 * La build (prepare-deploy --pages) timbra BUILD e PRECACHE { percorso: sha256 } con
 * stampServiceWorker() di src/core/pwa.js. Senza timbro (sviluppo) non mette nulla in cache.
 * - offline completo: tutta la build viene scaricata e verificata prima di attivarsi;
 * - aggiornamento silenzioso: la nuova build subentra in background, la pagina aperta
 *   continua col codice che ha già e la novità si vede al prossimo avvio;
 * - niente dati personali in chiaro: si serve dalla cache solo ciò che è nella lista,
 *   e da content/ entrano solo il vault cifrato, i file .enc e l'indizio. */
const BUILD = "09d5855e3d125682";
const PRECACHE = {"assets/fonts/pixelify-sans-latin-400-normal.woff2":"d830612ac9131788ebae754b9268f83f7c1d3ffa9bc0f9a5514207a8283fe71e","assets/fonts/pixelify-sans-latin-500-normal.woff2":"d17198a8057c1d0354ca39fffd54533734c1c8a6f47a9bde29ee1fb4cdfa06f0","assets/fonts/pixelify-sans-latin-600-normal.woff2":"9ee47c039a991caea6072eecfe03cf36debf4f70bb2566bd602b9eada1ab1112","assets/fonts/pixelify-sans-latin-700-normal.woff2":"c836cfa5c0e9d62ea9b890e0418d52a6004149090a521cd198a8c09f5d5ab893","assets/icons/apple-touch-icon.png":"d5499cf3d56e2109db303bd3687a3fae42c0af39b02249a072cb2c045b2e5aea","assets/icons/favicon-16.png":"7fcc1725e3a1fcbce755e821521d309883dcd26f01de76e7f505fdf209fda42c","assets/icons/favicon-32.png":"e65a2652cc0c0e01f35fbae9b90425872f31299e65549fa38ecb262f6ef1be83","assets/icons/favicon.ico":"520bebb64832471b76f0d325a58e159c6258e4476cfc96b95ce9e895cf3381db","assets/icons/icon-192.png":"932703f51a9d3cd127384329a51057245bf4aca2f90ac278c2d82f7074143f29","assets/icons/icon-512.png":"a6f57a964f9e24f8872e02f35d1dc00ebee92026b92c53e19644632078403f78","assets/icons/maskable-192.png":"18ab1a68a97ff4e0d212ffae02ab4643353603428132afac800a0ef119899445","assets/icons/maskable-512.png":"0e05f16163aff56c575b1a630efb7cdc80012c95c9366aaa718cac07873d6f18","assets/icons/monochrome-512.png":"63b7f2bcca0d5b6143324fd1390dec2ebaa953f1f6bc7b9343892a8e05c2914e","assets/ui/fullscreen-bg-day.png":"24ef7457d7541c0a592dd525161d3119a82eeeaf99ea2125475bf3174351e43d","assets/ui/fullscreen-bg.png":"8f0a5d8df1069592995fb42d9ab41d0ec1a885ca9863adf4a2bee2874b472ec7","assets/ui/fullscreen-edge-day.png":"88277508c5f6fcb3c255b84510017d1f5165a2111939622fe0d5f1e5d531f18a","assets/ui/fullscreen-edge.png":"a65a0236e1bb1664b28efac49c4f278f762089513909d57791b295639e2b8469","content/vault.json":"d0cb7b2c974c6934dc4cf4193b34fd5dcb449c6f9de4ca90f2cdf00a281a53f5","index.html":"927efe1530410baa36227e7c82e78839c34308098032d617f9154c51d983037d","manifest.webmanifest":"38b69dd15114e105a788daa6a01d5bf2c7ef9c86d93ce6242c55e688167c62a2","src/bundle/main.js":"88b97df83dfa9ce162cc567cb4ca78836216bbef9f84f2ce8c44dcc4f80e1da4","styles/gb.css":"bc6fea09756f427f8f1e07a5bf52e0fd36d83afd5e8f3bf447ff46fd9adbfc5a"};

const STAMPED = !BUILD.startsWith('__ILA');
const BASE = self.registration.scope;
const BASE_PATH = new URL(BASE).pathname;
const PREFIX = `ila:${BASE_PATH}:`;
const LEGACY_PREFIX = `ila-little-world:${BASE_PATH}:`;
const CACHE = `${PREFIX}build-${BUILD}`;
const FONTS = `${PREFIX}fonts`;
const FONT_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
// Stessa regola di isPrivatePath() in src/core/pwa.js (tests/pwa.test.js le confronta).
const PRIVATE = /^content\/(?!vault\.json$|vault-hint\.txt$|[^?#]*\.enc$)|\.md$|(?:^|\/)(?:letters|selection|memories)[^/]*\.json$/i;

const absolute = path => new URL(path, BASE).href;
const entries = () => Object.entries(PRECACHE).filter(([path]) => !PRIVATE.test(path));

async function digest(response) {
  const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (STAMPED) {
      const cache = await caches.open(CACHE);
      try {
        // Tutto o niente: una build a metà (o un CDN ancora vecchio) non sostituisce quella che funziona.
        await Promise.all(entries().map(async ([path, sha256]) => {
          const response = await fetch(new Request(absolute(path), { cache: 'reload', credentials: 'same-origin' }));
          if (!response.ok) throw new Error(`precache ${path}: HTTP ${response.status}`);
          if (sha256 && await digest(response.clone()) !== sha256) throw new Error(`precache ${path}: contenuto diverso dalla build`);
          await cache.put(absolute(path), response);
        }));
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const ours = name.startsWith(PREFIX) || name.startsWith(LEGACY_PREFIX);
      if (ours && name !== CACHE && (name !== FONTS || !STAMPED)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function fromBuild(request, path) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(absolute(path));
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    const text = request.mode === 'navigate' ? 'Il tuo mondo si sta ancora preparando: riaprilo con la connessione attiva ♡' : 'Non disponibile offline';
    return new Response(text, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// Font dell'interfaccia: dalla cache subito, aggiornati in background quando c'è rete.
async function font(request) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(request);
  const fresh = fetch(request).then(async response => {
    if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
    return response;
  });
  if (cached) { fresh.catch(() => {}); return cached; }
  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!STAMPED || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_ORIGINS.has(url.origin)) { event.respondWith(font(request)); return; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;
  let path;
  try { path = decodeURIComponent(url.pathname.slice(BASE_PATH.length)); } catch { return; }
  if (path === '' || (request.mode === 'navigate' && !Object.hasOwn(PRECACHE, path))) path = 'index.html';
  if (!Object.hasOwn(PRECACHE, path) || PRIVATE.test(path)) return;
  event.respondWith(fromBuild(request, path));
});
