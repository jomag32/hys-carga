// Selector de turno de ATS (x_hys_turno, F08). Los turnos salen del catálogo F08 del backend
// (GET /api/v1/ats/catalogo); en Odoo: «Jornada» lunes a viernes 07:00 (decisión D-03).
// Deja en d[clave] el turno elegido {id, codigo, nombre, sector, inicio, dias, ...}.
// Solo muestra los turnos del sector elegido que trabajan el día de d.fecha.

import { h } from "./util.js";

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
/** 0 = lunes … 6 = domingo, como x_dias de Odoo. */
export const diaSemana = (fecha) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;

export function selectorTurno(d, turnos, clave = "turno", { etiqueta = "Turno", alCambiar } = {}) {
  const delSector = turnos.filter((t) => t.sector === d.sector);
  const dia = d.fecha ? diaSemana(d.fecha) : null;
  const delDia = delSector.filter((t) => dia === null || !t.dias?.length || t.dias.includes(dia));
  if (d[clave] && !delDia.some((t) => t.id === d[clave].id)) d[clave] = null;
  if (!d[clave] && delDia.length === 1) { d[clave] = delDia[0]; alCambiar?.(delDia[0]); }
  const lista = h("div", { class: "opciones col2" });
  const pintar = () => lista.replaceChildren(...(delDia.length ? delDia.map((t) =>
    h("button", {
      type: "button", class: `opcion ${d[clave]?.id === t.id ? "elegida" : ""}`, role: "radio",
      "aria-checked": String(d[clave]?.id === t.id),
      onclick: () => { d[clave] = t; pintar(); alCambiar?.(t); }
    }, `${t.nombre} · ${t.inicio}`))
    : [h("p", { class: "aviso alerta" }, !d.sector ? "Elegí primero el sector."
      : `Este sector no tiene turno de ATS el ${DIAS[dia]}. Si se trabaja igual, avisá a HyS.`)]));
  pintar();
  return h("div", { class: "campo" }, h("span", { class: "etiqueta" }, etiqueta, h("span", { class: "req" }, " *")), lista);
}
