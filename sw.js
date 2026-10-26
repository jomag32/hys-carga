// Service worker de hys-carga: deja abrir la app sin señal (la «cáscara»: HTML, JS, CSS, íconos).
//
// · Red primero para todo lo propio (mismo origen): si hay señal se usa SIEMPRE lo último publicado
//   (revalida con ETag, barato) y se guarda copia; si no hay señal o tarda más de RED_MS, la copia.
//   Así un deploy nuevo llega solo, sin que el celular quede con código viejo.
// · NUNCA intercepta llamadas a otros orígenes (hys-carga-api, Odoo): van directo a la red, sin copia.
//   Tampoco toca nada que no sea GET. La cola sin señal (IndexedDB) es de la página, no de acá.
// · VERSION: subirla en CADA deploy (y la misma en componentes/version.js, que se ve en el inicio).
//   El SW nuevo se instala, toma control enseguida y la página se recarga sola (o al volver al inicio
//   si hay un formulario abierto).
// · CDN de Render (s-maxage=300): después de un deploy puede seguir dando archivos viejos ~5 min.
//   Por eso todo se pide a la red como «archivo?v=VERSION» (otra clave para la CDN → sale del servidor,
//   ya nuevo) y se guarda en la copia con la clave sin «?v=». Así la copia de una versión nunca mezcla
//   archivos de otra (antes, con cache:"reload", la CDN podía colar módulos viejos en la copia nueva).
const VERSION = "2026-10-25.9";
const CACHE = `hys-carga-cascara-${VERSION}`;
const RED_MS = 4000;

const CASCARA = [
  "./", "index.html", "app.js", "manifest.webmanifest", "css/estilos.css",
  "api/cola.js", "api/config.js", "api/datos-mock.js", "api/odoo.js",
  "componentes/asistente.js", "componentes/campos-auto.js", "componentes/campos.js", "componentes/checklist.js",
  "componentes/encabezado.js", "componentes/pdf-ats.js", "componentes/pwa.js", "componentes/selector-inspector.js", "componentes/selector-obra.js",
  "componentes/selector-turno.js", "componentes/sesion.js", "componentes/util.js", "componentes/version.js",
  "vistas/_inspeccion-planta.js", "vistas/f01-ficha-riesgo.js", "vistas/f02-inspeccion-obra.js", "vistas/f03-recorrida-fabrica.js",
  "vistas/f04-check-instalaciones.js", "vistas/f05-evento.js", "vistas/f06-vencimiento-legal.js", "vistas/f07-cierre-desvio.js",
  "vistas/f08-ats-turno.js", "vistas/vencimientos.js",
  "datos/obras.json",
  "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-maskable-192.png", "iconos/icono-maskable-512.png",
  "iconos/apple-touch-icon.png", "iconos/favicon-32.png"
];

// URL de red de un archivo propio: misma ruta con ?v=VERSION (rompe la caché de la CDN y del navegador).
const deRed = (ruta) => { const u = new URL(ruta, self.registration.scope); u.searchParams.set("v", VERSION); return u.href; };
// Copia sin la URL «?v=» (la página ve el archivo con su ruta de siempre; los import relativos no cambian).
const limpia = async (r) => new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // ?v=VERSION + cache:"reload" → baja del servidor (ni CDN ni caché del navegador); se guarda sin «?v=».
    await Promise.all(CASCARA.map(async (u) => {
      try { const r = await fetch(new Request(deRed(u), { cache: "reload" })); if (r.ok) await c.put(u, await limpia(r)); }
      catch (e) { /* un archivo que falla no frena la instalación; se guarda cuando se use con señal */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("hys-carga-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (ev) => {
  if (ev.data === "version") ev.source?.postMessage({ tipo: "version", version: VERSION });
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // hys-carga-api, Odoo, etc.: sin tocar
  if (url.pathname.includes("/api/v1/")) return;            // por las dudas, si algún día la API va en el mismo origen
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("config.local.js")) return;
  ev.respondWith(redPrimero(req, url));
});

async function redPrimero(req, url) {
  const c = await caches.open(CACHE);
  // Navegación (abrir la app, con cualquier #ruta o ?parámetro) → siempre index.html.
  const clave = req.mode === "navigate" ? "index.html" : url.pathname.slice(self.registration.scope.length - self.location.origin.length) || "./";
  // A la red siempre con ?v=VERSION (index.html para las navegaciones): con señal llega lo de ESTA versión
  // aunque la CDN tenga guardado algo anterior. Sin señal o si tarda más de RED_MS, la copia (misma versión).
  const red = fetch(deRed(req.mode === "navigate" ? "index.html" : url.pathname + url.search), { cache: "no-cache", credentials: "same-origin" }).then(async (r0) => {
    if (!r0.ok || r0.type !== "basic") return r0;
    const r = await limpia(r0);
    await c.put(clave, r.clone());
    return r;
  });
  const copia = await c.match(clave) || (req.mode === "navigate" ? await c.match("./") : null);
  if (!copia) return red;                                   // nunca se guardó: depende de la red
  const tarde = new Promise((ok) => setTimeout(() => ok(null), RED_MS));
  try {
    const r = await Promise.race([red, tarde]);
    if (r && (r.ok || !copia)) return r;
  } catch (e) { /* sin señal */ }
  red.catch(() => {});                                      // si la red llega tarde, igual actualiza la copia
  return copia;
}
