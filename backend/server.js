// hys-carga-api · backend mínimo de hys-carga (Node 20, sin dependencias).
//
// D-05 (17/10/2026): el repo es PÚBLICO. Los nombres reales de obras y clientes los sirve este
// backend desde Odoo con la cuenta de servicio MIA; la credencial vive SOLO en variables de entorno
// de Render (ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD). Nunca va al código ni a los logs.
//
// Endpoints:
//   GET  /healthz                 → {ok:true} (no toca Odoo)
//   GET  /api/v1/obras            → [{id, name, ot, partner, director}] obras en curso (caché 5 min)
//   GET  /api/v1/inspectores      → [{id, nombre, legajo, tipo, empresa}] de x_hys_inspector activos (caché 5 min)
//   GET  /api/v1/hitos?ot=<id>    → [{id, name, fecha_limite, alcanzado}] project.milestone de la OT
//   POST /api/v1/ingreso          → {inspector_id, clave} → token de sesión (contraseña por inspector, ver ingreso.js)
//   POST /api/v1/inspecciones     → (Authorization: Bearer <token>) create de x_hys_inspeccion + líneas (idempotente; 201 nuevo, 200 repetido)

import http from "node:http";
import { crearCliente, ErrorOdoo } from "./odoo.js";
import { armarObras } from "./obras.js";
import { crearCatalogos } from "./catalogos.js";
import { crearInspecciones, ErrorEntrada } from "./inspecciones.js";
import { crearIngreso, ErrorIngreso } from "./ingreso.js";

const PORT = Number(process.env.PORT) || 10000;
const ETAPAS = (process.env.OBRAS_ETAPAS || "EN PROGRESO,PAUSADO").split(",").map((s) => s.trim()).filter(Boolean);
const CACHE_MS = 5 * 60 * 1000;
const ORIGENES = (process.env.ALLOWED_ORIGINS || "https://hys-carga.onrender.com").split(",").map((s) => s.trim()).filter(Boolean);
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // desarrollo
const MAX_CUERPO = Number(process.env.MAX_BODY_MB || 15) * 1024 * 1024;
const LIMITE = { ventanaMs: 60000, maximo: Number(process.env.RATE_LIMIT_PER_MIN) || 60 };

let odoo = null;
const cliente = () => (odoo ??= crearCliente({
  url: process.env.ODOO_URL, db: process.env.ODOO_DB, usuario: process.env.ODOO_USER, clave: process.env.ODOO_PASSWORD
}));

const catalogos = crearCatalogos(cliente);
const inspecciones = crearInspecciones(cliente, catalogos);
// Firma de sesiones: HYS_SESSION_SECRET si está; si no, la credencial de servicio (estable entre reinicios).
const ingreso = crearIngreso({ catalogos, secreto: process.env.HYS_SESSION_SECRET || process.env.ODOO_PASSWORD || null });

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, Authorization");
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

/** Lee el cuerpo JSON con tope de tamaño (413 si se pasa). */
function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    const largo = Number(req.headers["content-length"] || 0);
    if (largo > MAX_CUERPO) return mal(new ErrorEntrada(413, demasiado()));
    const partes = []; let total = 0; let cortado = false;
    req.on("data", (c) => {
      if (cortado) return;
      total += c.length;
      if (total > MAX_CUERPO) { cortado = true; partes.length = 0; mal(new ErrorEntrada(413, demasiado())); return; }
      partes.push(c);
    });
    req.on("end", () => {
      if (cortado) return;
      try { ok(JSON.parse(Buffer.concat(partes).toString("utf8"))); }
      catch (e) { mal(new ErrorEntrada(400, "El cuerpo no es JSON válido")); }
    });
    req.on("error", () => mal(new ErrorEntrada(400, "Error leyendo el envío")));
  });
}
const demasiado = () => `El envío pesa más de ${Math.round(MAX_CUERPO / 1048576)} MB (fotos muy grandes). Sacá menos fotos o de menor tamaño.`;

/** Error de Odoo/entrada → respuesta JSON sin credenciales ni traceback. */
function responderError(res, e, que) {
  if (e instanceof ErrorEntrada) return json(res, e.estado, { error: e.message, ...e.extra }, e.estado === 413 ? { Connection: "close" } : {});
  if (e instanceof ErrorOdoo) {
    log(`${que}: error de Odoo`, e.tipo || "", (e.detalle || e.message).slice(0, 300));
    if (e.deDatos) return json(res, 422, { error: `Odoo rechazó el registro: ${(e.detalle || "datos inválidos").split("\n")[0].slice(0, 200)}` });
    return json(res, 502, { error: "No se pudo hablar con Odoo. Probá de nuevo en un rato." });
  }
  log(`${que}: error`, e?.name || "error", String(e?.message || "").slice(0, 200));
  return json(res, 500, { error: "Error interno" });
}

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
    if (ruta === "/api/v1/inspectores" && req.method === "GET") {
      try {
        const r = await catalogos.leerInspectores();
        return json(res, 200, r.lista, { "X-Fuente": r.fuente });
      } catch (e) { return responderError(res, e, "inspectores"); }
    }
    if (ruta === "/api/v1/hitos" && req.method === "GET") {
      const ot = Number(new URL(req.url, "http://x").searchParams.get("ot"));
      if (!Number.isInteger(ot) || ot <= 0) return json(res, 400, { error: "Falta ?ot=<id de la obra>" });
      try { return json(res, 200, await catalogos.leerHitos(ot)); }
      catch (e) { return responderError(res, e, "hitos"); }
    }
    if (ruta === "/api/v1/ingreso" && req.method === "POST") {
      try {
        const cuerpo = await leerCuerpo(req);
        const r = await ingreso.ingresar(cuerpo || {});
        log(`ingreso: inspector ${r.inspector.id}`);
        return json(res, 200, r);
      } catch (e) {
        if (e instanceof ErrorIngreso) { log(`ingreso: rechazado (${e.codigo})`); return json(res, e.estado, { error: e.message, codigo: e.codigo }); }
        return responderError(res, e, "ingreso");
      }
    }
    if (ruta === "/api/v1/inspecciones" && req.method === "POST") {
      try {
        const sesion = ingreso.verificar(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
        if (!sesion) { req.resume(); return json(res, 401, { error: "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.", codigo: "sesion" }); }
        const cuerpo = await leerCuerpo(req);
        const r = await inspecciones.recibir(cuerpo, { claveCabecera: req.headers["idempotency-key"] || null, sesion });
        log(`inspecciones: ${r.estado === 201 ? "creada" : "repetida"} id ${r.cuerpo.id}${r.cuerpo.descartados?.length ? ` · descartados ${r.cuerpo.descartados.join(", ")}` : ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) {
        if (e instanceof ErrorEntrada && e.estado === 413) req.resume();
        return responderError(res, e, "inspecciones");
      }
    }
    if (ruta === "/") return json(res, 200, { servicio: "hys-carga-api",
      endpoints: ["GET /healthz", "GET /api/v1/obras", "GET /api/v1/inspectores", "GET /api/v1/hitos?ot=<id>", "POST /api/v1/ingreso", "POST /api/v1/inspecciones"] });
    return json(res, 404, { error: "No existe" });
  } catch (e) {
    log("error inesperado", e?.name || "error");
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
});

servidor.listen(PORT, () => log(`hys-carga-api escuchando en :${PORT} · etapas ${ETAPAS.join(" / ")} · orígenes ${ORIGENES.join(", ")}`));
