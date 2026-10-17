// Selector de obra (OT = project.project). Lo usan el encabezado y los formularios F01, F02 y F05.
// Lista las OT activas (en producción vienen de los catálogos del backend, para uso sin señal).
// Por defecto marca la obra elegida en el encabezado.

import { h, nombreM2o } from "./util.js";
import { leerRegistros } from "../api/odoo.js";
import { leerSesion } from "./sesion.js";
import { LUGAR_PLANTA } from "../api/datos-mock.js";

let cache = null;
export async function leerObras() {
  if (!cache) cache = await leerRegistros("project.project", [], ["name", "partner_id", "user_id", "x_mock_km"]);
  return cache;
}

/**
 * selectorObra(d, "obra", {incluirPlanta, alCambiar}) → elemento.
 * d[clave] queda como {id, name, partner_id, user_id, x_mock_km} (o LUGAR_PLANTA).
 */
export function selectorObra(d, clave = "obra", { etiqueta = "Obra (OT)", incluirPlanta = false, alCambiar, requerido = true } = {}) {
  const sesion = leerSesion();
  if (d[clave] === undefined && sesion.obra && (incluirPlanta || sesion.obra.id !== "planta")) d[clave] = sesion.obra;
  const lista = h("div", { class: "lista-botones" }, h("p", { class: "ayuda" }, "Cargando obras…"));
  const info = h("div", { class: "info-obra" });
  const pintarInfo = () => {
    const o = d[clave];
    info.replaceChildren(o && o.id !== "planta"
      ? h("p", {}, h("b", {}, "Cliente: "), nombreM2o(o.partner_id), h("br"), h("b", {}, "Director de Obra: "), nombreM2o(o.user_id))
      : "");
  };
  leerObras().then((obras) => {
    const opciones = incluirPlanta ? [...obras, LUGAR_PLANTA] : obras;
    const pintar = () => lista.replaceChildren(...opciones.map((o) =>
      h("button", {
        type: "button", class: `btn-lista ${d[clave]?.id === o.id ? "elegida" : ""}`, "aria-pressed": String(d[clave]?.id === o.id),
        onclick: () => { d[clave] = o; pintar(); pintarInfo(); alCambiar?.(o); }
      }, o.name)));
    pintar(); pintarInfo();
  }).catch((e) => lista.replaceChildren(h("p", { class: "aviso error" }, `No se pudieron leer las obras: ${e.message}`)));
  return h("div", { class: "campo selector-obra" },
    h("span", { class: "etiqueta" }, etiqueta, requerido && h("span", { class: "req" }, " *")), lista, info);
}
