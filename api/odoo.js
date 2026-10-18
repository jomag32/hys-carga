// Acceso a datos y capa de envío de hys-carga.
//
// Dos interruptores en api/config.js:
//   · CONFIG.MODO_ENVIO ("simulado" | "backend") → cómo se manda la Inspección de obra (F02):
//       - "simulado": sin red; se valida el payload, se guarda en la lista local «enviados»
//         (localStorage "hys_enviados_simulados") y se ve en el panel ?dev=1.
//       - "backend": POST CONFIG.API_BASE + "/inspecciones" al backend FUTURO de hys-carga en
//         Render, que valida, aplica la idempotencia y llama a Odoo con la cuenta de servicio MIA
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

// ---------------------------------------------------------------- Usuarios de carga (D-04 revisada)
// Lista FIJA de texto en hys-carga (no en Odoo): datos/usuarios.json = [{id, nombre, rol, obras, activo}].
// En este repo público hay solo ejemplos; la lista real NO se sube acá (ver README). Más adelante
// la sirve el backend de Render desde un lugar privado (misma forma de datos).
const CLAVE_USUARIOS = "hys_usuarios_cache";

export async function leerListaUsuarios() {
  try {
    const r = await fetch(CONFIG.USUARIOS_URL, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lista = await r.json();
    localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(lista)); // copia para entrar sin señal
    return lista;
  } catch (e) {
    const copia = JSON.parse(localStorage.getItem(CLAVE_USUARIOS) || "null");
    if (copia) return copia;
    throw new Error("No se pudo leer la lista de usuarios (¿sin señal la primera vez?)");
  }
}

/** Usuarios activos habilitados en una obra (id de OT o "planta"). */
export async function leerUsuariosLocales(obraId) {
  const lista = await leerListaUsuarios();
  // obras: ids de project.project (o "planta"); "*" = habilitado en todas (p. ej. HyS).
  return lista.filter((u) => u.activo !== false && (u.obras || []).some((o) => o === "*" || String(o) === String(obraId)))
    .map(({ id, nombre, rol }) => ({ id, nombre, rol }));
}

// ---------------------------------------------------------------- Obras «en obra» (selector de F02)
// D-05 (17/10/2026 18:54): el repo es público → los nombres reales de proyectos y clientes NUNCA se
// suben a GitHub. En producción los sirve el backend: GET /api/v1/obras, que consulta Odoo con la
// cuenta de servicio MIA. Criterio propuesto (relevado en Odoo el 17/10/2026, solo lectura):
//   project.project con stage_id.name = "EN PROGRESO", is_template = False (y active = True).
// Respuesta esperada: [{id, name, ot, partner_id, user_id}] (ot = número de OT sacado del nombre).
// En modo simulado se lee CONFIG.OBRAS_URLS (ejemplos; obras.local.json solo en la compu de prueba).
const CLAVE_OBRAS = "hys_obras_cache";
let obrasCache = null;

