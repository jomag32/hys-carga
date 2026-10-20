// Acceso a datos y capa de envío de hys-carga.
//
// Dos interruptores en api/config.js:
//   · CONFIG.MODO_ENVIO ("simulado" | "backend") → cómo se manda la Inspección de obra (F02):
//       - "simulado": sin red; se valida el payload, se guarda en la lista local «enviados»
//         (localStorage "hys_enviados_simulados") y se ve en el panel ?dev=1.
//       - "backend": POST CONFIG.API_V1 + "/inspecciones" al backend hys-carga-api, que valida, aplica la idempotencia y llama a Odoo con la cuenta de servicio MIA
//         (JSON-2: /json/2/x_hys_inspeccion/create con vals_list = [payload.odoo.vals]).
//   · CONFIG.MOCK → catálogos de ejemplo (datos-mock.js) y guardado local de F01, F03–F08.
//
// En el celular NO hay credenciales de Odoo ni de MIA, en ningún modo. El celular solo manda el
// token de sesión de la persona (cuando exista el login real, §7.4 #4).
//
// Formato de "dominio" igual que Odoo: [["campo", "operador", valor], ...] (todas con AND).
// Los one2many se mandan con comandos de Odoo: [[0, 0, {valores}], ...] (= (0, 0, {...}) en
// Python / Command.create): crea las líneas en la misma llamada, todo o nada (§5.2 punto 4).

import { CONFIG } from "./config.js";
import * as M from "./datos-mock.js";
import { leerSesion } from "../componentes/sesion.js";

// ---------------------------------------------------------------- API pública (catálogos y F01, F03–F08)

/** Crea un registro. Devuelve {odoo_model, odoo_id, name}. */
export async function crearRegistro(modelo, valores, { idempotencyKey } = {}) {
  if (CONFIG.MOCK) return mock.crear(modelo, valores, idempotencyKey);
  return llamar(`/registros/${modelo}`, { valores }, idempotencyKey);
}

/** Lee registros. dominio = [["campo","=",valor], ...]; campos = ["x_name", ...] o null (todos). */
export async function leerRegistros(modelo, dominio = [], campos = null, { limite = 0 } = {}) {
  if (CONFIG.MOCK) return mock.leer(modelo, dominio, campos, limite);
  return llamar(`/registros/${modelo}/buscar`, { dominio, campos, limite });
}

/** Escribe sobre registros existentes (p. ej. F07: cierre de un desvío). */
export async function escribirRegistro(modelo, ids, valores, { idempotencyKey } = {}) {
  if (CONFIG.MOCK) return mock.escribir(modelo, ids, valores, idempotencyKey);
  return llamar(`/registros/${modelo}/escribir`, { ids, valores }, idempotencyKey);
}

// ---------------------------------------------------------------- Quién ingresa (decisión de Jorge 18/10/2026 19:24)
// Pueden ingresar SOLO los inspectores activos de la tabla propia de HyS en Odoo (x_hys_inspector,
// x_active), los mismos de GET /api/v1/inspectores. Ya no hay lista fija de usuarios en el repo.
// Sin señal se usa la última lista leída (conCopia guarda copia en el celular).
// Con datos de ejemplo (?dev=1 o localhost) son inspectores de EJEMPLO y el envío es siempre simulado.
export const ROL_INGRESO = "Inspector HyS";
/** [{id, nombre, legajo, tipo, empresa, rol, fuente}] — id = x_hys_inspector. Todos habilitados en todas las obras. */
export const ROL_ENCARGADO = "Encargado de sector";
export async function leerUsuariosDeIngreso() {
  const lista = await leerTodosLosInspectores();
  return lista.map((e) => ({ id: e.id, nombre: e.nombre, legajo: e.legajo ?? null, tipo: e.tipo || "interno", empresa: e.empresa || null,
    rol: e.rol === "encargado" ? ROL_ENCARGADO : ROL_INGRESO, rol_hys: e.rol || "inspector", sector: e.sector || null, fuente: "x_hys_inspector" }));
}

// ---------------------------------------------------------------- Contraseña por inspector (Jorge 18/10/2026 19:34)
// POST /api/v1/ingreso {inspector_id, clave} → {token, vence}. Las contraseñas viven SOLO en el backend
// (variables de entorno de Render, por legajo). Para poder ingresar SIN SEÑAL, después de un ingreso con
// señal se guarda en este celular una huella (PBKDF2 con sal) de esa contraseña y el token: sin señal,
// la misma persona entra en el mismo celular con la misma contraseña. Nunca se guarda la contraseña.
const CLAVE_OFFLINE = "hys_ingresos_offline";
const normClave = (c) => String(c ?? "").normalize("NFC").trim(); // misma regla que el backend (ñ de Android/iPhone)

async function huella(clave, sal) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(sal), iterations: 150000 }, k, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
const leerOffline = () => { try { return JSON.parse(localStorage.getItem(CLAVE_OFFLINE) || "{}"); } catch (e) { return {}; } };

