// Selector de inspector (x_hys_inspector, «HyS > Inspectores» en Odoo) con buscador por nombre,
// legajo o empresa. Lo usa F02. Lista [{id, nombre, legajo, tipo, empresa}] de api/odoo.js
// leerInspectores() (backend: GET /api/v1/inspectores). Muestra «Nombre · Legajo N» y, si es
// externo, «· externo · Empresa».

import { h } from "./util.js";
import { normalizar } from "./selector-obra.js";

const detalle = (e) => [e.legajo ? `Legajo ${e.legajo}` : null, e.tipo === "externo" ? (e.empresa ? `externo · ${e.empresa}` : "externo") : null].filter(Boolean).join(" · ");
export const textoInspector = (e) => (e ? [e.nombre, detalle(e)].filter(Boolean).join(" · ") : "");

/** selectorInspector(d, "inspector_id", lista) → elemento. d[clave] = id (entero) del x_hys_inspector. */
export function selectorInspector(d, clave, lista, { etiqueta = "Inspector", requerido = true } = {}) {
  let texto = "";
  const caja = h("div", { class: "lista-botones lista-obras lista-inspectores", role: "listbox", id: `lista-${clave}` });
  const contador = h("p", { class: "ayuda contador-obras", "aria-live": "polite" });
  const elegido = h("div", { class: "obra-elegida" });
  const buscador = h("input", {
    type: "search", class: "entrada buscador-obras", id: `buscar-${clave}`, enterkeyhint: "search", autocomplete: "off",
    autocapitalize: "off", spellcheck: "false", placeholder: "Buscar por nombre, legajo o empresa", "aria-label": "Buscar inspector",
    oninput: (e) => { texto = e.target.value; pintar(); }
  });
  const coincide = (e) => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    const pajar = normalizar(`${e.nombre} ${e.legajo ? `legajo ${e.legajo}` : ""} ${e.tipo || ""} ${e.empresa || ""}`);
    return palabras.every((p) => pajar.includes(p));
  };
  const pintar = () => {
    if (!lista.length) {
      contador.textContent = "";
      caja.replaceChildren(h("p", { class: "aviso alerta sin-inspectores" }, "No hay inspectores cargados en Odoo (HyS > Inspectores)."));
      return;
    }
    const actual = lista.find((e) => e.id === d[clave]);
    elegido.replaceChildren(actual ? h("p", {}, "✔ Elegido: ", h("b", {}, textoInspector(actual))) : "");
    const vis = lista.filter(coincide);
    contador.textContent = texto.trim() ? `${vis.length} de ${lista.length} personas` : `${lista.length} personas`;
    caja.replaceChildren(...(vis.length ? vis.slice(0, 200).map((e) =>
      h("button", {
        type: "button", role: "option", class: `btn-lista ${d[clave] === e.id ? "elegida" : ""}`, "aria-selected": String(d[clave] === e.id),
        "data-inspector-id": e.id, onclick: () => { d[clave] = e.id; pintar(); }
      }, h("span", {}, e.nombre), detalle(e) ? h("small", { class: "num-proyecto" }, ` · ${detalle(e)}`) : ""))
      : [h("p", { class: "ayuda" }, "Nadie coincide con la búsqueda.")]));
  };
  pintar();
  return h("div", { class: "campo selector-inspector" },
    h("label", { class: "etiqueta", for: `buscar-${clave}` }, etiqueta, requerido && h("span", { class: "req" }, " *")),
    elegido, buscador, contador, caja);
}
