// Encabezado compartido: lugar (obra OT, sector o planta), usuario que carga, envíos pendientes y Salir.

import { h } from "./util.js";
import { leerSesion } from "./sesion.js";
import { contarPendientes } from "../api/cola.js";

export function pintarEncabezado(el) {
  const s = leerSesion();
  const pend = contarPendientes();
  const adentro = s.obra && s.usuario;
  el.replaceChildren(
    h("a", { class: "marca", href: "#/" }, "HyS ", h("span", {}, "Tecnología ARME")),
    h("div", { class: "contexto" },
      adentro ? [
        h("a", { href: "#/ingresar", class: "dato", id: "enc-obra", title: "Cambiar de lugar" }, "🏗 ", s.obra.name),
        h("span", { class: "dato", id: "enc-usuario" }, "👷 ", `${s.usuario.nombre} · ${s.usuario.rol}`)]
        : h("span", { class: "dato" }, "Carga de Higiene y Seguridad")),
    h("a", { href: "#/envios", class: `pendientes ${pend ? "hay" : ""}`, id: "enc-pendientes", title: "Envíos pendientes" }, pend ? `📱 ${pend}` : "✓"),
    adentro ? h("a", { href: "#/salir", class: "salir", id: "btn-salir" }, "Salir") : "");
}
