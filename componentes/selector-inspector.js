// Selector de inspector (hr.employee) con buscador por nombre o legajo. Lo usa F02.
// Lista [{id, nombre, legajo}] de api/odoo.js leerInspectores() (backend: GET /api/v1/inspectores).
// Muestra «Nombre · Legajo N» (solo el nombre si no hay legajo cargado).

import { h } from "./util.js";
import { normalizar } from "./selector-obra.js";

export const textoInspector = (e) => (e ? (e.legajo ? `${e.nombre} · Legajo ${e.legajo}` : e.nombre) : "");

/** selectorInspector(d, "inspector_id", lista) → elemento. d[clave] = id (entero) del hr.employee. */
export function selectorInspector(d, clave, lista, { etiqueta = "Inspector", requerido = true } = {}) {
  let texto = "";
  const caja = h("div", { class: "lista-botones lista-obras lista-inspectores", role: "listbox", id: `lista-${clave}` });
  const contador = h("p", { class: "ayuda contador-obras", "aria-live": "polite" });
  const elegido = h("div", { class: "obra-elegida" });
  const buscador = h("input", {
    type: "search", class: "entrada buscador-obras", id: `buscar-${clave}`, enterkeyhint: "search", autocomplete: "off",
    autocapitalize: "off", spellcheck: "false", placeholder: "Buscar por nombre o legajo", "aria-label": "Buscar inspector",
    oninput: (e) => { texto = e.target.value; pintar(); }
  });
  const coincide = (e) => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    const pajar = normalizar(`${e.nombre} ${e.legajo ? `legajo ${e.legajo}` : ""}`);
    return palabras.every((p) => pajar.includes(p));
  };
  const pintar = () => {
    const actual = lista.find((e) => e.id === d[clave]);
    elegido.replaceChildren(actual ? h("p", {}, "✔ Elegido: ", h("b", {}, textoInspector(actual))) : "");
    const vis = lista.filter(coincide);
    contador.textContent = texto.trim() ? `${vis.length} de ${lista.length} personas` : `${lista.length} personas`;
    caja.replaceChildren(...(vis.length ? vis.slice(0, 200).map((e) =>
      h("button", {
        type: "button", role: "option", class: `btn-lista ${d[clave] === e.id ? "elegida" : ""}`, "aria-selected": String(d[clave] === e.id),
        "data-inspector-id": e.id, onclick: () => { d[clave] = e.id; pintar(); }
      }, h("span", {}, e.nombre), e.legajo ? h("small", { class: "num-proyecto" }, ` · Legajo ${e.legajo}`) : ""))
      : [h("p", { class: "ayuda" }, "Nadie coincide con la búsqueda.")]));
  };
  pintar();
  return h("div", { class: "campo selector-inspector" },
    h("label", { class: "etiqueta", for: `buscar-${clave}` }, etiqueta, requerido && h("span", { class: "req" }, " *")),
    elegido, buscador, contador, caja);
}
