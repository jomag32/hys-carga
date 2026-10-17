// Sesión local del celular: obra (o planta) elegida y usuario local de hys-carga.
//
// Decisión 17/10/2026: hys-carga tiene su PROPIA lista de usuarios por obra (nombre y rol).
// No hay un usuario de Odoo por operario: el backend escribe en Odoo con una única cuenta de
// servicio, y cada registro lleva en sus campos de control quién cargó (id local, nombre y rol).
// En el mock "entrar" es elegir el nombre de la lista; el mecanismo real (PIN, enlace, etc.)
// sigue siendo pregunta abierta (§7.4 #4).

const CLAVE = "hys_sesion";

export function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (e) { return {}; }
}

/** obra = {id, name} (id numérico de project.project o "planta"); usuario = {id, nombre, rol}. */
export function guardarSesion(cambios) {
  const s = { ...leerSesion(), ...cambios };
  localStorage.setItem(CLAVE, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("hys:sesion", { detail: s }));
  return s;
}

export function cerrarSesion() { guardarSesion({ usuario: null }); }
