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
