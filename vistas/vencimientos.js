// Vencimientos legales (F06, solo lectura): estado de los controles legales con semáforo.
// Decisión de Jorge (25/10/2026): lo ve TODO el que ingresa, en celular y escritorio. Cargar (F06) es de HyS.
import { h } from "../componentes/util.js";
import { aviso } from "../componentes/campos.js";
import { leerVencimientos } from "../api/odoo.js";
import { leerSesion } from "../componentes/sesion.js";

const ESTADO = { vigente: "Vigente", vencido: "Vencido", sin_protocolo: "Sin protocolo", sin_estado: "Sin estado cargado" };
const PER = { anual: "Anual", "5_anios": "Cada 5 años", segun_norma: "Según norma" };
const ICONO = { verde: "🟢", amarillo: "🟡", rojo: "🔴" };
const fmt = (f) => (f ? f.split("-").reverse().join("/") : "—");
const cuando = (c) => (c.dias === null ? ESTADO[c.estado] || c.estado : c.dias < 0 ? `Venció hace ${-c.dias} días` : c.dias === 0 ? "Vence HOY" : `Vence en ${c.dias} días`);

export default async function vistaVencimientos(app) {
  app.replaceChildren(h("h1", {}, "📅 Vencimientos legales"), h("p", { class: "cargando" }, "Cargando…"));
  let r;
  try { r = await leerVencimientos(); }
  catch (e) { app.replaceChildren(h("h1", {}, "📅 Vencimientos legales"), aviso(`No se pudo leer (${e.message}).`, "error"), h("a", { class: "btn secundario", href: "#/" }, "Volver al inicio")); return; }
  const lista = r.controles || [];
  const esHys = ["inspector", "responsable", "desarrollo"].includes(leerSesion().usuario?.rol_hys || "inspector");
  app.replaceChildren(
    h("h1", {}, "📅 Vencimientos legales"),
    h("p", { class: "ayuda" }, "Estado de los controles legales (protocolos de profesionales y proveedores). Avisos a 30, 15, 7 y 0 días."),
    lista.length ? h("div", { class: "lista-vencimientos", id: "lista-vencimientos" }, lista.map((c) =>
      h("div", { class: `tarjeta-vencimiento ${c.color}`, "data-control-id": c.id },
        h("b", {}, `${ICONO[c.color] || ""} ${c.prioridad === "1" ? "⚠ " : ""}${c.nombre}`), h("br"),
        h("small", {}, [c.referencia, c.donde, PER[c.periodicidad]].filter(Boolean).join(" · ")), h("br"),
        h("span", {}, `${cuando(c)} · vence ${fmt(c.fecha_vence)}${c.proveedor ? ` · ${c.proveedor}` : ""}`))))
      : aviso("Todavía no hay controles legales cargados en Odoo. HyS los da de alta en Odoo › Vencimientos legales.", "alerta"),
    esHys ? h("a", { class: "btn primario ancho", href: "#/f06" }, "Cargar un vencimiento (F06)") : "",
    h("a", { class: "btn secundario ancho", href: "#/" }, "Volver al inicio"));
}