/** Ingresa a un inspector. → {token, vence, sinVerificar?}. Lanza ErrorApi con el mensaje para mostrar. */
export async function ingresarInspector(inspectorId, clave) {
  const c = normClave(clave);
  if (!c) throw new ErrorApi("Escribí tu contraseña.", 401);
  // Modo ejemplo (?dev=1 / localhost): no hay backend real; el envío es simulado igual.
  if (CONFIG.OBRAS_FUENTE !== "backend") return { token: null, vence: null, sinVerificar: true };
  let r = null, datos = null;
  try {
    r = await fetch(`${CONFIG.API_V1}/ingreso`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspector_id: inspectorId, clave: c }), signal: AbortSignal.timeout?.(CONFIG.OBRAS_TIMEOUT_MS) });
    datos = await r.json().catch(() => ({}));
  } catch (e) { r = null; }
  if (!r) {
    // Sin señal: solo si esta persona ya ingresó con señal en este celular y la contraseña coincide.
    const g = leerOffline()[inspectorId];
    if (!g) throw new ErrorApi("Sin señal. La primera vez en este celular hace falta señal para ingresar.", 0);
    if (g.vence && Date.parse(g.vence) < Date.now()) throw new ErrorApi("Sin señal y tu ingreso guardado venció. Ingresá con señal.", 0);
    if ((await huella(c, g.sal)) !== g.huella) throw new ErrorApi("Contraseña incorrecta.", 401);
    return { token: g.token, vence: g.vence, sinSenal: true };
  }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) { const o = leerOffline(); delete o[inspectorId]; localStorage.setItem(CLAVE_OFFLINE, JSON.stringify(o)); }
    throw new ErrorApi(datos?.error || `El servidor respondió con error ${r.status}`, r.status);
  }
  try {
    const sal = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const o = leerOffline();
    o[inspectorId] = { sal, huella: await huella(c, sal), token: datos.token, vence: datos.vence };
    localStorage.setItem(CLAVE_OFFLINE, JSON.stringify(o));
  } catch (e) { /* sin crypto.subtle o lleno: solo no habrá ingreso sin señal */ }
  return { token: datos.token, vence: datos.vence };
}

// ---------------------------------------------------------------- Obras «en obra» (selector de F02)
// D-05 (17/10/2026 18:54): el repo es público → los nombres reales de proyectos y clientes NUNCA se
// suben a GitHub. En producción los sirve el backend hys-carga-api: GET {API_BASE}/api/v1/obras, que
// consulta Odoo con la cuenta de servicio MIA (solo lectura): project.project activos, no plantilla,
// en etapa EN PROGRESO o PAUSADO, sin los proyectos llamados «VARIOS». Respuesta:
// [{id, name, ot, partner, director}] → acá se adapta a {id, name, ot, partner_id, user_id}.
// CONFIG.OBRAS_FUENTE = "ejemplo" (solo ?dev=1 o localhost) lee CONFIG.OBRAS_URLS.
// Si el backend no responde se usa la última lista REAL guardada en este celular (avisando la
// fecha); si no hay ninguna, error → el selector muestra «Reintentar». Nunca ejemplos en producción.
const CLAVE_OBRAS = `hys_obras_cache_${CONFIG.OBRAS_FUENTE}`;
// Dos listas: "" = obras en curso (ingreso, F02); "f01" = además NO INICIADAS (Ficha al crear la OT).
const obrasCache = new Map();
const obrasEnCurso = new Map();
/** De dónde salió la última lista: {origen: "backend"|"ejemplo"|"copia", fecha}. */
export const estadoObras = { origen: null, fecha: null };

/** GET de un catálogo del backend (con espera larga: el plan free de Render tarda en despertar).
 *  Obras, Fichas e hitos piden la sesión del inspector (Authorization: Bearer <token>). */
async function leerDelBackend(ruta) {
  let r;
  const token = leerSesion().usuario?.token;
  try {
    r = await fetch(`${CONFIG.API_V1}${ruta}`, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout?.(CONFIG.OBRAS_TIMEOUT_MS) });
  } catch (e) {
    throw new ErrorApi(e?.name === "TimeoutError" ? "El servidor tardó demasiado en responder" : "Sin conexión con el servidor", 0);
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(datos?.error || `El servidor respondió con error ${r.status}`, r.status);
  return datos;
}
const obrasDelBackend = (para = "") => leerDelBackend(para ? `/obras?para=${para}` : "/obras");

/** Lee un catálogo y guarda copia; sin señal usa la última copia REAL (nunca ejemplos en producción).
 *  Un 401 (sesión vencida) no usa la copia: hay que volver a ingresar. */
async function conCopia(clave, leer) {
  try {
    const v = await leer();
    guardarCopia(clave, v);
    return v;
  } catch (e) {
    const c = e?.estado === 401 ? null : leerCopia(clave);
    if (c) return c.v;
    throw e;
  }
}
const claveCopia = (clave) => `hys_cat_${CONFIG.OBRAS_FUENTE}_${clave}`;
function guardarCopia(clave, v) {
  try { localStorage.setItem(claveCopia(clave), JSON.stringify({ fecha: new Date().toISOString(), v })); } catch (e) { /* lleno */ }
}
function leerCopia(clave) {
  try { return JSON.parse(localStorage.getItem(claveCopia(clave)) || "null"); } catch (e) { return null; }
}

