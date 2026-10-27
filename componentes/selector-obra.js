// Selector de obra (OT = project.project) con buscador. Lo usan el ingreso (solo si el lugar es
// «Obra»), F01, F02 y F05. Lista TODOS los proyectos «en obra» (api/odoo.js listarObrasActivas).
// El lugar del ingreso (sector/planta) no se usa como prefill: solo una OT real. Búsqueda sin
// distinguir mayúsculas ni acentos, por nombre, N.º de OT o N.º de proyecto.

import { h, nombreM2o } from "./util.js";
import { listarObrasActivas, estadoObras } from "../api/odoo.js";
import { mostrarFechaHora } from "./campos-auto.js";
import { leerSesion } from "./sesion.js";
import { LUGAR_PLANTA } from "../api/datos-mock.js";
import { esObraReal } from "./lugares.js";

export const leerObras = (para = "") => listarObrasActivas(para);

/** "Galpón Ejemplo OT-9101" → "galpon ejemplo ot-9101" (sin acentos ni mayúsculas). */
export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** ¿La obra coincide con lo buscado? Cada palabra tiene que aparecer en nombre, OT o n.º de proyecto. */
export function coincide(o, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const pajar = normalizar(`${o.name} ${o.ot ? `ot ${o.ot} ${o.ot}` : ""} proyecto ${o.id} #${o.id} ${nombreM2o(o.partner_id)}`);
  return palabras.every((p) => pajar.includes(p));
}

// Fila compacta (18/10/2026, pedido de Jorge): «OT 4081» destacado, la empresa en UNA línea con «…»
// y «Proy. N» chico. El nombre completo queda en title/aria-label y la búsqueda sigue usando o.name.
function filaObra(o) {
  if (o.id === "planta") return [h("span", { class: "obra-empresa" }, o.name)];
  const m = /^\s*(OT\s*\d+)\s*[-–·:]?\s*(.*)$/i.exec(o.name || "");
  return [m ? h("b", { class: "obra-ot" }, m[1].replace(/^OT\s*/i, "OT ")) : "",
    h("span", { class: "obra-empresa" }, m ? m[2] || "" : o.name),
    h("small", { class: "num-proyecto" }, `Proy. ${o.id}`)];
}

/**
 * selectorObra(d, "obra", {incluirPlanta, alCambiar}) → elemento.
 * prefill (por defecto true): marca de entrada la obra del ingreso; F02 lo usa en false (arranca vacío).
 * d[clave] queda como {id, name, ot, partner_id, user_id, x_mock_km} (o LUGAR_PLANTA).
 */
export function selectorObra(d, clave = "obra", { etiqueta = "Obra (OT)", incluirPlanta = false, alCambiar, requerido = true, para = "", prefill = true } = {}) {
  const sesion = leerSesion();
  // prefill=false (F02, pedido de Jorge 18/10/2026 22:35): el selector arranca vacío, sin la obra del ingreso.
  // Solo prellenar con OT real: sector/planta del ingreso no son opciones del selector de OF.
  if (prefill && d[clave] === undefined && esObraReal(sesion.obra)) d[clave] = sesion.obra;
  else if (prefill && d[clave] === undefined && incluirPlanta && sesion.obra?.id === "planta") d[clave] = sesion.obra;
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
        title: o.id !== "planta" ? `${o.name} · Proyecto ${o.id}` : o.name,
        "aria-label": o.id !== "planta" ? `${o.name}, proyecto ${o.id}` : o.name,
        onclick: () => { d[clave] = o; pintar(); pintarInfo(); alCambiar?.(o); }
      }, ...filaObra(o)))
      : [h("p", { class: "ayuda" }, "Ninguna obra coincide con la búsqueda.")]));
  };
  // Carga: el backend (plan free de Render) puede tardar ~50 s en despertar → aviso amable.
  const cargar = () => {
    lista.replaceChildren();
    estado.replaceChildren(h("p", { class: "ayuda cargando-obras" }, h("span", { class: "girando", "aria-hidden": "true" }, "⏳"), " Cargando obras…"));
    const lento = setTimeout(() => estado.firstChild?.append(h("br"),
      "El servidor se está despertando; puede tardar hasta un minuto. No cierres la app."), 4000);
    leerObras(para).then((obras) => {
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
