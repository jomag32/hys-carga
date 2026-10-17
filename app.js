// hys-carga · arranque y ruteo por hash (#/f01, #/envios, ...). Vanilla JS, sin build.
// Cada formulario es un módulo ES en vistas/ que se carga recién cuando se abre (import()).

import { h } from "./componentes/util.js";
import { pintarEncabezado } from "./componentes/encabezado.js";
import { leerSesion, guardarSesion, cerrarSesion } from "./componentes/sesion.js";
import { selectorObra } from "./componentes/selector-obra.js";
import { montarAsistente } from "./componentes/asistente.js";
import { aviso } from "./componentes/campos.js";
import { leerUsuariosLocales, reiniciarMock, listarEnviadosSimulados, borrarEnviadosSimulados } from "./api/odoo.js";
import { iniciarCola, listarCola, procesarCola, limpiarEnviados, alCambiar, contarPendientes } from "./api/cola.js";
import { ahoraIso } from "./componentes/campos-auto.js";
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
const MODO_DEV = new URLSearchParams(location.search).get("dev") === "1";
const encabezado = document.getElementById("encabezado");

async function rutear() {
  pintarEncabezado(encabezado);
  const ruta = (location.hash.replace(/^#\/?/, "") || "inicio").split("?")[0];
  const s = leerSesion();
  const form = FORMULARIOS.find((f) => f.ruta === ruta);
  try {
    if (ruta === "ingresar" || ruta === "obra" || ruta === "sesion") return vistaIngreso();
    if (ruta === "salir") { cerrarSesion(); location.replace("#/ingresar"); return; }
    if (ruta === "envios") return vistaEnvios();
    // Sin ingreso (obra + usuario de la lista) no se carga nada.
    if (!s.obra || !s.usuario) { location.replace("#/ingresar"); return; }
    if (form) {
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
  const pend = contarPendientes();
  app.replaceChildren(
    pend ? h("div", { class: "aviso alerta caja-pendientes", id: "aviso-pendientes" },
      h("span", {}, `📱 ${pend} envío${pend > 1 ? "s" : ""} en el celular, sin mandar todavía.`),
      h("button", { type: "button", class: "btn chico", onclick: async () => { await procesarCola(); rutear(); } }, "Reintentar")) : "",
    h("h1", { class: "titulo-inicio" }, "¿Qué vas a cargar?"),
    h("div", { class: "grilla-formularios" }, FORMULARIOS.map((f) =>
      h("a", { class: "btn-formulario", href: `#/${f.ruta}`, id: `ir-${f.ruta}` },
        h("span", { class: "icono", "aria-hidden": "true" }, f.icono),
        h("span", { class: "texto" }, h("b", {}, `${f.cod} · ${f.titulo}`), h("small", {}, f.donde))))),
    h("a", { class: "btn secundario ancho", href: "#/envios" }, "📤 Envíos del celular"));
}

// Ingreso (D-04 revisada): 1) elegir la obra, 2) elegir el nombre de la lista fija de esa obra.
// Método de acceso (PIN, enlace, etc.) PENDIENTE (§7.4 #4): hoy es solo elegir, sin contraseñas.
function vistaIngreso() {
  const s = leerSesion();
  const d = { obra: s.obra || undefined };
  const marca = h("div", { class: "ingreso-marca" }, h("b", {}, "HyS · Tecnología ARME"), h("span", {}, "Carga de Higiene y Seguridad en obra"));
  const pasos = (n) => h("div", { class: "pasos-ingreso" },
    h("span", { class: n === 1 ? "activo" : "" }, "1. Obra"), h("span", {}, "›"), h("span", { class: n === 2 ? "activo" : "" }, "2. Quién sos"));
  const paso1 = () => app.replaceChildren(marca, pasos(1), h("h1", {}, "Ingresar"),
    selectorObra(d, "obra", { etiqueta: "¿En qué obra o lugar estás?", incluirPlanta: true, alCambiar: (o) => paso2(o) }));
  const paso2 = async (o) => {
    app.replaceChildren(marca, pasos(2), h("h1", {}, "¿Quién sos?"), h("p", { class: "cargando" }, "Cargando…"));
    let usuarios = [];
    try { usuarios = await leerUsuariosLocales(o.id); }
    catch (e) { app.replaceChildren(marca, aviso(e.message, "error"), h("button", { type: "button", class: "btn secundario", onclick: paso1 }, "← Volver")); return; }
    app.replaceChildren(marca, pasos(2), h("h1", {}, "¿Quién sos?"),
      h("p", { class: "ayuda" }, `Personas habilitadas en ${o.name}. Nadie carga por otro.`),
      usuarios.length ? h("div", { class: "lista-botones", id: "lista-usuarios" }, usuarios.map((u) => h("button", {
        type: "button", class: "btn-lista", "data-usuario-id": u.id,
        onclick: () => {
          const { id, name, ot, partner_id, user_id, x_mock_km } = o;
          guardarSesion({ obra: { id, name, ot, partner_id, user_id, x_mock_km }, usuario: u, ingreso: ahoraIso() });
          location.hash = "#/";
        }
      }, h("b", {}, u.nombre), h("br"), h("small", {}, `${u.rol} · ${u.id}`)))) : aviso("Esta obra no tiene personas habilitadas en la lista.", "alerta"),
      aviso("Acceso con PIN u otro método: pendiente de definir. Por ahora solo se elige el nombre.", "info"),
      h("button", { type: "button", class: "btn secundario", id: "btn-cambiar-obra", onclick: paso1 }, "← Cambiar obra"));
  };
  paso1();
}

function vistaEnvios() {
  const prueba = CONFIG.MODO_ENVIO === "simulado";
  const ESTADO = { pendiente: "📱 En el celular", enviado: prueba ? "✅ Enviado (modo prueba)" : "✅ Enviado a Odoo", rechazado: "⛔ Rechazado" };
  const pintar = () => {
    const cola = listarCola();
    const pend = cola.filter((e) => e.estado === "pendiente").length;
    app.replaceChildren(h("h1", {}, "Envíos del celular"),
      aviso("Hasta que no figura «Enviado», no se hizo.", "info"),
      h("p", { id: "cant-pendientes" }, h("b", {}, `${pend} pendiente${pend === 1 ? "" : "s"}`), navigator.onLine ? "" : " · sin señal ahora"),
      h("div", { class: "acciones" },
        h("button", { type: "button", class: "btn primario", id: "btn-reintentar", onclick: async () => { await procesarCola(); pintar(); } }, "Reintentar ahora"),
        h("button", { type: "button", class: "btn secundario", onclick: async () => { await limpiarEnviados(); pintar(); } }, "Limpiar enviados")),
      cola.length ? h("ul", { class: "lista-envios" }, cola.map((e) => h("li", { class: e.estado },
        h("b", {}, `HYS-${e.formulario} · ${e.titulo}`), h("br"),
        h("span", {}, ESTADO[e.estado], e.estado === "enviado" ? ` (${e.respuesta.name})` : "", e.estado === "rechazado" ? `: ${e.error}` : ""),
        e.estado === "pendiente" && e.error ? h("small", {}, ` · último intento: ${e.error}`) : "",
        h("br"), h("small", {}, new Date(e.creado).toLocaleString("es-AR", { hour12: false }))))) : h("p", { class: "ayuda" }, "No hay envíos todavía."),
      MODO_DEV ? panelDev(pintar) : "");
  };
  pintar();
  // Si la cola cambia (reintento automático, vuelve la señal), se actualiza la lista.
  const quitar = alCambiar(() => { if (location.hash.startsWith("#/envios")) pintar(); else quitar(); });
}

// Panel solo para desarrollo: aparece con ?dev=1 en la URL. Muestra el modo y los payloads «enviados».
function panelDev(repintar) {
  const enviados = listarEnviadosSimulados();
  return h("details", { class: "panel-dev", open: true, id: "panel-dev" }, h("summary", {}, "Herramientas de desarrollo"),
    h("p", { class: "modo" }, "Envío: ", h("span", { class: "etiqueta-modo" }, CONFIG.MODO_ENVIO), ` · API_BASE ${CONFIG.API_BASE} · catálogos ${CONFIG.MOCK ? "de ejemplo" : "del backend"}`),
    h("label", { class: "casilla" }, h("input", { type: "checkbox", id: "sim-sin-senal", checked: localStorage.getItem("hys_simular_sin_senal") === "1",
      onchange: (ev) => { localStorage.setItem("hys_simular_sin_senal", ev.target.checked ? "1" : "0"); } }), h("span", {}, "Simular sin señal")),
    h("div", { class: "acciones" },
      h("button", { type: "button", class: "btn chico", onclick: () => { if (confirm("¿Borrar los datos de ejemplo guardados en este navegador?")) { reiniciarMock(); repintar(); } } }, "Reiniciar datos de ejemplo"),
      h("button", { type: "button", class: "btn chico", onclick: () => { borrarEnviadosSimulados(); repintar(); } }, "Borrar «enviados» simulados")),
    h("h3", {}, `Payloads «enviados» (modo simulado): ${enviados.length}`),
    enviados.map((x, i) => h("details", { class: "payload", open: i === 0 },
      h("summary", {}, `${x.respuesta.name} · ${x.endpoint} · ${new Date(x.recibido).toLocaleString("es-AR", { hour12: false })}`),
      h("pre", { class: "payload-json" }, `Idempotency-Key: ${x.idempotency_key}\n\n${JSON.stringify(x.cuerpo, null, 2)}`))));
}

window.addEventListener("hashchange", rutear);
window.addEventListener("hys:sesion", () => pintarEncabezado(encabezado));
alCambiar(() => pintarEncabezado(encabezado));
iniciarCola();
rutear();
