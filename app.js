// hys-carga · arranque y ruteo por hash (#/f01, #/envios, ...). Vanilla JS, sin build.
// Cada formulario es un módulo ES en vistas/ que se carga recién cuando se abre (import()).

import { h } from "./componentes/util.js";
import { pintarEncabezado } from "./componentes/encabezado.js";
import { leerSesion, guardarSesion } from "./componentes/sesion.js";
import { selectorObra } from "./componentes/selector-obra.js";
import { montarAsistente } from "./componentes/asistente.js";
import { aviso } from "./componentes/campos.js";
import { leerUsuariosLocales, reiniciarMock } from "./api/odoo.js";
import { iniciarCola, listarCola, procesarCola, limpiarEnviados, alCambiar } from "./api/cola.js";
import { CONFIG } from "./api/config.js";

// Códigos y nombres tal cual el diseño (Anexo B).
export const FORMULARIOS = [
  { cod: "F01", ruta: "f01", archivo: "f01-ficha-riesgo.js", titulo: "Ficha de Riesgos de Obra", donde: "Inicio de obra", icono: "📋" },
  { cod: "F02", ruta: "f02", archivo: "f02-inspeccion-obra.js", titulo: "Inspección de obra", donde: "Obra", icono: "🦺" },
  { cod: "F03", ruta: "f03", archivo: "f03-recorrida-fabrica.js", titulo: "Recorrida semanal de Fábrica", donde: "Fábrica", icono: "🏭" },
  { cod: "F04", ruta: "f04", archivo: "f04-check-instalaciones.js", titulo: "Check mensual de instalaciones", donde: "Fábrica y Oficina", icono: "🧯" },
  { cod: "F05", ruta: "f05", archivo: "f05-evento.js", titulo: "Registro de accidente o incidente", donde: "Cuando pasa algo", icono: "🚑" },
  { cod: "F06", ruta: "f06", archivo: "f06-vencimiento-legal.js", titulo: "Carga de vencimiento legal", donde: "Cuando llega un papel", icono: "📅" },
  { cod: "F07", ruta: "f07", archivo: "f07-cierre-desvio.js", titulo: "Cierre de desvío", donde: "Con foto del arreglo", icono: "✅" },
  { cod: "F08", ruta: "f08", archivo: "f08-ats-turno.js", titulo: "ATS de turno sectorial", donde: "Antes de cada turno", icono: "⏱" }
];

const app = document.getElementById("app");
const encabezado = document.getElementById("encabezado");

