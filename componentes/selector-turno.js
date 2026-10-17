// Selector de turno (x_turno de x_hys_ats, F08). Los turnos están «a definir» por la empresa
// (diseño §2.13 y §7.4 #7); el mock trae Mañana y Tarde como supuesto.
// Deja en d[clave] {codigo, nombre, inicio} y en d.inicio_turno la fecha y hora de inicio del
// turno con zona (sirve para que el backend calcule x_antes_de_turno).

import { h } from "./util.js";
import { leerTurnos } from "../api/odoo.js";
import { CONFIG } from "../api/config.js";

export function selectorTurno(d, clave = "turno", { etiqueta = "Turno", alCambiar } = {}) {
  const lista = h("div", { class: "opciones col2" }, h("p", { class: "ayuda" }, "Cargando turnos…"));
  const calcularInicio = () => {
    if (d[clave] && d.fecha) d.inicio_turno = `${d.fecha}T${d[clave].inicio}:00${CONFIG.ZONA_HORARIA}`;
  };
  leerTurnos().then((turnos) => {
    const pintar = () => lista.replaceChildren(...turnos.map((t) =>
      h("button", {
        type: "button", class: `opcion ${d[clave]?.codigo === t.codigo ? "elegida" : ""}`, role: "radio",
        "aria-checked": String(d[clave]?.codigo === t.codigo),
        onclick: () => { d[clave] = t; calcularInicio(); pintar(); alCambiar?.(t); }
      }, `${t.nombre} · ${t.inicio}`)));
    pintar();
  }).catch((e) => lista.replaceChildren(h("p", { class: "aviso error" }, `No se pudieron leer los turnos: ${e.message}`)));
  calcularInicio();
  return h("div", { class: "campo" }, h("span", { class: "etiqueta" }, etiqueta, h("span", { class: "req" }, " *")),
    h("p", { class: "ayuda" }, "Turnos a definir por la empresa (provisorio)."), lista);
}