// ---------------------------------------------------------------- Inspectores y hitos (F02)
// Fuente = CONFIG.OBRAS_FUENTE (igual que las obras): "backend" → GET /api/v1/inspectores (modelo propio
// x_hys_inspector, «HyS > Inspectores»; NO empleados ni usuarios, decisión de Jorge 18/10/2026) y
// GET /api/v1/hitos?ot=<id> (Odoo vía MIA, solo lectura); "ejemplo" → datos-mock.js.
let inspectoresCache = null;
/** Inspectores HyS para elegir en F02/F03/F04 (sin los encargados de sector, que solo cargan F08). */
export async function leerInspectores() {
  return (await leerTodosLosInspectores()).filter((e) => e.rol !== "encargado");
}
/** [{id, nombre, legajo, tipo, empresa, rol, sector}] (id = x_hys_inspector), incluye encargados (para el ingreso). */
async function leerTodosLosInspectores() {
  if (inspectoresCache) return inspectoresCache;
  const lista = await conCopia("inspectores", async () => CONFIG.OBRAS_FUENTE === "backend"
    ? leerDelBackend("/inspectores")
    : M.EMPLEADOS.filter((e) => (e.x_mock_roles || []).includes("inspector"))
      .map((e) => ({ id: e.id, nombre: e.name, legajo: e.x_legajo ?? null, tipo: e.x_tipo || "interno", empresa: e.x_empresa || null })));
  if (!Array.isArray(lista)) throw new Error("La lista de inspectores llegó con otro formato");
  inspectoresCache = lista;
  return lista;
}

// ---------------------------------------------------------------- Ficha de Riesgos (F01) de la obra
// Producción: GET /api/v1/fichas?ot=<id> (x_hys_ficha activa de la OT, leída por MIA). Formato:
// {id, nombre, ot, estado, aprobada, clase, motivo, frecuencia_dias, modalidad, distancia_km, faltan_hitos,
//  aviso_ugeop, aviso, riesgos: [{codigo, nombre, gravedad}], hitos: [{id, name, riesgo_hys, critico,
//  inicio_previsto, inicio_real, alcanzado, situacion, riesgos: [códigos]}]} — o null si la OT no tiene Ficha.
// Sin señal: la copia de esa obra o la de la lista completa (se baja junto con las obras), la más nueva.
// Modo ejemplo: las fichas e hitos de datos-mock.js, convertidos al mismo formato.
const fichasCache = new Map();

function fichaDeEjemplo(otId) {
  const f = M.FICHAS.find((x) => x.x_ot_id[0] === otId);
  if (!f) return null;
  const riesgo = (id) => M.RIESGOS.find((r) => r.id === id);
  const hitos = M.HITOS.filter((x) => x.project_id[0] === otId).map((x) => ({ id: x.id, name: x.name, riesgo_hys: x.x_riesgo_hys,
    critico: x.x_riesgo_hys === "critico", inicio_previsto: null, inicio_real: null, alcanzado: false, situacion: null, riesgos: [] }));
  return { id: f.id, nombre: f.x_name, ot: otId, estado: f.x_estado, aprobada: f.x_estado === "aprobada", clase: f.x_clase_riesgo || "A",
    motivo: f.x_clase_motivo || null, frecuencia_dias: null, modalidad: null, distancia_km: f.x_distancia_km ?? null,
    faltan_hitos: false, aviso_ugeop: false, aviso: null,
    riesgos: (f.x_riesgo_ids || []).map(riesgo).filter(Boolean).sort((a, b) => a.x_secuencia - b.x_secuencia)
      .map((r) => ({ codigo: r.x_codigo, nombre: r.x_name, gravedad: r.x_gravedad || null })), hitos };
}

/** Ficha activa de la obra (o null = sin Ficha). Error solo si no hay señal y nunca se guardó copia. */
export async function leerFichaObra(otId) {
  if (fichasCache.has(otId)) return fichasCache.get(otId);
  let f;
  if (CONFIG.OBRAS_FUENTE !== "backend") f = fichaDeEjemplo(otId);
  else {
    try {
      f = await leerDelBackend(`/fichas?ot=${encodeURIComponent(otId)}`);
      guardarCopia(`ficha_${otId}`, f);
    } catch (e) {
      if (e?.estado === 401) throw e;
      const propia = leerCopia(`ficha_${otId}`), todas = leerCopia("fichas");
      const c = [propia && { fecha: propia.fecha, v: propia.v }, Array.isArray(todas?.v) && { fecha: todas.fecha, v: todas.v.find((x) => x.ot === otId) || null }]
        .filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
      if (!c) throw e;
      f = c.v;
    }
  }
  fichasCache.set(otId, f);
  return f;
}

/** Baja todas las Fichas activas y guarda copia (para usar sin señal). Se llama al leer las obras; no falla. */
function bajarFichas() {
  if (CONFIG.OBRAS_FUENTE !== "backend") return;
  leerDelBackend("/fichas").then((l) => { if (Array.isArray(l)) guardarCopia("fichas", l); }).catch(() => { /* sin señal: queda la copia anterior */ });
}

/** Hitos de la Ficha de la obra que puede abrir un «Inicio de hito crítico»: críticos y no terminados. */
export async function leerHitosObra(otId) {
  const f = await leerFichaObra(otId);
  return (f?.hitos || []).filter((x) => x.critico && !x.alcanzado && x.situacion !== "terminado");
}

/** Ítems F02 de la plantilla del protocolo (PR-HYS-001 v1, Diseño-App-HyS-plantilla-items): 6 generales +
 *  los de cada riesgo, con x_riesgo_codigo. Odoo todavía no tiene x_hys_item_plantilla: es contenido del
 *  protocolo, no datos de obra, así que es el mismo en producción y en ejemplo. */
