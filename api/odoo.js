// Acceso a datos de Odoo (modelos x_hys_*, project.project, hr.employee) para hys-carga.
//
// Dos modos, según CONFIG.MOCK (api/config.js):
//   · MOCK = true  → implementación en memoria + localStorage, con datos ficticios (datos-mock.js).
//   · MOCK = false → fetch al backend de hys-carga en Render. El backend valida, aplica la
//     idempotencia y escribe en Odoo con la ÚNICA cuenta de servicio (JSON-2:
//     /json/2/<modelo>/create | search_read | write). La API key de Odoo vive solo en el
//     servidor; el celular manda el token de sesión de la persona, nunca la API key.
//
// Formato de "dominio" igual que Odoo: [["campo", "operador", valor], ...] (todas con AND).
// Los one2many se mandan con comandos de Odoo: [[0, 0, {valores}], ...] (crear anidado).

import { CONFIG } from "./config.js";
import * as M from "./datos-mock.js";

// ---------------------------------------------------------------- API pública

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

/** Usuarios locales de hys-carga para una obra (o "planta"). No son usuarios de Odoo. */
export async function leerUsuariosLocales(obraId) {
  if (CONFIG.MOCK) return clonar(M.USUARIOS_LOCALES[obraId] || []);
  return llamar(`/usuarios-locales?obra=${encodeURIComponent(obraId)}`);
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

// ---------------------------------------------------------------- modo real (backend Render)
// Los endpoints genéricos /registros/... son provisorios: el contrato del diseño (§5.5) define
// endpoints por formulario (/inspecciones, /eventos, /ats, ...). Se ajusta al armar el backend.

async function llamar(ruta, cuerpo, idempotencyKey) {
  const cabeceras = { "Content-Type": "application/json" };
  if (idempotencyKey) cabeceras["Idempotency-Key"] = idempotencyKey;
  const token = localStorage.getItem("hys_token_sesion");
  if (token) cabeceras.Authorization = `Bearer ${token}`; // token de la persona, NO la API key de Odoo
  let r;
  try {
    r = await fetch(CONFIG.BACKEND_URL + ruta, {
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

const CLAVE_DB = "hys_mock_db";

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
  x_item_id: "x_hys_item_plantilla"
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
      if (g) return g;
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
    if (!navigator.onLine || localStorage.getItem("hys_simular_sin_senal") === "1") {
      throw new ErrorApi("Sin señal (simulado)", 0);
    }
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
    if (!navigator.onLine || localStorage.getItem("hys_simular_sin_senal") === "1") {
      throw new ErrorApi("Sin señal (simulado)", 0);
    }
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
