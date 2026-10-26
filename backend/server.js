// hys-carga-api · backend mínimo de hys-carga (Node 20, sin dependencias).
//
// D-05 (17/10/2026): el repo es PÚBLICO. Los nombres reales de obras y clientes los sirve este
// backend desde Odoo con la cuenta de servicio MIA; la credencial vive SOLO en variables de entorno
// de Render (ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD). Nunca va al código ni a los logs.
//
// Endpoints:
//   GET  /healthz                 → {ok:true} (no toca Odoo)
//   GET  /api/v1/obras            → (sesión) [{id, name, ot, partner, director}] obras en curso (caché 5 min)
//   GET  /api/v1/inspectores      → [{id, nombre, legajo, tipo, empresa}] de x_hys_inspector activos (caché 5 min)
//   GET  /api/v1/fichas[?ot=<id>] → (sesión) fichas F01 activas [{id, nombre, ot, estado, clase, motivo, riesgos, hitos, …}];
//                                   con ?ot= la de esa OT o null
//   GET  /api/v1/hitos?ot=<id>    → (sesión) hitos de la ficha activa de la OT (x_hys_ficha_hito; ya no project.milestone)
//   POST /api/v1/ingreso          → {inspector_id, clave} → token de sesión (contraseña por inspector, ver ingreso.js)
//   POST /api/v1/inspecciones     → (Authorization: Bearer <token>) create de x_hys_inspeccion + líneas (idempotente; 201 nuevo, 200 repetido)
//   GET  /api/v1/obras?para=f01   → (sesión) igual que /obras pero con obras NO INICIADAS además de EN PROGRESO / PAUSADO
//   GET  /api/v1/riesgos          → (sesión) riesgos activos de x_hys_riesgo [{id, codigo, nombre, gravedad}] para el F01
//   POST /api/v1/fichas           → (sesión) create de x_hys_ficha (BORRADOR) + hitos; 201 nueva, 200 repetida, 409 si la OT ya tiene Ficha
//   GET  /api/v1/inspecciones/catalogo?formulario=F03|F04[&lugar=] → (sesión) ítems, sectores, toma de conocimiento y aviso del período
//   GET  /api/v1/ats/catalogo     → (sesión) F08: sectores, turnos, controles por sector y personas del sector (caché 5 min)
//   GET  /api/v1/ats?sector=&fecha= → (sesión) ATS de ese sector y día (aviso «ya hay ATS para este turno»)
//   GET  /api/v1/ats/:id/pdf      → (sesión) PDF imprimible del ATS (reporte de Odoo); encargado solo su sector
//   POST /api/v1/ats              → (sesión) create de x_hys_ats + controles + tareas; 201 nuevo, 200 repetido, 409 si el turno ya tiene ATS válido

import http from "node:http";
import { crearCliente, ErrorOdoo } from "./odoo.js";
import { armarObras } from "./obras.js";
import { crearCatalogos } from "./catalogos.js";
import { crearInspecciones, ErrorEntrada } from "./inspecciones.js";
import { crearIngreso, ErrorIngreso } from "./ingreso.js";
import { crearAltaFichas, ETAPAS_FICHA } from "./fichas-alta.js";
import { crearAts } from "./ats.js";
import { crearEventos } from "./eventos.js";
import { crearVencimientos } from "./vencimientos.js";
import { crearDesvios } from "./desvios.js";

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
const altaFichas = crearAltaFichas(cliente, catalogos);
const ats = crearAts(cliente, { catalogos });
const eventos = crearEventos(cliente);
const vencimientos = crearVencimientos(cliente);
const desvios = crearDesvios(cliente);
// Firma de sesiones: HYS_SESSION_SECRET si está; si no, la credencial de servicio (estable entre reinicios).
const ingreso = crearIngreso({ catalogos, secreto: process.env.HYS_SESSION_SECRET || process.env.ODOO_PASSWORD || null });