export function itemsPlantillaF02() {
  const cod = new Map(M.RIESGOS.map((r) => [r.id, r.x_codigo]));
  return clonar(M.ITEMS_PLANTILLA).filter((it) => it.x_formulario === "F02" && it.x_active !== false)
    .map((it) => ({ ...it, x_riesgo_codigo: it.x_riesgo_id ? cod.get(it.x_riesgo_id[0]) || null : null }))
    .sort((a, b) => a.x_secuencia - b.x_secuencia);
}

async function obrasDeEjemplo() {
  for (const url of CONFIG.OBRAS_URLS) {
    const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
    if (r?.ok) return r.json();
  }
  return null;
}

const aM2o = (v) => (Array.isArray(v) ? v : v ? [null, v] : false);

export function listarObrasActivas(para = "") {
  if (obrasCache.has(para)) return Promise.resolve(obrasCache.get(para));
  const claveLs = CLAVE_OBRAS + (para ? `_${para}` : "");
  if (!obrasEnCurso.has(para)) obrasEnCurso.set(para, (async () => {
    let obras = null;
    try {
      obras = CONFIG.OBRAS_FUENTE === "backend" ? await obrasDelBackend(para) : await obrasDeEjemplo();
      if (!Array.isArray(obras)) throw new Error("La lista de obras llegó vacía o con otro formato");
      Object.assign(estadoObras, { origen: CONFIG.OBRAS_FUENTE, fecha: new Date().toISOString() });
      bajarFichas(); // copia de las Fichas para trabajar sin señal
      try { localStorage.setItem(claveLs, JSON.stringify({ fecha: estadoObras.fecha, obras })); } catch (e) { /* lleno */ }
    } catch (e) {
      const copia = JSON.parse(localStorage.getItem(claveLs) || "null"); // última lista real, para usar sin señal
      if (!copia?.obras?.length) throw e;
      obras = copia.obras;
      Object.assign(estadoObras, { origen: "copia", fecha: copia.fecha });
    }
    const lista = obras.map((o) => ({
      ...o, ot: o.ot ?? numeroOt(o.name),
      partner_id: o.partner_id ?? aM2o(o.partner), user_id: o.user_id ?? aM2o(o.director)
    })).sort((a, b) => (a.ot == null) - (b.ot == null) || Number(a.ot) - Number(b.ot) || String(a.name).localeCompare(String(b.name), "es"));
    obrasCache.set(para, lista);
    return lista;
  })().finally(() => { obrasEnCurso.delete(para); }));
  return obrasEnCurso.get(para);
}

// ---------------------------------------------------------------- F01: riesgos y fichas (formato del backend)
/** Riesgos activos [{id, codigo, nombre, gravedad}]. Producción: GET /api/v1/riesgos (ids reales de Odoo). */
export async function leerRiesgosF01() {
  if (CONFIG.OBRAS_FUENTE !== "backend") return M.RIESGOS.filter((r) => r.x_active !== false)
    .map((r) => ({ id: r.id, codigo: r.x_codigo, nombre: r.x_name, gravedad: r.x_gravedad || null }));
  return conCopia("riesgos", () => leerDelBackend("/riesgos"));
}
/** Fichas activas [{id, nombre, ot, estado}] para el control «esta OT ya tiene Ficha». Producción: GET /api/v1/fichas (sin caché local). */
export async function leerFichasF01() {
  if (CONFIG.OBRAS_FUENTE !== "backend") return M.FICHAS.map((f) => ({ id: f.id, nombre: f.x_name, ot: f.x_ot_id[0], estado: f.x_estado }));
  return conCopia("fichas", () => leerDelBackend("/fichas"));
}

/** "OT 9101 - X", "0T-9101-X", "OT.9101 X" → "9101". */
export function numeroOt(nombre = "") {
  const m = String(nombre).match(/\b[O0]T[\s.\-]*(\d{3,5})/i);
  return m ? m[1] : null;
}

/** Turnos de ATS (x_hys_turno), del catálogo F08. */
export async function leerTurnos() {
  return (await leerCatalogoAts()).turnos;
}

/** Catálogo F08 (GET /api/v1/ats/catalogo, con sesión): sectores, turnos, controles por sector y personas. */
// Producción (OBRAS_FUENTE "backend"): siempre el catálogo real, con copia para sin señal; nunca ejemplos.
export async function leerCatalogoAts() {
  if (CONFIG.OBRAS_FUENTE !== "backend") {
    const ctl = (f) => M.ITEMS_PLANTILLA.filter((i) => i.x_formulario === f && i.x_active !== false).map((i) => ({
      codigo: i.x_codigo, nombre: i.x_name, bloque: i.x_bloque, critico: !!i.x_critico,
      admite_na: !M.ATS_SIN_NA.includes(i.x_codigo), secuencia: i.x_secuencia, version: i.x_version }));
    const pers = M.EMPLEADOS.map((e) => ({ id: e.id, nombre: e.name, puesto: e.job_title || "" }));
    return clonar({ sectores: [["deposito", "Depósito Central"], ["logistica", "Logística y Mantenimiento"]], turnos: M.TURNOS,
      controles: { F08_DEP: ctl("F08_DEP"), F08_LOG: ctl("F08_LOG") }, personas: { deposito: pers, logistica: pers }, min_justificacion_na: 10 });
  }
  const cat = await conCopia("ats-catalogo", () => leerDelBackend("/ats/catalogo"));
  // El backend manda sectores como {codigo, nombre, plantilla}; la vista usa pares [codigo, nombre].
  return { ...cat, sectores: (cat.sectores || []).map((s) => (Array.isArray(s) ? s : [s.codigo, s.nombre])) };
}

