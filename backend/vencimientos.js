// F06 (Carga de vencimiento legal) → x_hys_vencimiento_carga + actualiza x_hys_control_legal.
// Decisión de Jorge (25/10/2026): el estado de los vencimientos lo ve TODO el personal (lectura);
// cargar sigue siendo de HyS. Semáforo y alertas se calculan acá (y en Odoo con acción programada).
export const ESTADOS_VEN = ["vigente", "vencido", "sin_protocolo"];
export const DIAS_AVISO = [30, 15, 7, 0]; // alertas antes del vencimiento (propuesta, configurable)

export function validarVencimiento(v, hoy = new Date().toISOString().slice(0, 10)) {
  const err = [];
  if (!(Number(v.control_id) > 0)) err.push("control_id");
  if (!ESTADOS_VEN.includes(v.estado)) err.push("estado");
  if (v.estado === "vigente") {
    if (!v.fecha_vence) err.push("fecha_vence");
    else if (v.fecha_vence <= hoy) err.push("fecha_vence_pasada");
    if (v.fecha_servicio && v.fecha_vence && v.fecha_vence <= v.fecha_servicio) err.push("fecha_vence_anterior");
    if (!v.protocolo) err.push("protocolo");
  }
  return err;
}

export function armarVencimiento(v, { idempotencyKey } = {}) {
  return {
    carga: { x_control_id: Number(v.control_id), x_estado: v.estado, x_fecha_servicio: v.fecha_servicio || false,
      x_fecha_vence: v.fecha_vence || false, x_proveedor: v.proveedor || false, x_protocolo: v.protocolo || false,
      x_protocolo_nombre: v.protocolo_nombre || false, x_idempotency_key: idempotencyKey || false },
    control: { x_estado: v.estado, x_fecha_servicio: v.fecha_servicio || false, x_fecha_vence: v.fecha_vence || false, x_proveedor: v.proveedor || false }
  };
}

const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/** Semáforo de un control: rojo (vencido/sin protocolo), amarillo (≤30 días), verde. */
export function semaforo(control, hoy = new Date().toISOString().slice(0, 10)) {
  if (control.x_estado !== "vigente" || !control.x_fecha_vence) return { color: "rojo", dias: null };
  const d = dias(hoy, control.x_fecha_vence);
  return { color: d < 0 ? "rojo" : d <= DIAS_AVISO[0] ? "amarillo" : "verde", dias: d };
}
/** ¿Toca alerta hoy? (exactamente en alguno de DIAS_AVISO o vencido). */
export function tocaAlerta(control, hoy) {
  const s = semaforo(control, hoy);
  return s.dias === null ? false : DIAS_AVISO.includes(s.dias) || s.dias < 0;
}

// ---------------------------------------------------------------- servicio (GET/POST /api/v1/vencimientos)
import { ErrorEntrada } from "./inspecciones.js";
import { textoInspector } from "./catalogos.js";
import { camposGps } from "./eventos.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSJ = { control_id: "Elegí el control", estado: "Elegí el estado", fecha_vence: "Si está vigente, la fecha de vencimiento es obligatoria",
  fecha_vence_pasada: "Esa fecha ya pasó: cargalo como «Vencido»", fecha_vence_anterior: "El vencimiento tiene que ser posterior a la fecha de servicio",
  protocolo: "Si está vigente, el protocolo es obligatorio" };
const hoyAr = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const sinPrefijo = (b) => (typeof b === "string" && b.startsWith("data:") ? b.slice(b.indexOf(",") + 1) : b);

export function crearVencimientos(cliente, { ahora = () => new Date() } = {}) {
  const ej = (...a) => cliente().ejecutar(...a);
  const porClave = new Map();
  /** Lectura para todos los que ingresan (decisión 25/10/2026). */
  async function listar() {
    const r = await ej("x_hys_control_legal", "search_read", [[]], { fields: ["id", "x_name", "x_referencia", "x_donde", "x_periodicidad", "x_prioridad",
      "x_estado", "x_fecha_servicio", "x_fecha_vence", "x_proveedor"], order: "x_prioridad, x_name" });
    const hoy = hoyAr(ahora());
    return { hoy, dias_aviso: DIAS_AVISO, controles: r.map((c) => ({ id: c.id, nombre: c.x_name, referencia: c.x_referencia || "", donde: c.x_donde || "",
      periodicidad: c.x_periodicidad || null, prioridad: c.x_prioridad || null, estado: c.x_estado || "sin_estado",
      fecha_servicio: c.x_fecha_servicio || null, fecha_vence: c.x_fecha_vence || null, proveedor: c.x_proveedor || "", ...semaforo(c, hoy) })) };
  }
  async function recibir(cuerpo, { sesion = null } = {}) {
    if (!Number.isInteger(sesion?.inspector_id)) throw new ErrorEntrada(401, "Tu sesión venció: volvé a ingresar.");
    const clave = cuerpo?.idempotency_key;
    if (!UUID.test(clave || "")) throw new ErrorEntrada(422, "Clave de envío inválida");
    const cargador = (await ej("x_hys_inspector", "search_read", [[["id", "=", sesion.inspector_id], ["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa", "x_rol"], limit: 1 }))[0];
    if (!cargador) throw new ErrorEntrada(422, "Quien carga ya no figura como activo en Odoo. Avisá a HyS.");
    if (cargador.x_rol === "encargado") throw new ErrorEntrada(403, "Los vencimientos legales los carga HyS. Vos podés verlos en «Vencimientos legales».");
    const ya = porClave.get(clave) || (await ej("x_hys_vencimiento_carga", "search_read", [[["x_idempotency_key", "=", clave]]], { fields: ["id"], limit: 1 }))[0]?.id;
    const resp = async (id, extra = {}) => ({ odoo_model: "x_hys_vencimiento_carga", odoo_id: id, id,
      name: (await ej("x_hys_vencimiento_carga", "read", [[id]], { fields: ["x_name"] }))[0]?.x_name || null, ...extra });
    if (ya) { porClave.set(clave, ya); return { estado: 200, cuerpo: await resp(ya, { repetido: true }) }; }
    const v = cuerpo?.datos || {};
    const err = validarVencimiento(v, hoyAr(ahora()));
    if (err.length) throw new ErrorEntrada(422, err.map((e) => MSJ[e] || e).join(" · "), { errores: err });
    const ctl = (await ej("x_hys_control_legal", "search_read", [[["id", "=", Number(v.control_id)]]], { fields: ["id"], limit: 1 }))[0];
    if (!ctl) throw new ErrorEntrada(422, "Ese control legal no existe en Odoo");
    const { carga, control } = armarVencimiento({ ...v, protocolo: sinPrefijo(v.protocolo) }, { idempotencyKey: clave });
    const txt = [textoInspector(cargador), "Inspector HyS", "hys-carga"].join(" · ").slice(0, 250);
    const r = await ej("x_hys_vencimiento_carga", "create", [[{ x_name: "/", ...carga, ...camposGps(cuerpo.control),
      x_fecha_recepcion: ahora().toISOString().slice(0, 19).replace("T", " "), x_cargado_por: txt }]]);
    const id = Array.isArray(r) ? r[0] : r;
    porClave.set(clave, id);
    await ej("x_hys_control_legal", "write", [[ctl.id], { ...control, x_ultima_carga_id: id,
      ...(carga.x_protocolo ? { x_protocolo: carga.x_protocolo, x_protocolo_nombre: carga.x_protocolo_nombre } : {}) }]);
    return { estado: 201, cuerpo: await resp(id) };
  }
  return { listar, recibir };
}
