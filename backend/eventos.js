// F05 (Registro de accidente o incidente) → x_hys_evento. Validación y armado puros (sin red).
// Decisiones de Jorge (25/10/2026): aviso telefónico a HyS OBLIGATORIO si hay lesión (con o sin baja),
// con hora del aviso; «Dónde» = lista fija (Obra con OT · sector de Fábrica · Oficina), sin texto libre.
// Datos de salud: en Odoo, lectura restringida a HyS (218) y Desarrollo (216); el resto solo crea.
import { SECTORES_FABRICA } from "./planta.js";

export const TIPOS_EVENTO = ["baja", "sinbaja", "incidente", "casi", "condicion"];
export const LESIONES = ["manos", "ojos", "cabeza", "espalda", "pies", "otra"];
export const AMBITOS = ["obra", "fabrica", "oficina"];
export const PLAZO_HORAS = 24;
const conLesion = (t) => t === "baja" || t === "sinbaja";
const fecha = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };

/** Devuelve lista de errores (vacía = válido). ahora: Date (inyectable para tests). */
export function validarEvento(e, ahora = new Date()) {
  const err = [];
  if (!TIPOS_EVENTO.includes(e.tipo)) err.push("tipo");
  const f = fecha(e.fecha_hora);
  if (!f) err.push("fecha_hora"); else if (f.getTime() > ahora.getTime() + 5 * 60e3) err.push("fecha_hora_futura");
  if (!AMBITOS.includes(e.ambito)) err.push("ambito");
  if (e.ambito === "obra" && !(Number(e.ot_id) > 0)) err.push("ot_id");
  if (e.ambito === "fabrica" && !SECTORES_FABRICA.some(([k]) => k === e.sector)) err.push("sector");
  if (!String(e.que_paso || "").trim()) err.push("que_paso");
  if (!String(e.reportado_por || "").trim()) err.push("reportado_por");
  if (conLesion(e.tipo)) {
    if (!LESIONES.includes(e.lesion_parte)) err.push("lesion_parte");
    if (!String(e.atencion || "").trim()) err.push("atencion");
    if (e.tipo === "baja" && !(Number(e.dias_baja) >= 1)) err.push("dias_baja");
    if (e.aviso_telefonico !== true) err.push("aviso_telefonico");
    const fa = fecha(e.aviso_hora);
    if (e.aviso_telefonico === true && (!fa || (f && fa < f))) err.push("aviso_hora");
  }
  return err;
}

/** Valores para x_hys_evento. Fechas en UTC «AAAA-MM-DD HH:MM:SS». */
export function armarEvento(e, { recepcion = new Date(), idempotencyKey } = {}) {
  const utc = (d) => new Date(d).toISOString().slice(0, 19).replace("T", " ");
  const lesion = conLesion(e.tipo);
  return {
    x_tipo: e.tipo, x_fecha_hora: utc(e.fecha_hora), x_ambito: e.ambito,
    x_ot_id: e.ambito === "obra" ? Number(e.ot_id) : false,
    x_sector: e.ambito === "fabrica" ? e.sector : false,
    x_persona_id: Number(e.persona_id) || false, x_persona_externa: e.persona_externa || false,
    x_lesion_parte: lesion ? e.lesion_parte : false, x_atencion: lesion ? e.atencion : false,
    x_dias_baja: e.tipo === "baja" ? Number(e.dias_baja) : 0,
    x_aviso_telefonico: lesion ? true : e.aviso_telefonico === true,
    x_aviso_hora: lesion && e.aviso_hora ? utc(e.aviso_hora) : false,
    x_aviso_a: e.aviso_a || false,
    x_que_paso: e.que_paso, x_testigos: e.testigos || false, x_foto: typeof e.foto === "string" && e.foto.startsWith("data:") ? e.foto.slice(e.foto.indexOf(",") + 1) : e.foto || false,
    x_reportado_por: e.reportado_por, x_estado: "registrado",
    x_fecha_recepcion: utc(recepcion),
    x_cargado_en_plazo: recepcion - new Date(e.fecha_hora) <= PLAZO_HORAS * 3600e3,
    x_idempotency_key: idempotencyKey || false
  };
}

// ---------------------------------------------------------------- servicio (POST /api/v1/eventos, GET /api/v1/eventos/catalogo)
import { ErrorEntrada } from "./inspecciones.js";
import { textoInspector } from "./catalogos.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAJES = { tipo: "Elegí el tipo de evento", fecha_hora: "Falta la fecha y hora", fecha_hora_futura: "La fecha no puede ser futura",
  ambito: "Elegí dónde pasó (Obra, sector de Fábrica u Oficina)", ot_id: "Falta la OT", sector: "Elegí un sector de Fábrica de la lista",
  que_paso: "Contá qué pasó", reportado_por: "Falta quién lo reporta", lesion_parte: "Elegí la parte lesionada", atencion: "Falta la atención recibida",
  dias_baja: "Los días de baja tienen que ser 1 o más", aviso_telefonico: "Con lesión, el aviso telefónico a HyS es obligatorio",
  aviso_hora: "Falta la hora del aviso (no puede ser anterior al evento)" };