/** ATS ya cargados para ese sector y día (aviso «ya hay ATS para este turno»). Sin red o en MOCK: []. */
export async function leerAtsDelDia(sector, fecha) {
  if (CONFIG.OBRAS_FUENTE !== "backend") return [];
  try { return await leerDelBackend(`/ats?sector=${encodeURIComponent(sector)}&fecha=${encodeURIComponent(fecha)}`); }
  catch (e) { if (e.estado === 0) return []; throw e; }
}

/** Error con código HTTP, para que la cola distinga "sin señal" de "rechazado". */
export class ErrorApi extends Error {
  constructor(mensaje, estado, detalle) { super(mensaje); this.estado = estado; this.detalle = detalle; }
  // 401 = sesión vencida o contraseña cambiada: queda pendiente hasta que la persona vuelva a ingresar.
  get reintentable() { return !this.estado || this.estado >= 500 || this.estado === 429 || this.estado === 401; }
}

// ---------------------------------------------------------------- F02 · x_hys_inspeccion
// Selecciones tal cual el modelo creado en Odoo (x_hys_inspeccion / x_hys_inspeccion_linea).
export const SELECCION = {
  x_formulario: [["F02", "Inspección de obra"], ["F03", "Recorrida semanal de Fábrica"], ["F04", "Check mensual de instalaciones"]],
  x_ambito: [["obra", "Obra"], ["fabrica", "Fábrica"], ["oficina", "Oficina"]],
  x_tipo_programa: [
    ["periodica", "Periódica por clase"], ["hito_critico", "Inicio de hito crítico (72 h)"], ["apertura", "Apertura de obra"],
    ["recorrida_semanal", "Recorrida semanal"], ["check_mensual", "Check mensual"], ["fuera_programa", "Fuera de programa"]],
  x_estado: [["programada", "Programada"], ["realizada", "Realizada"], ["cancelada", "Cancelada"]],
  x_origen: [["programa", "Programa"], ["hito", "Hito"], ["formulario", "Formulario externo"], ["manual", "Manual en Odoo"]],
  x_gps_estado: [["ok", "Capturado"], ["denegado", "Permiso denegado"], ["sin_posicion", "Sin posición / tiempo agotado"], ["no_disponible", "Navegador sin geolocalización"]],
  x_respuesta: [["si", "Sí"], ["no", "No"], ["na", "N/A"]],
  x_criticidad: [["critico", "Crítico"], ["mayor", "Mayor"], ["menor", "Menor"]]
};

// Campos que el payload manda a Odoo. Cualquier otro campo se rechaza antes de salir, para no
// romper el create con un campo que no existe. x_cargado_por (char) existe en Odoo desde el
// 18/10/2026 (studio_customization.hys_field_inspeccion__x_cargado_por); x_estado también.
// El backend vuelve a filtrar contra fields_get y avisa en «descartados» lo que no exista.
export const CAMPOS_INSPECCION = [
  "x_formulario", "x_ambito", "x_tipo_programa", "x_estado", "x_ot_id", "x_ficha_hito_id", "x_inspector_hys_id",
  "x_hito_id", // project.milestone: solo envíos viejos que siguen en la cola (desde 18/10/2026 se usa x_ficha_hito_id)
  "x_tc_nombre", "x_tc_firma", "x_firma_inspector", "x_tc_observaciones", "x_fecha_hora_control",
  "x_gps_lat", "x_gps_lon", "x_gps_precision_m", "x_gps_fecha", "x_gps_estado",
  "x_origen", "x_idempotency_key", "x_cargado_por", "x_linea_ids"
];
export const CAMPOS_PENDIENTES_EN_ODOO = [];
export const CAMPOS_LINEA = ["x_name", "x_bloque", "x_item_codigo", "x_secuencia", "x_respuesta", "x_criticidad", "x_foto", "x_comentario"];
const CAMPOS_FECHA = ["x_fecha_hora_control", "x_gps_fecha"];

const valoresDe = (campo) => SELECCION[campo].map(([v]) => v);

/** Pasa valores "de formulario" al formato que espera Odoo: fechas UTC "AAAA-MM-DD HH:MM:SS", imágenes en base64 sin prefijo. */
export function aFormatoOdoo(vals) {
  const out = {};
  for (const [k, v] of Object.entries(vals)) {
    if (CAMPOS_FECHA.includes(k) && typeof v === "string") out[k] = fechaOdoo(v);
    else if (typeof v === "string" && v.startsWith("data:")) out[k] = v.slice(v.indexOf(",") + 1);
    else if (k === "x_linea_ids" && Array.isArray(v)) out[k] = v.map(([a, b, l]) => [a, b, aFormatoOdoo(l)]);
    else out[k] = v;
  }
  return out;
}
/** "2026-10-17T21:46:00.000Z" o "2026-10-17T18:46:00-03:00" → "2026-10-17 21:46:00" (UTC, como guarda Odoo los datetime). */
export function fechaOdoo(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toISOString().slice(0, 19).replace("T", " ");
}

