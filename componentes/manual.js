// Manual de uso: sección de una ficha (para el botón «?» de cada asistente) y pantalla completa #/manual[/f0X].
import { h } from "./util.js";
import { MANUAL, MANUAL_GENERAL } from "./manual-contenido.js";

const lista = (items, ordenada = false) => h(ordenada ? "ol" : "ul", { class: "manual-lista" }, items.map((x) =>
  Array.isArray(x) ? h("li", {}, x[0], lista(x[1])) : h("li", {}, x)));

/** Contenido del manual de una ficha (F01…F08). */
export function seccionManual(cod) {
  const m = MANUAL[cod];
  if (!m) return h("p", {}, "Esta ficha todavía no tiene manual.");
  return h("article", { class: "manual-ficha", id: `manual-${cod.toLowerCase()}` },
    h("h2", {}, `${cod} · ${m.titulo}`),
    h("h3", {}, "Para qué sirve"), h("p", {}, m.para),
    h("h3", {}, "Quién la carga y quién la ve"), h("p", {}, m.quien),
    h("h3", {}, "Cómo cargarla"), h("ol", { class: "manual-lista" }, m.pasos.map(([t, x]) => h("li", {}, h("b", {}, t), ": ", x))),
    h("h3", {}, "Qué pasa después y cómo calcula"), lista(m.despues),
    m.faq?.length ? [h("h3", {}, "Preguntas frecuentes"), h("dl", { class: "manual-faq" }, m.faq.map(([p, r]) => [h("dt", {}, p), h("dd", {}, r)]))] : "");
}

/** Botón «?» redondo que abre el manual de la ficha en una ventana encima (no se pierde lo cargado). */
export function botonManual(cod) {
  return h("button", { type: "button", class: "btn-manual", id: "btn-manual", "aria-label": `Manual de ${cod}`, title: "Cómo se carga y cómo calcula",
    onclick: () => abrirManual(cod) }, "?");
}

export function abrirManual(cod) {
  const dlg = h("dialog", { class: "dialogo-manual", id: "dialogo-manual" },
    h("div", { class: "dialogo-barra" }, h("b", {}, "📖 Manual"),
      h("button", { type: "button", class: "btn chico", id: "cerrar-manual", onclick: () => dlg.close() }, "Cerrar ✕")),
    h("div", { class: "dialogo-cuerpo" }, seccionManual(cod),
      h("p", { class: "ayuda" }, h("a", { href: `#/manual/${cod.toLowerCase()}`, onclick: () => dlg.close() }, "Ver el manual completo de todas las fichas"),
        " (lo que estás cargando queda guardado como borrador).")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

/** Pantalla #/manual o #/manual/f05 (abre directo en esa ficha). */
export function vistaManual(app, cod) {
  const codigos = Object.keys(MANUAL);
  app.replaceChildren(
    h("h1", {}, "📖 Manual de uso de las fichas"),
    h("nav", { class: "manual-indice" }, codigos.map((c) => h("a", { class: "btn chico", href: `#/manual/${c.toLowerCase()}` }, c))),
    h("details", { class: "manual-general", open: !cod },
      h("summary", {}, MANUAL_GENERAL.titulo),
      MANUAL_GENERAL.secciones.map(([t, items]) => [h("h3", {}, t), lista(items)])),
    ...codigos.map((c) => h("details", { class: "manual-item", open: c === cod, id: `det-${c.toLowerCase()}` }, h("summary", {}, `${c} · ${MANUAL[c].titulo}`), seccionManual(c))),
    h("a", { class: "btn secundario ancho", href: "#/" }, "← Volver al inicio"));
  if (cod) document.getElementById(`det-${cod.toLowerCase()}`)?.scrollIntoView();
}