const GPS_EST = ["ok", "denegado", "sin_posicion", "no_disponible"];

/** Campos GPS/control comunes (vienen del celular en cuerpo.control). */
export function camposGps(ctrl = {}) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : false);
  const f = (s) => { const d = new Date(s); return s && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace("T", " ") : false; };
  return { x_gps_lat: num(ctrl.gps_lat), x_gps_lon: num(ctrl.gps_lon), x_gps_precision_m: num(ctrl.gps_precision_m), x_gps_fecha: f(ctrl.gps_fecha),
    x_gps_estado: GPS_EST.includes(ctrl.gps_estado) ? ctrl.gps_estado : "no_disponible", x_fecha_hora_control: f(ctrl.fecha_hora_control) };
}

export function crearEventos(cliente, { ahora = () => new Date() } = {}) {
  const ej = (...a) => cliente().ejecutar(...a);
  const porClave = new Map(); const enCurso = new Map();
  let empleados = null, hasta = 0;
  let cola = Promise.resolve();
  const enSerie = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };
  async function catalogo() {
    if (!empleados || Date.now() > hasta) {
      const r = await ej("hr.employee", "search_read", [[["active", "=", true]]], { fields: ["id", "name"], order: "name" });
      empleados = r.map((e) => ({ id: e.id, nombre: e.name })); hasta = Date.now() + 5 * 60e3;
    }
    return { empleados, sectores: SECTORES_FABRICA, plazo_horas: PLAZO_HORAS };
  }
  const leerInsp = async (id) => (await ej("x_hys_inspector", "search_read", [[["id", "=", id], ["x_active", "=", true]]],
    { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa", "x_rol", "x_sector"], limit: 1 }))[0] || null;
  const resp = async (id, extra = {}) => {
    const r = (await ej("x_hys_evento", "read", [[id]], { fields: ["x_name", "x_cargado_en_plazo"] }))[0] || {};
    return { odoo_model: "x_hys_evento", odoo_id: id, id, name: r.x_name || null, cargado_en_plazo: !!r.x_cargado_en_plazo, ...extra };
  };
  async function recibir(cuerpo, { sesion = null } = {}) {
    if (!Number.isInteger(sesion?.inspector_id)) throw new ErrorEntrada(401, "Tu sesión venció: volvé a ingresar.");
    const clave = cuerpo?.idempotency_key;
    if (!UUID.test(clave || "")) throw new ErrorEntrada(422, "Clave de envío inválida");
    if (porClave.has(clave)) return { estado: 200, cuerpo: await resp(porClave.get(clave), { repetido: true }) };
    if (enCurso.has(clave)) return enCurso.get(clave);
    const p = (async () => {
      const d = cuerpo?.datos || {};
      const errores = validarEvento(d, ahora());
      if (errores.length) throw new ErrorEntrada(422, errores.map((e) => MENSAJES[e] || e).join(" · "), { errores });
      const cargador = await leerInsp(sesion.inspector_id);
      if (!cargador) throw new ErrorEntrada(422, "Quien carga ya no figura como activo en Odoo (HyS > Inspectores). Avisá a HyS.");
      return enSerie(async () => {
        const ya = (await ej("x_hys_evento", "search_read", [[["x_idempotency_key", "=", clave]]], { fields: ["id"], limit: 1 }))[0];
        if (ya) { porClave.set(clave, ya.id); return { estado: 200, cuerpo: await resp(ya.id, { repetido: true }) }; }
        const txt = [textoInspector(cargador), cargador.x_rol === "encargado" ? "Encargado de sector" : "Inspector HyS", "hys-carga"].join(" · ").slice(0, 250);
        const vals = { x_name: "/", ...armarEvento(d, { recepcion: ahora(), idempotencyKey: clave }), ...camposGps(cuerpo.control), x_cargado_por: txt };
        const r = await ej("x_hys_evento", "create", [[vals]]);
        const id = Array.isArray(r) ? r[0] : r;
        porClave.set(clave, id);
        return { estado: 201, cuerpo: await resp(id) };
      });
    })().finally(() => enCurso.delete(clave));
    enCurso.set(clave, p);
    return p;
  }
  return { catalogo, recibir };
}