/** Valida el payload como lo hará el backend (422). Devuelve [{campo, mensaje}] (vacío = ok). */
export function validarInspeccion(vals) {
  const e = [];
  const mal = (campo, mensaje) => e.push({ campo, mensaje });
  for (const k of Object.keys(vals)) if (!CAMPOS_INSPECCION.includes(k)) mal(k, "Campo que no está en x_hys_inspeccion");
  if (vals.x_formulario !== "F02") mal("x_formulario", "Tiene que ser F02");
  if (!valoresDe("x_ambito").includes(vals.x_ambito)) mal("x_ambito", "Ámbito inválido");
  if (!valoresDe("x_tipo_programa").includes(vals.x_tipo_programa)) mal("x_tipo_programa", "Tipo inválido");
  if (vals.x_ambito === "obra" && !Number.isInteger(vals.x_ot_id)) mal("x_ot_id", "Falta la OT (obligatoria si el ámbito es Obra)");
  if (vals.x_tipo_programa === "hito_critico" && !Number.isInteger(vals.x_ficha_hito_id) && !Number.isInteger(vals.x_hito_id)) mal("x_ficha_hito_id", "Falta el hito (obligatorio en inicio de hito crítico)");
  if (!Number.isInteger(vals.x_inspector_hys_id)) mal("x_inspector_hys_id", "Falta el inspector");
  if (!vals.x_tc_nombre) mal("x_tc_nombre", "Falta quién toma conocimiento");
  if (!vals.x_tc_firma) mal("x_tc_firma", "Falta la firma");
  if (!vals.x_fecha_hora_control) mal("x_fecha_hora_control", "Falta la fecha y hora del control");
  if (!valoresDe("x_gps_estado").includes(vals.x_gps_estado)) mal("x_gps_estado", "Estado de GPS inválido");
  if (vals.x_gps_estado === "ok" && (typeof vals.x_gps_lat !== "number" || typeof vals.x_gps_lon !== "number")) mal("x_gps_lat", "GPS ok sin coordenadas");
  if (!/^[0-9a-f-]{36}$/i.test(vals.x_idempotency_key || "")) mal("x_idempotency_key", "Clave de envío inválida");
  if (!vals.x_cargado_por) mal("x_cargado_por", "Falta quién cargó");
  const lineas = vals.x_linea_ids || [];
  if (!lineas.length) mal("x_linea_ids", "Al menos un ítem");
  lineas.forEach((c, i) => {
    const l = Array.isArray(c) && c[0] === 0 && c[1] === 0 ? c[2] : null;
    if (!l) return mal(`x_linea_ids[${i}]`, "Comando inválido (se espera [0, 0, {...}])");
    for (const k of Object.keys(l)) if (!CAMPOS_LINEA.includes(k)) mal(`x_linea_ids[${i}].${k}`, "Campo que no está en x_hys_inspeccion_linea");
    if (!l.x_name || !l.x_bloque) mal(`x_linea_ids[${i}]`, "Ítem sin texto o bloque");
    if (!valoresDe("x_respuesta").includes(l.x_respuesta)) mal(`x_linea_ids[${i}].x_respuesta`, `Sin responder: ${l.x_name}`);
    if (l.x_respuesta === "no") {
      if (!valoresDe("x_criticidad").includes(l.x_criticidad)) mal(`x_linea_ids[${i}].x_criticidad`, `Falta la gravedad: ${l.x_name}`);
      if (!l.x_foto) mal(`x_linea_ids[${i}].x_foto`, `Falta la foto: ${l.x_name}`);
    }
  });
  return e;
}

/**
 * Envía un formulario a un endpoint del backend. cuerpo = {formulario, idempotency_key, odoo: {model, method, vals}, contexto}.
 * Devuelve {odoo_model, odoo_id, name, simulado?}.
 */
export async function enviarFormulario(endpoint, cuerpo, { idempotencyKey, token } = {}) {
  if (endpoint === "/inspecciones") {
    const errores = validarInspeccion(cuerpo.odoo.vals);
    if (errores.length) throw new ErrorApi(errores.map((x) => x.mensaje).join(" · "), 422, errores);
  }
  if (CONFIG.MODO_ENVIO === "backend") return llamar(endpoint, cuerpo, idempotencyKey, token);
  return simulado.enviar(endpoint, cuerpo, idempotencyKey);
}

// ---------------------------------------------------------------- modo de envío SIMULADO
const CLAVE_ENVIADOS = "hys_enviados_simulados";
export const sinSenal = () => !navigator.onLine || localStorage.getItem("hys_simular_sin_senal") === "1";

const simulado = {
  async enviar(endpoint, cuerpo, clave) {
    await demora(300);
    if (sinSenal()) throw new ErrorApi("Sin señal", 0);
    const lista = listarEnviadosSimulados();
    const ya = lista.find((x) => x.idempotency_key === clave);
    if (ya) return { ...ya.respuesta, repetido: true }; // mismo envío: misma respuesta (200), sin duplicar
    const n = lista.filter((x) => x.endpoint === `POST /api/v1${endpoint}`).length + 1;
    const respuesta = { odoo_model: cuerpo.odoo.model, odoo_id: n, name: endpoint === "/fichas" ? `FR-SIM-${String(n).padStart(4, "0")}` : endpoint === "/ats" ? `ATS-SIM-${String(n).padStart(5, "0")}` : `INS-2026-${String(n).padStart(5, "0")}`, simulado: true };
    lista.unshift({ idempotency_key: clave, endpoint: `POST /api/v1${endpoint}`, recibido: new Date().toISOString(),
      respuesta, cuerpo: recortarBase64(cuerpo) });
    try { localStorage.setItem(CLAVE_ENVIADOS, JSON.stringify(lista.slice(0, 30))); }
    catch (e) { localStorage.setItem(CLAVE_ENVIADOS, JSON.stringify(lista.slice(0, 5))); }
    return respuesta;
  }
};

