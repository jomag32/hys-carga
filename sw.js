// Service worker de hys-carga: deja abrir la app sin señal (la «cáscara»: HTML, JS, CSS, íconos).
//
// · Red primero para todo lo propio (mismo origen): si hay señal se usa SIEMPRE lo último publicado
//   (revalida con ETag, barato) y se guarda copia; si no hay señal o tarda más de RED_MS, la copia.
//   Así un deploy nuevo llega solo, sin que el celular quede con código viejo.
// · NUNCA intercepta llamadas a otros orígenes (hys-carga-api, Odoo): van directo a la red, sin copia.
//   Tampoco toca nada que no sea GET. La cola sin señal (IndexedDB) es de la página, no de acá.
// · VERSION: subirla cuando cambie este archivo o la lista CASCARA. El SW nuevo se instala, toma
//   control enseguida y la página se recarga sola (o al volver al inicio si hay un formulario abierto).
const VERSION = "2026-10-18.3";
const CACHE = `hys-carga-cascara-${VERSION}`;
const RED_MS = 4000;

const CASCARA = [
  "./", "index.html", "app.js", "manifest.webmanifest", "css/estilos.css",
  "api/cola.js", "api/config.js", "api/datos-mock.js", "api/odoo.js",
  "componentes/asistente.js", "componentes/campos-auto.js", "componentes/campos.js", "componentes/checklist.js",
  "componentes/encabezado.js", "componentes/pwa.js", "componentes/selector-inspector.js", "componentes/selector-obra.js",
  "componentes/selector-turno.js", "componentes/sesion.js", "componentes/util.js",
  "vistas/_inspeccion-planta.js", "vistas/f01-ficha-riesgo.js", "vistas/f02-inspeccion-obra.js", "vistas/f03-recorrida-fabrica.js",
  "vistas/f04-check-instalaciones.js", "vistas/f05-evento.js", "vistas/f06-vencimiento-legal.js", "vistas/f07-cierre-desvio.js",
  "vistas/f08-ats-turno.js",
  "datos/obras.json",
  "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-maskable-192.png", "iconos/icono-maskable-512.png",
  "iconos/apple-touch-icon.png", "iconos/favicon-32.png"
];

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // cache: "reload" → baja del servidor, no de la caché HTTP del navegador (evita guardar algo viejo).
    await Promise.all(CASCARA.map(async (u) => {
      try { const r = await fetch(new Request(u, { cache: "reload" })); if (r.ok) await c.put(u, r); }
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
  const red = fetch(req, { cache: "no-cache" }).then(async (r) => {
    if (r.ok && r.type === "basic") await c.put(clave, r.clone());
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
