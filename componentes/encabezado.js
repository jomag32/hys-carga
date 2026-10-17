// Encabezado compartido: obra (o planta) elegida, usuario local que carga y envíos pendientes.

import { h } from "./util.js";
import { leerSesion } from "./sesion.js";
import { contarPendientes } from "../api/cola.js";
import { CONFIG } from "../api/config.js";

export function pintarEncabezado(el) {
  const s = leerSesion();
  const pend = contarPendientes();
  el.replaceChildren(
    h("a", { class: "marca", href: "#/" }, "HyS ", h("span", {}, "ARME")),
    h("div", { class: "contexto" },
      h("a", { href: "#/obra", class: "dato", id: "enc-obra" }, "🏗 ", s.obra ? s.obra.name : "Elegir obra"),
      h("a", { href: "#/sesion", class: "dato", id: "enc-usuario" }, "👷 ", s.usuario ? `${s.usuario.nombre} · ${s.usuario.rol}` : "Elegir quién carga")),
    h("a", { href: "#/envios", class: `pendientes ${pend ? "hay" : ""}`, title: "Envíos pendientes" }, pend ? `📱 ${pend}` : "✓"),
    CONFIG.MOCK ? h("span", { class: "mock", title: "Datos de prueba, no conecta con Odoo" }, "MOCK") : "");
}
