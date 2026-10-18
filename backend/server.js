// hys-carga-api · backend mínimo de hys-carga (Node 20, sin dependencias).
//
// D-05 (17/10/2026): el repo es PÚBLICO. Los nombres reales de obras y clientes los sirve este
// backend desde Odoo con la cuenta de servicio MIA; la credencial vive SOLO en variables de entorno
// de Render (ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD). Nunca va al código ni a los logs.
//
// Endpoints:
//   GET  /healthz               → {ok:true} (no toca Odoo)
//   GET  /api/v1/obras          → [{id, name, ot, partner, director}] obras en curso (caché 5 min)
//   POST /api/v1/inspecciones   → 501 (todavía NO se escribe en Odoo)

import http from "node:http";
import { crearCliente, ErrorOdoo } from "./odoo.js";
import { armarObras } from "./obras.js";

const PORT = Number(process.env.PORT) || 10000;
const ETAPAS = (process.env.OBRAS_ETAPAS || "EN PROGRESO,PAUSADO").split(",").map((s) => s.trim()).filter(Boolean);
const CACHE_MS = 5 * 60 * 1000;
const ORIGENES = (process.env.ALLOWED_ORIGINS || "https://hys-carga.onrender.com").split(",").map((s) => s.trim()).filter(Boolean);
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // desarrollo
const LIMITE = { ventanaMs: 60000, maximo: Number(process.env.RATE_LIMIT_PER_MIN) || 60 };

let odoo = null;
const cliente = () => (odoo ??= crearCliente({
  url: process.env.ODOO_URL, db: process.env.ODOO_DB, usuario: process.env.ODOO_USER, clave: process.env.ODOO_PASSWORD
}));

// ---------------------------------------------------------------- obras (caché en memoria)
let cache = { obras: null, hasta: 0, fecha: null };
let enCurso = null;

async function leerObras() {
  if (cache.obras && Date.now() < cache.hasta) return { obras: cache.obras, origen: "cache" };
  enCurso ??= (async () => {
    try {
      const regs = await cliente().ejecutar("project.project", "search_read",
        [[["stage_id.name", "in", ETAPAS], ["active", "=", true], ["is_template", "=", false]]],
        { fields: ["id", "name", "partner_id", "user_id"], order: "id" });
      cache = { obras: armarObras(regs), hasta: Date.now() + CACHE_MS, fecha: new Date().toISOString() };
      return { obras: cache.obras, origen: "odoo" };
    } finally { enCurso = null; }
  })();
  return enCurso;
}

// ---------------------------------------------------------------- utilidades HTTP
function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGENES.includes(o) || LOCALHOST.test(o))) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

function json(res, estado, cuerpo, extra = {}) {
  res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(cuerpo));
}

const golpes = new Map(); // ip → {n, desde}
function limitado(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ahora = Date.now();
  const g = golpes.get(ip);
  if (!g || ahora - g.desde > LIMITE.ventanaMs) { golpes.set(ip, { n: 1, desde: ahora }); return false; }
  return ++g.n > LIMITE.maximo;
}
setInterval(() => { const t = Date.now(); for (const [k, g] of golpes) if (t - g.desde > LIMITE.ventanaMs) golpes.delete(k); }, 60000).unref();

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- rutas
const servidor = http.createServer(async (req, res) => {
  cors(req, res);
  const ruta = new URL(req.url, "http://x").pathname.replace(/\/+$/, "") || "/";
  try {
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (ruta === "/healthz") return json(res, 200, { ok: true, servicio: "hys-carga-api" });
    if (limitado(req)) return json(res, 429, { error: "Demasiados pedidos; probá en un minuto." }, { "Retry-After": "60" });

    if (ruta === "/api/v1/obras" && req.method === "GET") {
      try {
        const { obras, origen } = await leerObras();
        return json(res, 200, obras, { "X-Origen": origen, "X-Actualizado": cache.fecha || "" });
      } catch (e) {
        log("obras: error", e instanceof ErrorOdoo ? e.message : e?.name || "error");
        if (cache.obras) return json(res, 200, cache.obras, { "X-Origen": "cache-vencida", "X-Actualizado": cache.fecha });
        return json(res, 502, { error: "No se pudo leer la lista de obras desde Odoo. Probá de nuevo en un rato." });
      }
    }
    if (ruta === "/api/v1/inspecciones" && req.method === "POST") {
      req.resume();
      return json(res, 501, { error: "Envío de inspecciones a Odoo todavía no habilitado (modo simulado)." });
    }
    if (ruta === "/") return json(res, 200, { servicio: "hys-carga-api", endpoints: ["GET /healthz", "GET /api/v1/obras"] });
    return json(res, 404, { error: "No existe" });
  } catch (e) {
    log("error inesperado", e?.name || "error");
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
});

servidor.listen(PORT, () => log(`hys-carga-api escuchando en :${PORT} · etapas ${ETAPAS.join(" / ")} · orígenes ${ORIGENES.join(", ")}`));