export async function listarObrasActivas() {
  if (obrasCache) return obrasCache;
  let obras = null;
  try {
    if (CONFIG.MODO_ENVIO === "backend") obras = await llamar("/obras");
    else {
      for (const url of CONFIG.OBRAS_URLS) {
        const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
        if (r?.ok) { obras = await r.json(); break; }
      }
    }
    if (!Array.isArray(obras)) throw new Error("sin lista de obras");
    localStorage.setItem(CLAVE_OBRAS, JSON.stringify({ fecha: new Date().toISOString(), obras }));
  } catch (e) {
    obras = JSON.parse(localStorage.getItem(CLAVE_OBRAS) || "null")?.obras; // copia para usar sin señal
    if (!obras) throw new Error("No se pudo leer la lista de obras (¿sin señal la primera vez?)");
  }
  obrasCache = obras.map((o) => ({ ...o, ot: o.ot ?? numeroOt(o.name) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  return obrasCache;
}

/** "OT 9101 - X", "0T-9101-X", "OT.9101 X" → "9101". */
export function numeroOt(nombre = "") {
  const m = String(nombre).match(/\b[O0]T[\s.\-]*(\d{3,5})/i);
  return m ? m[1] : null;
}

/** Turnos (x_turno de x_hys_ats; a definir por la empresa, §7.4 #7). */
export async function leerTurnos() {
  if (CONFIG.MOCK) return clonar(M.TURNOS);
  return llamar("/turnos");
}

/** Error con código HTTP, para que la cola distinga "sin señal" de "rechazado". */
export class ErrorApi extends Error {
  constructor(mensaje, estado, detalle) { super(mensaje); this.estado = estado; this.detalle = detalle; }
  get reintentable() { return !this.estado || this.estado >= 500 || this.estado === 429; }
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
// romper el create con un campo que no existe. x_cargado_por es char y TODAVÍA NO EXISTE en Odoo
// (se crea cuando Jorge lo indique): hasta entonces el backend tiene que quitarlo o crearlo antes.
// x_estado está en el diseño §2.8 (requerido, por defecto «programada»): a confirmar que esté creado.
export const CAMPOS_INSPECCION = [
  "x_formulario", "x_ambito", "x_tipo_programa", "x_estado", "x_ot_id", "x_hito_id", "x_inspector_id",
  "x_tc_nombre", "x_tc_firma", "x_tc_observaciones", "x_fecha_hora_control",
  "x_gps_lat", "x_gps_lon", "x_gps_precision_m", "x_gps_fecha", "x_gps_estado",
  "x_origen", "x_idempotency_key", "x_cargado_por", "x_linea_ids"
];
export const CAMPOS_PENDIENTES_EN_ODOO = ["x_cargado_por"];
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
  if (vals.x_tipo_programa === "hito_critico" && !Number.isInteger(vals.x_hito_id)) mal("x_hito_id", "Falta el hito (obligatorio en inicio de hito crítico)");
  if (!Number.isInteger(vals.x_inspector_id)) mal("x_inspector_id", "Falta el inspector");
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
export async function enviarFormulario(endpoint, cuerpo, { idempotencyKey } = {}) {
  if (endpoint === "/inspecciones") {
    const errores = validarInspeccion(cuerpo.odoo.vals);
    if (errores.length) throw new ErrorApi(errores.map((x) => x.mensaje).join(" · "), 422, errores);
  }
  if (CONFIG.MODO_ENVIO === "backend") return llamar(endpoint, cuerpo, idempotencyKey);
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
    const n = lista.filter((x) => x.endpoint === `POST ${CONFIG.API_BASE}${endpoint}`).length + 1;
    const respuesta = { odoo_model: cuerpo.odoo.model, odoo_id: n, name: `INS-2026-${String(n).padStart(5, "0")}`, simulado: true };
    lista.unshift({ idempotency_key: clave, endpoint: `POST ${CONFIG.API_BASE}${endpoint}`, recibido: new Date().toISOString(),
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

// ---------------------------------------------------------------- modo real (backend Render, futuro)
// /inspecciones sigue el diseño §5.5. Los endpoints genéricos /registros/... de los otros
// formularios son provisorios. Se ajustan al armar el backend.

async function llamar(ruta, cuerpo, idempotencyKey) {
  const cabeceras = { "Content-Type": "application/json" };
  if (idempotencyKey) cabeceras["Idempotency-Key"] = idempotencyKey;
  const token = localStorage.getItem("hys_token_sesion");
  if (token) cabeceras.Authorization = `Bearer ${token}`; // token de la persona; NUNCA credenciales de Odoo/MIA
  let r;
  try {
    r = await fetch(CONFIG.API_BASE + ruta, {
      method: cuerpo === undefined ? "GET" : "POST",
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
  } catch (e) {
    throw new ErrorApi("Sin conexión con el servidor", 0);
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(datos.mensaje || `Error ${r.status}`, r.status, datos.errores);
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
  x_item_id: "x_hys_item_plantilla", x_hito_id: "project.milestone"
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
    if (clave && db._idem[clave]) return db._idem[clave]; // reintento: misma respuesta (200)
    // Validación que en producción hace el backend (422): una Ficha por OT (§2.5).
    if (modelo === "x_hys_ficha" && db.x_hys_ficha.some((f) => (Array.isArray(f.x_ot_id) ? f.x_ot_id[0] : f.x_ot_id) === valores.x_ot_id)) {
      throw new ErrorApi("Esta OT ya tiene Ficha de Riesgos: se edita en Odoo", 422);
    }
    const reg = this.insertar(db, modelo, valores);
    const resp = { odoo_model: modelo, odoo_id: reg.id, name: reg.x_name || String(reg.id) };
    if (clave) db._idem[clave] = resp;
    this.guardar(db);
    return resp;
  },
  async escribir(modelo, ids, valores, clave) {
    await demora();
    if (sinSenal()) throw new ErrorApi("Sin señal", 0); // simulación de falta de señal (solo MOCK)
    const db = this.db();
    if (clave && db._idem[clave]) return db._idem[clave];
    const regs = (db[modelo] || []).filter((r) => ids.includes(r.id));
    if (!regs.length) throw new ErrorApi("El registro no existe", 404);
    if (modelo === "x_hys_desvio" && valores.x_estado === "cerrado" && !valores.x_foto_cierre) {
      throw new ErrorApi("Sin foto del arreglo, el desvío no está cerrado", 422); // R-CIE-1 (§3.6)
    }
    regs.forEach((r) => Object.assign(r, aliviarImagenes(valores), { x_fecha_recepcion: new Date().toISOString() }));
    const resp = { odoo_model: modelo, odoo_id: regs[0].id, name: regs[0].x_name || String(regs[0].id) };
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