// ---------------------------------------------------------------- obras (caché en memoria)
// «curso»: etapas OBRAS_ETAPAS (ingreso, F02). «f01»: además NO INICIADAS (la Ficha se carga al crear la OT).
const caches = { curso: { obras: null, hasta: 0, fecha: null }, f01: { obras: null, hasta: 0, fecha: null } };
const enCursoObras = {};

function dominioObras(tipo) {
  const base = [["active", "=", true], ["is_template", "=", false]];
  if (tipo === "curso") return [["stage_id.name", "in", ETAPAS], ...base];
  const ors = ETAPAS_FICHA.map((e) => ["stage_id.name", "=ilike", `${e}%`]);
  return [...Array(ors.length - 1).fill("|"), ...ors, ...base];
}

async function leerObras(tipo = "curso") {
  const c = caches[tipo];
  if (c.obras && Date.now() < c.hasta) return { obras: c.obras, origen: "cache", fecha: c.fecha };
  enCursoObras[tipo] ??= (async () => {
    try {
      const regs = await cliente().ejecutar("project.project", "search_read", [dominioObras(tipo)],
        { fields: ["id", "name", "partner_id", "user_id"], order: "id" });
      caches[tipo] = { obras: armarObras(regs), hasta: Date.now() + CACHE_MS, fecha: new Date().toISOString() };
      return { obras: caches[tipo].obras, origen: "odoo", fecha: caches[tipo].fecha };
    } finally { enCursoObras[tipo] = null; }
  })();
  return enCursoObras[tipo];
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
const sesionDe = (req) => ingreso.verificar(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
const sinSesion = (res) => json(res, 401, { error: "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.", codigo: "sesion" });

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

    // Catálogos con datos de obras (nombres de proyectos y clientes): solo con sesión de inspector.
    // /api/v1/inspectores queda abierto porque es la lista para ingresar.
    const SESION_GET = ["/api/v1/obras", "/api/v1/fichas", "/api/v1/hitos", "/api/v1/riesgos", "/api/v1/ats", "/api/v1/ats/catalogo", "/api/v1/inspecciones/catalogo"];
    if (req.method === "GET" && SESION_GET.includes(ruta) && !sesionDe(req)) return sinSesion(res);

    if (ruta === "/api/v1/obras" && req.method === "GET") {
      const tipo = new URL(req.url, "http://x").searchParams.get("para") === "f01" ? "f01" : "curso";
      try {
        const { obras, origen, fecha } = await leerObras(tipo);
        return json(res, 200, obras, { "X-Origen": origen, "X-Actualizado": fecha || "" });
      } catch (e) {
        log("obras: error", e instanceof ErrorOdoo ? e.message : e?.name || "error");
        const c = caches[tipo];
        if (c.obras) return json(res, 200, c.obras, { "X-Origen": "cache-vencida", "X-Actualizado": c.fecha });
        return json(res, 502, { error: "No se pudo leer la lista de obras desde Odoo. Probá de nuevo en un rato." });
      }
    }
    if (ruta === "/api/v1/riesgos" && req.method === "GET") {
      try { return json(res, 200, await catalogos.listarRiesgos()); }
      catch (e) { return responderError(res, e, "riesgos"); }
    }
    if (ruta === "/api/v1/fichas" && req.method === "POST") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        const cuerpo = await leerCuerpo(req);
        const r = await altaFichas.recibir(cuerpo, { sesion });
        log(`fichas: ${r.estado === 201 ? "creada" : "repetida"} id ${r.cuerpo.id} ${r.cuerpo.name || ""}${r.cuerpo.descartados?.length ? ` · descartados ${r.cuerpo.descartados.join(", ")}` : ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) {
        if (e instanceof ErrorEntrada && e.estado === 409) log("fichas: rechazada, la OT ya tiene ficha");
        if (e instanceof ErrorEntrada && e.estado === 413) req.resume();
        return responderError(res, e, "fichas");
      }
    }
    if (ruta === "/api/v1/inspecciones/catalogo" && req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      const f = q.get("formulario");
      if (!["F03", "F04"].includes(f)) return json(res, 422, { error: "formulario tiene que ser F03 o F04" });
      try { return json(res, 200, await inspecciones.catalogo(f, q.get("lugar"))); }
      catch (e) { return responderError(res, e, "inspecciones-catalogo"); }
    }
    if (ruta === "/api/v1/ats/catalogo" && req.method === "GET") {
      try { return json(res, 200, await ats.catalogo()); }
      catch (e) { return responderError(res, e, "ats-catalogo"); }
    }
    if (ruta === "/api/v1/ats" && req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      try { return json(res, 200, await ats.delDia(q.get("sector"), q.get("fecha"))); }
      catch (e) { return responderError(res, e, "ats"); }
    }
    const mPdf = ruta.match(/^\/api\/v1\/ats\/(\d+)\/pdf$/);
    if (mPdf && req.method === "GET") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) return sinSesion(res);
        const { pdf, nombre } = await ats.pdf(Number(mPdf[1]), { sesion });
        log(`ats-pdf: id ${mPdf[1]} (${pdf.length} bytes)`);
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" });
        return res.end(pdf);
      } catch (e) { return responderError(res, e, "ats-pdf"); }
    }
    if (ruta === "/api/v1/ats" && req.method === "POST") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        const cuerpo = await leerCuerpo(req);
        const r = await ats.recibir(cuerpo, { sesion });
        if (r.cuerpo?.id) { const g = await desvios.generarSeguro("ats", r.cuerpo.id); if (g.creados?.length) { r.cuerpo.desvios_creados = g.creados.length; log(`desvios: ${g.creados.length} creados (ats ${r.cuerpo.id})`); } }
        log(`ats: ${r.estado === 201 ? "creado" : "repetido"} id ${r.cuerpo.id} ${r.cuerpo.name || ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) {
        if (e instanceof ErrorEntrada && e.estado === 409) log("ats: rechazado, el turno ya tiene ATS");
        if (e instanceof ErrorEntrada && e.estado === 413) req.resume();
        return responderError(res, e, "ats");
      }
    }
    // F05 · evento (crean todos los que ingresan; en Odoo lo leen solo HyS/JP/Desarrollo/Lectura F05)
    if (ruta === "/api/v1/eventos/catalogo" && req.method === "GET") {
      if (!sesionDe(req)) return sinSesion(res);
      try { return json(res, 200, await eventos.catalogo()); } catch (e) { return responderError(res, e, "eventos-catalogo"); }
    }
    if (ruta === "/api/v1/eventos" && req.method === "POST") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        const r = await eventos.recibir(await leerCuerpo(req), { sesion });
        log(`eventos: ${r.estado === 201 ? "creado" : "repetido"} id ${r.cuerpo.id} ${r.cuerpo.name || ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) { if (e instanceof ErrorEntrada && e.estado === 413) req.resume(); return responderError(res, e, "eventos"); }
    }
    // F06 · vencimientos legales (ver y cargar: solo HyS — responsable / inspector / desarrollo)
    if (ruta === "/api/v1/vencimientos" && req.method === "GET") {
      const sesion = sesionDe(req);
      if (!sesion) return sinSesion(res);
      try { await vencimientos.autorizar(sesion); return json(res, 200, await vencimientos.listar()); } catch (e) { return responderError(res, e, "vencimientos-listar"); }
    }
    if (ruta === "/api/v1/vencimientos" && req.method === "POST") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        try { await vencimientos.autorizar(sesion); } catch (e) { req.resume(); throw e; }
        const r = await vencimientos.recibir(await leerCuerpo(req), { sesion });
        log(`vencimientos: ${r.estado === 201 ? "creada" : "repetida"} id ${r.cuerpo.id} ${r.cuerpo.name || ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) { if (e instanceof ErrorEntrada && e.estado === 413) req.resume(); return responderError(res, e, "vencimientos"); }
    }
    // F07 · desvíos abiertos y cierre (solo HyS, como vencimientos)
    if (ruta === "/api/v1/desvios" && req.method === "GET") {
      const sesion = sesionDe(req);
      if (!sesion) return sinSesion(res);
      try { await desvios.autorizar(sesion); return json(res, 200, await desvios.listar()); } catch (e) { return responderError(res, e, "desvios-listar"); }
    }
    const mCierre = /^\/api\/v1\/desvios\/(\d+)\/cierre$/.exec(ruta);
    if (mCierre && req.method === "POST") {
      try {
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        try { await desvios.autorizar(sesion); } catch (e) { req.resume(); throw e; }
        const r = await desvios.cerrar(Number(mCierre[1]), await leerCuerpo(req), { sesion });
        log(`desvios: cierre ${r.cuerpo.repetido ? "repetido" : "ok"} id ${r.cuerpo.id} ${r.cuerpo.name || ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) { if (e instanceof ErrorEntrada && e.estado === 413) req.resume(); return responderError(res, e, "desvios-cierre"); }
    }
    if (ruta === "/api/v1/inspectores" && req.method === "GET") {
      try {
        const r = await catalogos.leerInspectores();
        return json(res, 200, r.lista, { "X-Fuente": r.fuente });
      } catch (e) { return responderError(res, e, "inspectores"); }
    }
    if (ruta === "/api/v1/fichas" && req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams.get("ot");
      try {
        if (q === null || q === "") return json(res, 200, await catalogos.leerFichas());
        const ot = Number(q);
        if (!Number.isInteger(ot) || ot <= 0) return json(res, 400, { error: "?ot=<id de la obra> inválido" });
        return json(res, 200, await catalogos.fichaDeOt(ot)); // null = la OT no tiene ficha activa
      } catch (e) { return responderError(res, e, "fichas"); }
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
        const sesion = sesionDe(req);
        if (!sesion) { req.resume(); return sinSesion(res); }
        const cuerpo = await leerCuerpo(req);
        const r = await inspecciones.recibir(cuerpo, { claveCabecera: req.headers["idempotency-key"] || null, sesion });
        if (r.cuerpo?.id && !r.cuerpo.simulado) { const g = await desvios.generarSeguro("inspeccion", r.cuerpo.id); if (g.creados?.length) { r.cuerpo.desvios_creados = g.creados.length; log(`desvios: ${g.creados.length} creados (inspeccion ${r.cuerpo.id})`); } }
        log(`inspecciones: ${r.estado === 201 ? "creada" : "repetida"} id ${r.cuerpo.id}${r.cuerpo.descartados?.length ? ` · descartados ${r.cuerpo.descartados.join(", ")}` : ""}`);
        return json(res, r.estado, r.cuerpo);
      } catch (e) {
        if (e instanceof ErrorEntrada && e.estado === 413) req.resume();
        return responderError(res, e, "inspecciones");
      }
    }
    if (ruta === "/") return json(res, 200, { servicio: "hys-carga-api",
      endpoints: ["GET /healthz", "GET /api/v1/obras", "GET /api/v1/inspectores", "GET /api/v1/fichas[?ot=<id>]", "GET /api/v1/hitos?ot=<id>", "GET /api/v1/riesgos", "POST /api/v1/ingreso", "POST /api/v1/inspecciones", "GET /api/v1/inspecciones/catalogo?formulario=F03|F04", "POST /api/v1/fichas", "GET /api/v1/ats/catalogo", "GET /api/v1/ats?sector=&fecha=", "POST /api/v1/ats", "GET /api/v1/ats/:id/pdf", "GET /api/v1/eventos/catalogo", "POST /api/v1/eventos", "GET /api/v1/vencimientos", "POST /api/v1/vencimientos", "GET /api/v1/desvios", "POST /api/v1/desvios/:id/cierre"] });
    return json(res, 404, { error: "No existe" });
  } catch (e) {
    log("error inesperado", e?.name || "error");
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
});

servidor.listen(PORT, () => log(`hys-carga-api escuchando en :${PORT} · etapas ${ETAPAS.join(" / ")} · orígenes ${ORIGENES.join(", ")}`));
