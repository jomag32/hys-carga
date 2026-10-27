// Campos automáticos de control (diseño §1.3, §5.1, §5.2 y decisiones del 17/10/2026).
// Los toma el celular; nadie los escribe a mano:
//   · idempotency key: UUID v4 creado AL ABRIR el formulario (no al enviar); reintentos la reusan.
//   · fecha y hora del control: al tocar «Enviar», en UTC real (ISO 8601 con «Z»).
//   · GPS (decisión D-03): se pide al cargar el formulario; viaja con lat, lon, precisión y
//     fecha de captura. Si se niega o no hay GPS, se envía igual con coordenadas vacías y una
//     marca (x_gps_estado) que explica por qué.
//   · quién cargó: el inspector que ingresó (x_hys_inspector), como texto x_cargado_por.
// La fecha de recepción (x_fecha_recepcion) la pone el backend, no el celular.

import { CONFIG } from "../api/config.js";
import { leerSesion } from "./sesion.js";
import { lugarCorto, esObraReal } from "./lugares.js";

/** Precisión GPS (m) por encima de la cual la ubicación se considera imprecisa (IP / Wi-Fi grosero).
 *  No cambia x_gps_estado en Odoo (sigue «ok» con lat/lon/precision): solo marca UI + flag local.
 *  Umbral 100 m: GPS de celular suele ser < 50 m; ±50000 m del reporte es típico de geoloc por IP. */
export const GPS_PRECISION_IMPRECISA_M = 100;

export function nuevaClaveIdempotencia() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos o contextos no seguros (http en la red local).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Instante actual (o `fecha`) en UTC real, ISO 8601: "2026-10-23T12:30:00.000Z".
 * Se usa para los campos de control (x_fecha_hora_control, x_gps_fecha): NO depende de la zona
 * horaria configurada en el celular. odoo.js lo pasa a "AAAA-MM-DD HH:MM:SS" (UTC) para Odoo.
 */
export const ahoraUtc = (fecha = new Date()) => new Date(fecha).toISOString();

// Partes de fecha y hora en la zona de Argentina (sin depender de la zona del celular).
const PARTES_AR = new Intl.DateTimeFormat("en-CA", {
  timeZone: CONFIG.ZONA_IANA, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

/**
 * Hora de pared de Argentina con zona: 2026-10-23T09:30:00-03:00 (mismo instante que ahoraUtc).
 * Para valores por defecto de formularios (fecha de hoy, datetime-local) y textos.
 * Argentina no tiene horario de verano: -03:00 fijo (CONFIG.ZONA_HORARIA).
 */
export function ahoraIso(fecha = new Date()) {
  const p = Object.fromEntries(PARTES_AR.formatToParts(new Date(fecha)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${CONFIG.ZONA_HORARIA}`;
}

const MOSTRAR_AR = new Intl.DateTimeFormat("es-AR", {
  timeZone: CONFIG.ZONA_IANA, day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
/** Para mostrar: "18/10/2026, 09:12:28" en hora de Argentina, sin importar la zona del celular. */
export const mostrarFechaHora = (iso) => MOSTRAR_AR.format(new Date(iso));
export const hoyIso = () => ahoraIso().slice(0, 10);

/**
 * Pide la ubicación. Nunca rechaza: si falla devuelve coordenadas vacías y el motivo.
 * → {lat, lon, precision, fecha, estado} con estado = valores de x_gps_estado (§2.14):
 *   "ok" Capturado · "denegado" Permiso denegado · "sin_posicion" Sin posición / tiempo agotado ·
 *   "no_disponible" Navegador sin geolocalización.
 */
export function tomarGps({ timeout = 15000 } = {}) {
  const vacio = (estado) => ({ lat: null, lon: null, precision: null, fecha: ahoraUtc(), estado, impreciso: false });
  if (!("geolocation" in navigator)) return Promise.resolve(vacio("no_disponible"));
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const precision = Math.round(pos.coords.accuracy);
        const impreciso = Number.isFinite(precision) && precision > GPS_PRECISION_IMPRECISA_M;
        ok({
          lat: pos.coords.latitude, lon: pos.coords.longitude,
          precision, fecha: ahoraUtc(new Date(pos.timestamp)), estado: "ok", impreciso
        });
      },
      (err) => ok(vacio(err.code === 1 ? "denegado" : "sin_posicion")),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

export const TEXTO_GPS = {
  pendiente: "Buscando ubicación…",
  ok: "Ubicación tomada",
  ok_impreciso: "Ubicación imprecisa",
  denegado: "Sin permiso de ubicación: se envía igual, sin coordenadas",
  sin_posicion: "El GPS no dio posición: se envía igual, sin coordenadas",
  no_disponible: "Este navegador no tiene GPS: se envía igual, sin coordenadas"
};

/** Texto del chip / resumen de GPS (incluye aviso de imprecisión sin nuevo valor Odoo). */
export function textoGps(g) {
  if (!g) return TEXTO_GPS.no_disponible;
  if (g.estado === "ok" && g.impreciso) return `${TEXTO_GPS.ok_impreciso} (±${g.precision} m) · preferí el celular con GPS`;
  if (g.estado === "ok") return `${TEXTO_GPS.ok} (±${g.precision} m)`;
  return TEXTO_GPS[g.estado] || g.estado;
}

/** Obra/lugar en formato corto para «Cargado por». */
export const obraCorta = (obra) => lugarCorto(obra);
export { esObraReal };

/**
 * Texto de x_cargado_por (char): "Legajo N · <nombre> · Inspector HyS · <obra>", con el inspector que
 * ingresó. En F02 el backend lo vuelve a armar con el registro activo de x_hys_inspector.
 */
export function textoCargadoPor(sesion = leerSesion()) {
  const u = sesion.usuario;
  return u ? [u.legajo ? `Legajo ${u.legajo}` : `Inspector ${u.id}`, u.nombre, u.rol, obraCorta(sesion.obra)].join(" · ") : false;
}

/**
 * Campos de control que lleva TODO registro cabecera enviado a Odoo (§2.8, §2.14, §2.15):
 * clave de idempotencia, fecha/hora del control, GPS (x_gps_*) y quién cargó (x_cargado_por).
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