async function rutear() {
  pintarEncabezado(encabezado);
  const ruta = (location.hash.replace(/^#\/?/, "") || "inicio").split("?")[0];
  const s = leerSesion();
  const form = FORMULARIOS.find((f) => f.ruta === ruta);
  try {
    if (ruta === "obra") return vistaObra();
    if (ruta === "sesion") return vistaSesion();
    if (ruta === "envios") return vistaEnvios();
    if (form) {
      if (!s.obra) { location.hash = "#/obra"; return; }
      if (!s.usuario) { location.hash = "#/sesion"; return; }
      const mod = await import(`./vistas/${form.archivo}`);
      return montarAsistente(app, mod.default);
    }
    return vistaInicio();
  } catch (e) {
    console.error(e);
    app.replaceChildren(aviso(`Error al abrir la pantalla: ${e.message}`, "error"), h("a", { class: "btn secundario", href: "#/" }, "Volver al inicio"));
  }
}

function vistaInicio() {
  const s = leerSesion();
  app.replaceChildren(
    !s.obra ? aviso("Primero elegí la obra (o Planta) arriba.", "alerta") : !s.usuario ? aviso("Elegí quién carga (arriba).", "alerta") : "",
    h("h1", { class: "titulo-inicio" }, "¿Qué vas a cargar?"),
    h("div", { class: "grilla-formularios" }, FORMULARIOS.map((f) =>
      h("a", { class: "btn-formulario", href: `#/${f.ruta}`, id: `ir-${f.ruta}` },
        h("span", { class: "icono", "aria-hidden": "true" }, f.icono),
        h("span", { class: "texto" }, h("b", {}, `${f.cod} · ${f.titulo}`), h("small", {}, f.donde))))),
    h("a", { class: "btn secundario ancho", href: "#/envios" }, "📤 Envíos del celular"));
}

function vistaObra() {
  const d = {};
  app.replaceChildren(h("h1", {}, "Elegí la obra"),
    selectorObra(d, "obra", { etiqueta: "Obra o lugar", incluirPlanta: true, alCambiar: (o) => {
      const antes = leerSesion().obra;
      guardarSesion({ obra: { id: o.id, name: o.name, partner_id: o.partner_id, user_id: o.user_id, x_mock_km: o.x_mock_km }, ...(antes?.id !== o.id ? { usuario: null } : {}) });
      location.hash = "#/sesion";
    } }));
}

async function vistaSesion() {
  const s = leerSesion();
  if (!s.obra) { location.hash = "#/obra"; return; }
  app.replaceChildren(h("h1", {}, "¿Quién carga?"), h("p", { class: "ayuda" }, `Personas habilitadas en ${s.obra.name}.`), h("p", { class: "cargando" }, "Cargando…"));
  const usuarios = await leerUsuariosLocales(s.obra.id);
  app.replaceChildren(h("h1", {}, "¿Quién carga?"),
    h("p", { class: "ayuda" }, `Personas habilitadas en ${s.obra.name}. Nadie carga por otro.`),
    usuarios.length ? h("div", { class: "lista-botones" }, usuarios.map((u) => h("button", {
      type: "button", class: `btn-lista ${s.usuario?.id === u.id ? "elegida" : ""}`,
      onclick: () => { guardarSesion({ usuario: u }); location.hash = "#/"; }
    }, h("b", {}, u.nombre), h("br"), h("small", {}, u.rol)))) : aviso("Esta obra no tiene usuarios cargados.", "alerta"),
    CONFIG.MOCK ? aviso("Mock: se elige de la lista. El ingreso real (PIN, enlace, etc.) está por definir.", "info") : "");
}

function vistaEnvios() {
  const ESTADO = { pendiente: "📱 En el celular", enviado: "✅ Enviado a Odoo", rechazado: "⛔ Rechazado" };
  const pintar = () => {
    const cola = listarCola();
    app.replaceChildren(h("h1", {}, "Envíos del celular"),
      aviso("Hasta que no figura «Enviado a Odoo», no se hizo.", "info"),
      h("div", { class: "acciones" },
        h("button", { type: "button", class: "btn primario", id: "btn-reintentar", onclick: async () => { await procesarCola(); pintar(); } }, "Reintentar ahora"),
        h("button", { type: "button", class: "btn secundario", onclick: () => { limpiarEnviados(); pintar(); } }, "Limpiar enviados")),
      cola.length ? h("ul", { class: "lista-envios" }, cola.map((e) => h("li", { class: e.estado },
        h("b", {}, `HYS-${e.formulario} · ${e.titulo}`), h("br"),
        h("span", {}, ESTADO[e.estado], e.estado === "enviado" ? ` (${e.respuesta.name})` : "", e.estado === "rechazado" ? `: ${e.error}` : ""),
        e.estado === "pendiente" && e.error ? h("small", {}, ` · último intento: ${e.error}`) : "",
        h("br"), h("small", {}, new Date(e.creado).toLocaleString("es-AR"))))) : h("p", { class: "ayuda" }, "No hay envíos todavía."),
      CONFIG.MOCK ? h("details", { class: "mock-panel" }, h("summary", {}, "Herramientas de prueba (mock)"),
        h("label", { class: "casilla" }, h("input", { type: "checkbox", id: "sim-sin-senal", checked: localStorage.getItem("hys_simular_sin_senal") === "1",
          onchange: (ev) => { localStorage.setItem("hys_simular_sin_senal", ev.target.checked ? "1" : "0"); } }), h("span", {}, "Simular sin señal")),
        h("button", { type: "button", class: "btn chico", onclick: () => { if (confirm("¿Borrar la base mock local?")) { reiniciarMock(); pintar(); } } }, "Reiniciar datos mock")) : "");
  };
  pintar();
}

window.addEventListener("hashchange", rutear);
window.addEventListener("hys:sesion", () => pintarEncabezado(encabezado));
alCambiar(() => pintarEncabezado(encabezado));
iniciarCola();
rutear();
