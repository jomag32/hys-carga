// Distancia en línea recta (haversine) entre dos puntos {lat, lon}, en km. Usada por F01 «Usar mi ubicación».
import { CONFIG } from "../api/config.js";

export const DIST_MAX_KM = 2000; // tope de plausibilidad (igual que el backend)

export function distanciaKm(a, b) {
  const R = 6371.0088, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Coordenadas de la planta (Posadas) o null si todavía no están configuradas. */
export function coordsPlanta() {
  const p = CONFIG.PLANTA_COORDS;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
}

/** Validación de la distancia (F01). null = ok. */
export function errorDistancia(v) {
  if (v === "" || v == null) return "La distancia a Posadas (km) es obligatoria. Tocá «Usar mi ubicación» o escribila a mano.";
  const n = Number(v);
  if (!Number.isFinite(n)) return "La distancia tiene que ser un número de km.";
  if (n < 0) return "La distancia no puede ser negativa.";
  if (n > DIST_MAX_KM) return `La distancia no puede pasar de ${DIST_MAX_KM} km: revisala.`;
  return null;
}
