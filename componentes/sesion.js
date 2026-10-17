// Sesión local del celular: obra (o planta) elegida y usuario de carga.
//
// D-04 revisada (17/10/2026 18:44): la lista de usuarios de carga es una lista FIJA de texto dentro
// de hys-carga (datos/usuarios.json; en el repo público solo ejemplos), no está en Odoo. El backend
// escribe en Odoo con la única cuenta de servicio MIA y cada registro lleva el texto x_cargado_por
// ("<id> · <nombre> · <rol> · <obra>").
// «Ingresar» hoy es elegir obra y después el nombre de la lista. El método de acceso real (PIN,
// enlace, etc.) sigue PENDIENTE (§7.4 #4): no hay PINs ni contraseñas en esta app.
// La sesión vive en localStorage ("hys_sesion").

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

export const hayIngreso = () => !!(leerSesion().obra && leerSesion().usuario);

/** Salir: se olvida el usuario (la obra queda marcada para el próximo ingreso). */
export function cerrarSesion() { guardarSesion({ usuario: null, ingreso: null }); }
