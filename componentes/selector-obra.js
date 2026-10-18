// Selector de obra (OT = project.project) con buscador. Lo usan el ingreso, F01, F02 y F05.
// Lista TODOS los proyectos «en obra» (api/odoo.js listarObrasActivas: en producción GET /api/v1/obras
// del backend, que consulta Odoo con MIA). No se filtra por la obra elegida al ingresar: esa solo
// viene marcada de entrada. Búsqueda mientras se escribe, sin distinguir mayúsculas ni acentos, por
// nombre del proyecto, número de OT o número de proyecto (id de project.project).

import { h, nombreM2o } from "./util.js";
import { listarObrasActivas, estadoObras } from "../api/odoo.js";
import { mostrarFechaHora } from "./campos-auto.js";
import { leerSesion } from "./sesion.js";
import { LUGAR_PLANTA } from "../api/datos-mock.js";

export const leerObras = () => listarObrasActivas();

/** "Galpón Ejemplo OT-9101" → "galpon ejemplo ot-9101" (sin acentos ni mayúsculas). */
export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** ¿La obra coincide con lo buscado? Cada palabra tiene que aparecer en nombre, OT o n.º de proyecto. */
export function coincide(o, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const pajar = normalizar(`${o.name} ${o.ot ? `ot ${o.ot} ${o.ot}` : ""} proyecto ${o.id} #${o.id} ${nombreM2o(o.partner_id)}`);
  return palabras.every((p) => pajar.includes(p));
}

/**
 * selectorObra(d, "obra", {incluirPlanta, alCambiar}) → elemento.
 * d[clave] queda como {id, name, ot, partner_id, user_id, x_mock_km} (o LUGAR_PLANTA).
 */
export function selectorObra(d, clave = "obra", { etiqueta = "Obra (OT)", incluirPlanta = false, alCambiar, requerido = true } = {}) {
  const sesion = leerSesion();
  if (d[clave] === undefined && sesion.obra && (incluirPlanta || sesion.obra.id !== "planta")) d[clave] = sesion.obra;
  let opciones = [];
  let texto = "";
  const lista = h("div", { class: "lista-botones lista-obras", role: "listbox", id: `lista-${clave}` });
  const estado = h("div", { class: "estado-obras", "aria-live": "polite" });
  const contador = h("p", { class: "ayuda contador-obras", "aria-live": "polite" });
  const elegida = h("div", { class: "obra-elegida" });
  const info = h("div", { class: "info-obra" });
  const buscador = h("input", {
    type: "search", class: "entrada buscador-obras", id: `buscar-${clave}`, enterkeyhint: "search", autocomplete: "off",
    autocapitalize: "off", spellcheck: "false", placeholder: "Buscar por nombre, N.º de OT o de proyecto",
    "aria-label": "Buscar obra", oninput: (e) => { texto = e.target.value; pintar(); }
  });

  const pintarInfo = () => {
    const o = d[clave];
    elegida.replaceChildren(o ? h("p", {}, "✔ Elegida: ", h("b", {}, o.name)) : "");
    info.replaceChildren(o && o.id !== "planta"
      ? h("p", {}, h("b", {}, "Cliente: "), nombreM2o(o.partner_id) || "—", h("br"), h("b", {}, "Director de Obra: "), nombreM2o(o.user_id) || "—")
      : "");
  };
  const pintar = () => {
    const vis = opciones.filter((o) => o.id === "planta" ? !texto.trim() || coincide(o, texto) : coincide(o, texto));
    const total = opciones.filter((o) => o.id !== "planta").length;
    contador.textContent = texto.trim() ? `${vis.length} de ${total} obras en curso` : `${total} obras en curso`;
    lista.replaceChildren(...(vis.length ? vis.map((o) =>
      h("button", {
        type: "button", role: "option", class: `btn-lista ${d[clave]?.id === o.id ? "elegida" : ""}`, "aria-selected": String(d[clave]?.id === o.id),
        "data-obra-id": o.id,
        onclick: () => { d[clave] = o; pintar(); pintarInfo(); alCambiar?.(o); }
      }, h("span", {}, o.name), o.id !== "planta" ? h("small", { class: "num-proyecto" }, ` · Proyecto ${o.id}`) : ""))
      : [h("p", { class: "ayuda" }, "Ninguna obra coincide con la búsqueda.")]));
  };
  // Carga: el backend (plan free de Render) puede tardar ~50 s en despertar → aviso amable.
  const cargar = () => {
    lista.replaceChildren();
    estado.replaceChildren(h("p", { class: "ayuda cargando-obras" }, h("span", { class: "girando", "aria-hidden": "true" }, "⏳"), " Cargando obras…"));
    const lento = setTimeout(() => estado.firstChild?.append(h("br"),
      "El servidor se está despertando; puede tardar hasta un minuto. No cierres la app."), 4000);
    leerObras().then((obras) => {
      clearTimeout(lento);
      estado.replaceChildren(estadoObras.origen === "copia"
        ? h("p", { class: "aviso" }, `Sin conexión con el servidor: se muestra la lista guardada el ${mostrarFechaHora(estadoObras.fecha)}.`)
        : "");
      opciones = incluirPlanta ? [...obras, LUGAR_PLANTA] : obras;
      pintar(); pintarInfo();
    }).catch((e) => {
      clearTimeout(lento);
      contador.textContent = "";
      estado.replaceChildren(h("div", { class: "aviso error error-obras", role: "alert" },
        h("p", {}, h("b", {}, "No se pudo cargar la lista de obras. "), e.message ? `(${e.message})` : ""),
        h("p", {}, "Revisá la señal y probá de nuevo."),
        h("button", { type: "button", class: "btn primario", id: `reintentar-${clave}`, onclick: cargar }, "Reintentar")));
      if (incluirPlanta) { opciones = [LUGAR_PLANTA]; pintar(); } // planta no depende del servidor
    });
  };
  cargar();
  pintarInfo();
  return h("div", { class: "campo selector-obra" },
    h("label", { class: "etiqueta", for: `buscar-${clave}` }, etiqueta, requerido && h("span", { class: "req" }, " *")),
    elegida, buscador, estado, contador, lista, info);
}