/** Lista local de lo «enviado» en modo simulado (fotos y firmas recortadas). */
export function listarEnviadosSimulados() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ENVIADOS) || "[]"); } catch (e) { return []; }
}
export function borrarEnviadosSimulados() { localStorage.removeItem(CLAVE_ENVIADOS); }

/** Para mostrar: base64 largo → "iVBORw0KGgo…[base64 23 KB]". */
export function recortarBase64(o) {
  if (Array.isArray(o)) return o.map(recortarBase64);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recortarBase64(v)]));
  if (typeof o === "string" && o.length > 400 && /^[A-Za-z0-9+/=]+$/.test(o.slice(0, 400))) return `${o.slice(0, 24)}…[base64 ${Math.round(o.length * 0.75 / 1024)} KB]`;
  return o;
}

// ---------------------------------------------------------------- modo real (backend hys-carga-api)
// /inspecciones sigue el diseño §5.5. Los endpoints genéricos /registros/... de los otros
// formularios son provisorios. Se ajustan al armar el backend.

async function llamar(ruta, cuerpo, idempotencyKey, tokenEnvio = null) {
  const cabeceras = { "Content-Type": "application/json" };
  if (idempotencyKey) cabeceras["Idempotency-Key"] = idempotencyKey;
  const token = tokenEnvio || localStorage.getItem("hys_token_sesion");
  if (token) cabeceras.Authorization = `Bearer ${token}`; // token de la persona; NUNCA credenciales de Odoo/MIA
  let r;
  try {
    r = await fetch(CONFIG.API_V1 + ruta, {
      method: cuerpo === undefined ? "GET" : "POST",
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
  } catch (e) {
    throw new ErrorApi("Sin conexión con el servidor", 0);
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(datos.error || datos.mensaje || `Error ${r.status}`, r.status, datos.errores);
  return datos;
}

// ---------------------------------------------------------------- modo MOCK

const CLAVE_DB = "hys_mock_db_v2"; // v2: obras de ejemplo nuevas (D-05)

// one2many anidados → modelo hijo y campo inverso (como haría Odoo con Command.create).
const HIJOS = {
  "x_hys_inspeccion.x_linea_ids": ["x_hys_inspeccion_linea", "x_inspeccion_id"],
  "x_hys_inspeccion.x_desvio_ids": ["x_hys_desvio", "x_inspeccion_id"],
  "x_hys_ats.x_linea_ids": ["x_hys_ats_linea", "x_ats_id"],
  "x_hys_ats.x_tarea_ids": ["x_hys_ats_tarea", "x_ats_id"],
  "x_hys_ats.x_desvio_ids": ["x_hys_desvio", "x_ats_id"]
};

const M2O = {
  x_ot_id: "project.project", x_inspector_id: "hr.employee", x_persona_id: "hr.employee",
  x_encargado_id: "hr.employee", x_autoriza_id: "hr.employee", x_control_id: "x_hys_control_legal",
  x_item_id: "x_hys_item_plantilla", x_hito_id: "project.milestone", x_ficha_hito_id: "x_hys_ficha_hito", x_ficha_id: "x_hys_ficha"
};

// Secuencias de x_name (en Odoo las pone una regla "Al crear", §2.1).
const SECUENCIAS = {
  x_hys_inspeccion: (n) => `INS-2026-${String(n).padStart(5, "0")}`,
  x_hys_desvio: (n) => `D-${String(n).padStart(5, "0")}`,
  x_hys_evento: (n) => `EV-2026-${String(n).padStart(4, "0")}`,
  x_hys_ats: (n) => `ATS-2026-${String(n).padStart(5, "0")}`,
  x_hys_vencimiento_carga: (n) => `VEN-2026-${String(n).padStart(4, "0")}`
};

function semilla() {
  return {
    "project.project": clonar(M.OBRAS),
    "hr.employee": clonar(M.EMPLEADOS),
    "project.milestone": clonar(M.HITOS),
    x_hys_riesgo: clonar(M.RIESGOS),
    x_hys_item_plantilla: clonar(M.ITEMS_PLANTILLA),
    x_hys_control_legal: clonar(M.CONTROLES_LEGALES),
    x_hys_ficha: clonar(M.FICHAS),
    x_hys_desvio: clonar(M.DESVIOS),
    _idem: {} // idempotency_key → respuesta (lo que en producción guarda el backend, §5.2)
  };
}

const mock = {
  db() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_DB) || "null");
      if (g) { // base guardada de una versión anterior: se completan los catálogos nuevos
        const s = semilla(); let cambio = false;
        for (const k of Object.keys(s)) if (!(k in g)) { g[k] = s[k]; cambio = true; }
        if (cambio) this.guardar(g);
        return g;
      }
    } catch (e) { /* base corrupta: se regenera */ }
    const s = semilla();
    this.guardar(s);
    return s;
  },
  guardar(db) {
    try { localStorage.setItem(CLAVE_DB, JSON.stringify(db)); }
    catch (e) { console.warn("Mock: no se pudo guardar (¿localStorage lleno?)", e); }
  },
  siguienteId(db, modelo) {
    return (db[modelo] || []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  },
  insertar(db, modelo, valores) {
    db[modelo] = db[modelo] || [];
    const id = this.siguienteId(db, modelo);
    const reg = { id, ...aliviarImagenes(valores) };
    if (!reg.x_name && SECUENCIAS[modelo]) reg.x_name = SECUENCIAS[modelo](id);
    // many2one: Odoo recibe el id y devuelve [id, nombre]; el mock imita eso al guardar.
    for (const [campo, rel] of Object.entries(M2O)) {
      if (typeof reg[campo] === "number") {
        const r = (db[rel] || []).find((x) => x.id === reg[campo]);
        reg[campo] = [reg[campo], r ? r.name || r.x_name : String(reg[campo])];
      }
    }
    if (modelo === "x_hys_ficha" && !reg.x_name && Array.isArray(reg.x_ot_id)) reg.x_name = `FR-OT-${reg.x_ot_id[0]}`;
    if (modelo === "x_hys_desvio" && !reg.x_estado) reg.x_estado = "abierto";
    if (modelo.startsWith("x_hys_") && !reg.x_fecha_recepcion) reg.x_fecha_recepcion = new Date().toISOString();
    // Expandir comandos one2many [0, 0, vals]
    for (const [campo, v] of Object.entries(reg)) {
      const hijo = HIJOS[`${modelo}.${campo}`];
      if (hijo && Array.isArray(v)) {
        reg[campo] = v.filter((c) => Array.isArray(c) && c[0] === 0)
          .map((c) => this.insertar(db, hijo[0], { ...c[2], [hijo[1]]: [id, reg.x_name || String(id)] }).id);
      }
    }
    db[modelo].push(reg);
    return reg;
  },
  async crear(modelo, valores, clave) {
    await demora();
    if (sinSenal()) throw new ErrorApi("Sin señal", 0);
    const db = this.db();
    if (clave && db._idem[clave]) return { ...db._idem[clave], simulado: true }; // reintento: misma respuesta (200)
    // Validación que en producción hace el backend (422): una Ficha por OT (§2.5).
    if (modelo === "x_hys_ficha" && db.x_hys_ficha.some((f) => (Array.isArray(f.x_ot_id) ? f.x_ot_id[0] : f.x_ot_id) === valores.x_ot_id)) {
      throw new ErrorApi("Esta OT ya tiene Ficha de Riesgos: se edita en Odoo", 422);
    }
    const reg = this.insertar(db, modelo, valores);
    // simulado: true SIEMPRE — esto queda en el celular, no en Odoo (la pantalla no puede decir «Enviado a Odoo»).
    const resp = { odoo_model: modelo, odoo_id: reg.id, name: reg.x_name || String(reg.id), simulado: true };
    if (clave) db._idem[clave] = resp;
    this.guardar(db);
    return resp;
  },
  async escribir(modelo, ids, valores, clave) {
    await demora();
    if (sinSenal()) throw new ErrorApi("Sin señal", 0); // simulación de falta de señal (solo MOCK)
    const db = this.db();
    if (clave && db._idem[clave]) return { ...db._idem[clave], simulado: true };
    const regs = (db[modelo] || []).filter((r) => ids.includes(r.id));
    if (!regs.length) throw new ErrorApi("El registro no existe", 404);
    if (modelo === "x_hys_desvio" && valores.x_estado === "cerrado" && !valores.x_foto_cierre) {
      throw new ErrorApi("Sin foto del arreglo, el desvío no está cerrado", 422); // R-CIE-1 (§3.6)
    }
    regs.forEach((r) => Object.assign(r, aliviarImagenes(valores), { x_fecha_recepcion: new Date().toISOString() }));
    const resp = { odoo_model: modelo, odoo_id: regs[0].id, name: regs[0].x_name || String(regs[0].id), simulado: true };
    if (clave) db._idem[clave] = resp;
    this.guardar(db);
    return resp;
  },
  async leer(modelo, dominio, campos, limite) {
    await demora(60);
    let regs = (this.db()[modelo] || []).filter((r) => cumpleDominio(r, dominio));
    if (limite) regs = regs.slice(0, limite);
    return regs.map((r) => (campos ? Object.fromEntries(["id", ...campos].map((c) => [c, r[c] ?? false])) : clonar(r)));
  }
};

