// Sesión local del celular: lugar (obra OT, sector de planta o planta) y usuario de carga.
//
// Quién ingresa (decisión de Jorge 18/10/2026 19:24): los inspectores ACTIVOS de la tabla propia de HyS
// en Odoo (x_hys_inspector), servidos por GET /api/v1/inspectores. Ya no hay lista fija de usuarios.
// El backend escribe en Odoo con la única cuenta de servicio MIA; cada registro lleva x_cargado_por
// («Legajo N · Nombre · Inspector HyS · OT»), que arma y verifica el backend con el inspector activo.
// «Ingresar»: tu nombre → tu contraseña → el SECTOR/lugar → (solo si elegiste Obra) la OF/proyecto
// (27/10/2026: sector antes de la OF; Depósito/Logística/Planta no piden OF).
// Obras y Fichas solo se leen con ese token.
// La sesión vive en localStorage ("hys_sesion").

const CLAVE = "hys_sesion";

export function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (e) { return {}; }
}

/**
 * obra = marcador del lugar de ingreso:
 *   · {id: núm, name, ot?, tipo:"obra", ...}  project.project
 *   · {id:"sector:deposito"|"sector:logistica", name, tipo:"sector", sector}
 *   · {id:"planta", name, tipo:"planta"}
 * usuario = {id, nombre, rol, ...} de x_hys_inspector.
 */
export function guardarSesion(cambios) {
  const s = { ...leerSesion(), ...cambios };
  localStorage.setItem(CLAVE, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("hys:sesion", { detail: s }));
  return s;
}

/** El usuario de la sesión viene de la lista de inspectores (x_hys_inspector), no de la lista fija vieja. */
export const usuarioVigente = (u) => !!u && u.fuente === "x_hys_inspector" && Number.isInteger(u.id);

export const hayIngreso = () => !!(leerSesion().obra && leerSesion().usuario);

/** Salir: se olvida el usuario (el lugar queda marcado para el próximo ingreso). */
export function cerrarSesion() { guardarSesion({ usuario: null, ingreso: null }); }
