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
    x_que_paso: e.que_paso, x_testigos: e.testigos || false, x_foto: e.foto || false,
    x_reportado_por: e.reportado_por, x_estado: "registrado",
    x_fecha_recepcion: utc(recepcion),
    x_cargado_en_plazo: recepcion - new Date(e.fecha_hora) <= PLAZO_HORAS * 3600e3,
    x_idempotency_key: idempotencyKey || false
  };
}
