// Campos automáticos de control (diseño §1.3, §5.1, §5.2 y decisiones del 17/10/2026).
// Los toma el celular; nadie los escribe a mano:
//   · idempotency key: UUID v4 creado AL ABRIR el formulario (no al enviar); reintentos la reusan.
//   · fecha y hora del control: al tocar «Enviar», en ISO 8601 con zona -03:00.
//   · GPS (decisión D-03): se pide al cargar el formulario; viaja con lat, lon, precisión y
//     fecha de captura. Si se niega o no hay GPS, se envía igual con coordenadas vacías y una
//     marca (x_gps_estado) que explica por qué.
//   · quién cargó: usuario LOCAL de hys-carga (id, nombre y rol) de la obra elegida.
// La fecha de recepción (x_fecha_recepcion) la pone el backend, no el celular.

import { CONFIG } from "../api/config.js";
import { leerSesion } from "./sesion.js";

export function nuevaClaveIdempotencia() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos o contextos no seguros (http en la red local).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Fecha y hora local con zona: 2026-10-23T09:30:00-03:00 */
export function ahoraIso(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}` +
    `T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}${CONFIG.ZONA_HORARIA}`;
}
export const hoyIso = () => ahoraIso().slice(0, 10);

/**
 * Pide la ubicación. Nunca rechaza: si falla devuelve coordenadas vacías y el motivo.
 * → {lat, lon, precision, fecha, estado: "ok"|"denegado"|"no_disponible"|"tiempo_agotado"|"sin_soporte"}
 */
export function tomarGps({ timeout = 15000 } = {}) {
  const vacio = (estado) => ({ lat: null, lon: null, precision: null, fecha: ahoraIso(), estado });
  if (!("geolocation" in navigator)) return Promise.resolve(vacio("sin_soporte"));
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => ok({
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        precision: Math.round(pos.coords.accuracy), fecha: ahoraIso(new Date(pos.timestamp)), estado: "ok"
      }),
      (err) => ok(vacio({ 1: "denegado", 2: "no_disponible", 3: "tiempo_agotado" }[err.code] || "no_disponible")),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

export const TEXTO_GPS = {
  pendiente: "Buscando ubicación…",
  ok: "Ubicación tomada",
  denegado: "Sin permiso de ubicación: se envía igual, sin coordenadas",
  no_disponible: "GPS no disponible: se envía igual, sin coordenadas",
  tiempo_agotado: "El GPS no respondió a tiempo: se envía igual, sin coordenadas",
  sin_soporte: "Este navegador no tiene GPS: se envía igual, sin coordenadas"
};

/**
 * Campos de control que lleva TODO registro cabecera enviado a Odoo.
 * x_gps_lat/x_gps_lon, x_fecha_hora_control e x_idempotency_key están en el diseño;
 * x_gps_precision, x_gps_fecha, x_gps_estado y x_cargado_por_* son NUEVOS (decisiones del
 * 17/10/2026) y hay que agregarlos a los modelos x_hys_* (ver README).
 */
export function camposControl(auto, { claveCampo = "x_idempotency_key" } = {}) {
  const u = leerSesion().usuario || {};
  const g = auto.gps || { estado: "no_disponible" };
  return {
    [claveCampo]: auto.idempotency_key,
    x_fecha_hora_control: auto.fecha_hora_control,
    x_gps_lat: g.lat ?? false,
    x_gps_lon: g.lon ?? false,
    x_gps_precision: g.precision ?? false,
    x_gps_fecha: g.fecha || false,
    x_gps_estado: g.estado,
    x_cargado_por_ref: u.id || false,
    x_cargado_por_nombre: u.nombre || false,
    x_cargado_por_rol: u.rol || false
  };
}
