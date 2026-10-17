// Campos automáticos de control (diseño §1.3, §5.1, §5.2 y decisiones del 17/10/2026).
// Los toma el celular; nadie los escribe a mano:
//   · idempotency key: UUID v4 creado AL ABRIR el formulario (no al enviar); reintentos la reusan.
//   · fecha y hora del control: al tocar «Enviar», en ISO 8601 con zona -03:00.
//   · GPS (decisión D-03): se pide al cargar el formulario; viaja con lat, lon, precisión y
//     fecha de captura. Si se niega o no hay GPS, se envía igual con coordenadas vacías y una
//     marca (x_gps_estado) que explica por qué.
//   · quién cargó: usuario de la lista fija de hys-carga (datos/usuarios.json), como texto x_cargado_por.
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
 * → {lat, lon, precision, fecha, estado} con estado = valores de x_gps_estado (§2.14):
 *   "ok" Capturado · "denegado" Permiso denegado · "sin_posicion" Sin posición / tiempo agotado ·
 *   "no_disponible" Navegador sin geolocalización.
 */
export function tomarGps({ timeout = 15000 } = {}) {
  const vacio = (estado) => ({ lat: null, lon: null, precision: null, fecha: ahoraIso(), estado });
  if (!("geolocation" in navigator)) return Promise.resolve(vacio("no_disponible"));
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => ok({
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        precision: Math.round(pos.coords.accuracy), fecha: ahoraIso(new Date(pos.timestamp)), estado: "ok"
      }),
      (err) => ok(vacio(err.code === 1 ? "denegado" : "sin_posicion")),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

export const TEXTO_GPS = {
  pendiente: "Buscando ubicación…",
  ok: "Ubicación tomada",
  denegado: "Sin permiso de ubicación: se envía igual, sin coordenadas",
  sin_posicion: "El GPS no dio posición: se envía igual, sin coordenadas",
  no_disponible: "Este navegador no tiene GPS: se envía igual, sin coordenadas"
};

/** Obra en formato corto para «Cargado por»: "OT 9101", "Proyecto 384" (sin número de OT) o "Planta". */
export const obraCorta = (obra) => (!obra ? "—" : obra.id === "planta" ? "Planta" : obra.ot ? `OT ${obra.ot}` : `Proyecto ${obra.id}`);

/**
 * Texto de x_cargado_por (char, D-04 revisada, §2.15): "<id> · <nombre> · <rol> · <obra>",
 * con los datos del usuario de la lista fija de hys-carga al momento de cargar.
 */
export function textoCargadoPor(sesion = leerSesion()) {
  const u = sesion.usuario;
  return u ? [u.id, u.nombre, u.rol, obraCorta(sesion.obra)].join(" · ") : false;
}

/**
 * Campos de control que lleva TODO registro cabecera enviado a Odoo (§2.8, §2.14, §2.15):
 * clave de idempotencia, fecha/hora del control, GPS (x_gps_*) y quién cargó (x_cargado_por).
 * x_cargado_por todavía no existe en Odoo (se crea cuando Jorge lo indique).
 */
export function camposControl(auto, { claveCampo = "x_idempotency_key" } = {}) {
  const g = auto.gps || { estado: "no_disponible" };
  return {
    [claveCampo]: auto.idempotency_key,
    x_fecha_hora_control: auto.fecha_hora_control,
    x_gps_lat: g.lat ?? false,
    x_gps_lon: g.lon ?? false,
    x_gps_precision_m: g.precision ?? false,
    x_gps_fecha: g.fecha || false,
    x_gps_estado: g.estado,
    x_cargado_por: textoCargadoPor()
  };
}
