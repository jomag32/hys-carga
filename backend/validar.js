// Validación del POST /api/v1/inspecciones (misma regla que el celular, api/odoo.js validarInspeccion),
// más el filtrado por los campos que existen de verdad en Odoo (fields_get).

export const SELECCION_RESPUESTA = ["si", "no", "na"];
export const SELECCION_CRITICIDAD = ["critico", "mayor", "menor"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Campos que el celular NO puede fijar aunque existan en Odoo (los maneja Odoo o la oficina).
export const PROTEGIDOS_INSPECCION = new Set([
  "id", "x_name", "x_fecha_recepcion", "x_validacion_estado", "x_validacion_comentario", "x_validacion_fecha",
  "x_validacion_solicitada", "x_validacion_vencida", "x_validador_id", "x_asignado_id", "x_linea_ids"]);
export const PROTEGIDOS_LINEA = new Set(["id", "x_inspeccion_id"]);

const sel = (campos, k) => (campos[k]?.selection || []).map(([v]) => v);
const esFecha = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v);

/**
 * cuerpo = {formulario, idempotency_key, odoo: {model, method, vals}, contexto}
 * campos = {inspeccion: fields_get, linea: fields_get}
 * → {errores: [{campo, mensaje}], vals (solo campos válidos), descartados: ["campo", "x_linea_ids[].campo"]}
 */
export function validarYFiltrar(cuerpo, campos, { claveCabecera } = {}) {
  const errores = [];
  const mal = (campo, mensaje) => errores.push({ campo, mensaje });
  const descartados = new Set();
  if (!cuerpo || typeof cuerpo !== "object") return { errores: [{ campo: "cuerpo", mensaje: "Cuerpo inválido" }], vals: null, descartados: [] };
  if (cuerpo.formulario !== "F02") mal("formulario", "Por ahora solo se recibe F02");
  if (cuerpo.odoo?.model !== "x_hys_inspeccion" || cuerpo.odoo?.method !== "create") mal("odoo", "Se espera {model: 'x_hys_inspeccion', method: 'create', vals}");
  const v = cuerpo.odoo?.vals;
  if (!v || typeof v !== "object") { mal("odoo.vals", "Faltan los valores"); return { errores, vals: null, descartados: [] }; }

  const ci = campos.inspeccion, cl = campos.linea;
  // --- reglas (iguales a las del celular)
  const clave = v.x_idempotency_key;
  if (!UUID.test(clave || "")) mal("x_idempotency_key", "Clave de envío inválida");
  if (cuerpo.idempotency_key && cuerpo.idempotency_key !== clave) mal("idempotency_key", "No coincide con x_idempotency_key");
  if (claveCabecera && claveCabecera !== clave) mal("Idempotency-Key", "La cabecera no coincide con x_idempotency_key");
  if (v.x_formulario !== "F02") mal("x_formulario", "Tiene que ser F02");
  if (!sel(ci, "x_ambito").includes(v.x_ambito)) mal("x_ambito", "Ámbito inválido");
  if (!sel(ci, "x_tipo_programa").includes(v.x_tipo_programa)) mal("x_tipo_programa", "Tipo inválido");
  if (v.x_ambito === "obra" && !Number.isInteger(v.x_ot_id)) mal("x_ot_id", "Falta la OT (obligatoria si el ámbito es Obra)");
  if (v.x_tipo_programa === "hito_critico" && !Number.isInteger(v.x_hito_id)) mal("x_hito_id", "Falta el hito (obligatorio en inicio de hito crítico)");
  if (!Number.isInteger(v.x_inspector_id)) mal("x_inspector_id", "Falta el inspector");
  if (!v.x_tc_nombre) mal("x_tc_nombre", "Falta quién toma conocimiento");
  if (!v.x_tc_firma) mal("x_tc_firma", "Falta la firma");
  if (!esFecha(v.x_fecha_hora_control)) mal("x_fecha_hora_control", "Falta la fecha y hora del control (UTC «AAAA-MM-DD HH:MM:SS»)");
  if (v.x_gps_fecha && !esFecha(v.x_gps_fecha)) mal("x_gps_fecha", "Fecha del GPS inválida");
  if (ci.x_gps_estado && !sel(ci, "x_gps_estado").includes(v.x_gps_estado)) mal("x_gps_estado", "Estado de GPS inválido");
  if (v.x_gps_estado === "ok" && (typeof v.x_gps_lat !== "number" || typeof v.x_gps_lon !== "number")) mal("x_gps_lat", "GPS ok sin coordenadas");
  if (!v.x_cargado_por) mal("x_cargado_por", "Falta quién cargó");
  if (v.x_estado !== undefined && !sel(ci, "x_estado").includes(v.x_estado)) mal("x_estado", "Estado inválido");
  if (v.x_origen !== undefined && !sel(ci, "x_origen").includes(v.x_origen)) mal("x_origen", "Origen inválido");

  // --- cabecera: solo campos que existen en Odoo, se pueden escribir y no están protegidos
  const vals = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "x_linea_ids") continue;
    if (!ci[k] || ci[k].readonly || PROTEGIDOS_INSPECCION.has(k)) { descartados.add(k); continue; }
    vals[k] = limpiarBinario(ci[k], x);
  }

  // --- líneas [0, 0, {...}]
  const lineas = Array.isArray(v.x_linea_ids) ? v.x_linea_ids : [];
  if (!lineas.length) mal("x_linea_ids", "Al menos un ítem");
  vals.x_linea_ids = [];
  lineas.forEach((c, i) => {
    const l = Array.isArray(c) && c[0] === 0 && c[1] === 0 && c[2] && typeof c[2] === "object" ? c[2] : null;
    if (!l) return mal(`x_linea_ids[${i}]`, "Comando inválido (se espera [0, 0, {...}])");
    if (!l.x_name || !l.x_bloque) mal(`x_linea_ids[${i}]`, "Ítem sin texto o bloque");
    if (!SELECCION_RESPUESTA.includes(l.x_respuesta)) mal(`x_linea_ids[${i}].x_respuesta`, `Sin responder: ${l.x_name || i + 1}`);
    if (l.x_respuesta === "no") {
      if (!SELECCION_CRITICIDAD.includes(l.x_criticidad)) mal(`x_linea_ids[${i}].x_criticidad`, `Falta la gravedad: ${l.x_name}`);
      if (!l.x_foto) mal(`x_linea_ids[${i}].x_foto`, `Falta la foto: ${l.x_name}`);
    }
    const out = {};
    for (const [k, x] of Object.entries(l)) {
      if (!cl[k] || cl[k].readonly || PROTEGIDOS_LINEA.has(k)) { descartados.add(`x_linea_ids[].${k}`); continue; }
      out[k] = limpiarBinario(cl[k], x);
    }
    vals.x_linea_ids.push([0, 0, out]);
  });
  return { errores, vals, descartados: [...descartados] };
}

/** Imágenes: base64 sin el prefijo «data:...;base64,». */
function limpiarBinario(campo, x) {
  if (campo.type === "binary" && typeof x === "string" && x.startsWith("data:")) return x.slice(x.indexOf(",") + 1);
  return x;
}