/** Para pruebas: vuelve la base mock a los datos iniciales. */
export function reiniciarMock() { localStorage.removeItem(CLAVE_DB); }

function cumpleDominio(reg, dominio) {
  return (dominio || []).every(([campo, op, valor]) => {
    let v = reg[campo];
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === "string" && !Array.isArray(valor)) v = v[0]; // many2one
    switch (op) {
      case "=": return v === valor || (valor === false && (v === undefined || v === null));
      case "!=": return v !== valor;
      case "in": return Array.isArray(v) ? v.some((x) => valor.includes(x)) : valor.includes(v);
      case "not in": return !valor.includes(v);
      case ">": return v > valor;
      case ">=": return v >= valor;
      case "<": return v < valor;
      case "<=": return v <= valor;
      case "ilike": return String(v || "").toLowerCase().includes(String(valor).toLowerCase());
      default: console.warn("Mock: operador no soportado", op); return true;
    }
  });
}

// En el mock no se guardan las fotos completas (llenarían localStorage): queda una marca.
function aliviarImagenes(valores) {
  const out = {};
  for (const [k, v] of Object.entries(valores)) {
    out[k] = typeof v === "string" && v.startsWith("data:") ? `[archivo ${Math.round(v.length * 0.75 / 1024)} KB]` : v;
  }
  return out;
}

const demora = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const clonar = (o) => JSON.parse(JSON.stringify(o));
