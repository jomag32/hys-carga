// hys-carga · arranque y ruteo por hash (#/f01, #/envios, ...). Vanilla JS, sin build.
// Cada formulario es un módulo ES en vistas/ que se carga recién cuando se abre (import()).

import { h } from "./componentes/util.js";
import { pintarEncabezado } from "./componentes/encabezado.js";
import { leerSesion, guardarSesion, cerrarSesion, usuarioVigente } from "./componentes/sesion.js";
import { selectorObra } from "./componentes/selector-obra.js";
import { opcionesLugarPara, lugarSector, lugarPlanta, lugarObra } from "./componentes/lugares.js";
import { montarAsistente } from "./componentes/asistente.js";
import { aviso, campoOpciones } from "./componentes/campos.js";
import { leerUsuariosDeIngreso, ingresarInspector, reiniciarMock, listarEnviadosSimulados, borrarEnviadosSimulados } from "./api/odoo.js";
import { iniciarCola, listarCola, procesarCola, limpiarEnviados, alCambiar, contarPendientes, formularioConectado, envioEnPrueba, TEXTO_PRUEBA, ETIQUETA_PRUEBA } from "./api/cola.js";
import { ahoraIso, mostrarFechaHora } from "./componentes/campos-auto.js";
import { CONFIG } from "./api/config.js";
import { registrarServiceWorker, bloqueInstalar } from "./componentes/pwa.js";
import { etiquetaVersion } from "./componentes/version.js";
import { botonPdfAts, tienePdfAts } from "./componentes/pdf-ats.js";
import { vistaManual } from "./componentes/manual.js";

// Códigos y nombres tal cual el diseño (Anexo B).
/** Un encargado de sector solo ve el ATS de turno (F08); el backend igual lo controla. */
// Encargados: F08 y F05 (el registro de accidente lo puede hacer cualquiera). F06 (cargar y ver #/vencimientos) y F07 (cierre de desvíos): solo HyS.
export const ROLES_HYS = ["inspector", "responsable", "desarrollo"];
export const esHys = (u) => !!u && ROLES_HYS.includes(u.rol_hys || "inspector");
export const formulariosDe = (u) => (u?.rol_hys === "encargado" ? FORMULARIOS.filter((f) => f.cod === "F08" || f.cod === "F05")
  : esHys(u) ? FORMULARIOS : FORMULARIOS.filter((f) => f.cod !== "F06" && f.cod !== "F07"));
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
  // Manual de uso: se puede leer sin ingresar (#/manual o #/manual/f05).
  if (ruta === "manual" || ruta.startsWith("manual/")) return vistaManual(app, ruta.split("/")[1]?.toUpperCase());
  let s = leerSesion();
  // Sesiones de la lista fija vieja (usuarios de ejemplo): se piden de nuevo con un inspector.
  // Con backend real hace falta el token de la contraseña (ingreso por inspector, 18/10/2026 19:34).
  if (s.usuario && (!usuarioVigente(s.usuario) || (CONFIG.OBRAS_FUENTE === "backend" && !s.usuario.token)
    || (s.usuario.vence && Date.parse(s.usuario.vence) < Date.now()))) { cerrarSesion(); s = leerSesion(); }
  const form = formulariosDe(leerSesion().usuario).find((f) => f.ruta === ruta);
  try {
    if (ruta === "ingresar" || ruta === "obra" || ruta === "lugar" || ruta === "sesion") return vistaIngreso();
    if (ruta === "salir") { cerrarSesion(); location.replace("#/ingresar"); return; }
    if (ruta === "envios") return vistaEnvios();
    // Sin ingreso (lugar + usuario) no se carga nada.
    if (!s.obra || !s.usuario) { location.replace("#/ingresar"); return; }
    if (ruta === "vencimientos" && !esHys(s.usuario)) { location.replace("#/"); return; }
    if (ruta === "vencimientos") return (await import("./vistas/vencimientos.js")).default(app);
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
    h("div", { class: "grilla-formularios" }, formulariosDe(leerSesion().usuario).map((f) =>
      h("a", { class: "btn-formulario", href: `#/${f.ruta}`, id: `ir-${f.ruta}` },
        h("span", { class: "icono", "aria-hidden": "true" }, f.icono),
        h("span", { class: "texto" }, h("b", {}, `${f.cod} · ${f.titulo}`), h("small", {}, f.donde),
          formularioConectado(f.cod) ? "" : h("span", { class: "badge-prueba" }, ETIQUETA_PRUEBA))))),
    esHys(leerSesion().usuario) ? h("a", { class: "btn secundario ancho", href: "#/vencimientos", id: "ir-vencimientos" }, "📅 Vencimientos legales (ver estado)") : "",
    h("a", { class: "btn secundario ancho", href: "#/envios" }, "📤 Envíos del celular"),
    h("a", { class: "btn secundario ancho", href: "#/manual", id: "ir-manual" }, "📖 Manual de uso de las fichas"),
    etiquetaVersion());
}

// Ingreso: 1) nombre → 2) contraseña → 3) SECTOR/lugar → 4) OF solo si el lugar es «Obra»
// (27/10/2026: sector antes de la OF; Depósito/Logística/Planta no piden OF).
// Con sesión vigente, #/ingresar va al paso de lugar (cambiar sin volver a ingresar).
function vistaIngreso() {
  const s = leerSesion();
  const d = { obra: undefined, lugar_clave: undefined };
  const marca = h("div", { class: "ingreso-marca" }, h("b", {}, "HyS · Tecnología ARME"), h("span", {}, "Carga de Higiene y Seguridad en obra"));
  const pasos = (n) => h("div", { class: "pasos-ingreso" },
    h("span", { class: n === 1 ? "activo" : "" }, "1. Quién sos"), h("span", {}, "›"), h("span", { class: n === 2 ? "activo" : "" }, "2. Contraseña"),
    h("span", {}, "›"), h("span", { class: n === 3 ? "activo" : "" }, "3. Sector"),
    h("span", {}, "›"), h("span", { class: n === 4 ? "activo" : "" }, "4. OF"));
  // 1) nombre
  const paso1 = async () => {
    app.replaceChildren(marca, pasos(1), h("h1", {}, "¿Quién sos?"), h("p", { class: "cargando" }, "Cargando…"));
    let usuarios = [];
    try { usuarios = await leerUsuariosDeIngreso(); }
    catch (e) { app.replaceChildren(marca, aviso(`No se pudo leer la lista de inspectores (${e.message}). La primera vez hace falta señal; probá de nuevo.`, "error"),
      h("button", { type: "button", class: "btn primario", onclick: () => paso1() }, "Reintentar")); return; }
    app.replaceChildren(marca, pasos(1), h("h1", {}, "¿Quién sos?"),
      h("p", { class: "ayuda" }, "Inspectores de HyS activos. Elegí tu nombre: nadie carga por otro."),
      usuarios.length ? h("div", { class: "lista-botones", id: "lista-usuarios" }, usuarios.map((u) => h("button", {
        type: "button", class: "btn-lista", "data-usuario-id": u.id,
        onclick: () => paso2(u)
      }, h("b", {}, u.nombre), h("br"), h("small", {}, [u.legajo ? `Legajo ${u.legajo}` : null, u.tipo === "externo" ? `externo${u.empresa ? " · " + u.empresa : ""}` : null, u.rol].filter(Boolean).join(" · "))))) : aviso("No hay inspectores activos en Odoo (HyS > Inspectores). Pedile a HyS que te dé de alta.", "alerta"),
      bloqueInstalar(), etiquetaVersion());
  };
  // 2) contraseña
  const paso2 = (u) => {
    const error = h("div", { id: "error-ingreso", role: "alert" });
    const campo = h("input", { type: "password", id: "clave-ingreso", class: "entrada", autocomplete: "current-password",
      autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go",
      oninput: () => error.replaceChildren(), onkeydown: (e) => { if (e.key === "Enter") entrar(); } });
    const boton = h("button", { type: "button", class: "btn primario ancho", id: "btn-ingresar", onclick: () => entrar() }, "Ingresar");
    const entrar = async () => {
      boton.disabled = true; boton.textContent = "Verificando…"; error.replaceChildren();
      try {
        const r = await ingresarInspector(u.id, campo.value);
        guardarSesion({ obra: null, usuario: { ...u, token: r.token, vence: r.vence }, ingreso: ahoraIso() });
        paso3();
      } catch (e) {
        error.replaceChildren(aviso(e.message, "error"));
        boton.disabled = false; boton.textContent = "Ingresar"; campo.select();
      }
    };
    app.replaceChildren(marca, pasos(2), h("h1", {}, u.nombre),
      h("p", { class: "ayuda" }, [u.legajo ? `Legajo ${u.legajo}` : null, u.rol].filter(Boolean).join(" · ")),
      h("div", { class: "campo" }, h("label", { class: "etiqueta", for: "clave-ingreso" }, "Tu contraseña"), campo),
      CONFIG.OBRAS_FUENTE !== "backend" ? aviso("Modo ejemplo: la contraseña no se verifica y nada llega a Odoo.", "info") : "",
      error, boton,
      h("button", { type: "button", class: "btn secundario", id: "btn-otro-nombre", onclick: () => paso1() }, "← No soy yo"));
    campo.focus();
  };
  const entrarConLugar = (lugar) => {
    guardarSesion({ obra: lugar });
    location.hash = "#/";
  };
  // 3) sector / lugar (antes de la OF)
  const paso3 = () => {
    const u = leerSesion().usuario;
    const ops = opcionesLugarPara(u);
    // Encargado con un solo sector: no hay elección → ir directo sin OF.
    if (u?.rol_hys === "encargado" && ops.length === 1 && ops[0].tipo === "sector") {
      entrarConLugar(lugarSector(ops[0].sector));
      return;
    }
    d.lugar_clave = undefined;
    const cuerpo = h("div", { id: "paso-lugar" });
    const pintar = () => {
      cuerpo.replaceChildren(
        campoOpciones(d, "lugar_clave", "Sector / lugar", ops.map((o) => [o.clave, o.name]), {
          columnas: 1, requerido: true,
          alCambiar: (clave) => {
            const op = ops.find((x) => x.clave === clave);
            if (!op) return;
            if (op.tipo === "obra") { paso4(); return; }
            if (op.tipo === "sector") { entrarConLugar(lugarSector(op.sector)); return; }
            if (op.tipo === "planta") { entrarConLugar(lugarPlanta()); return; }
          }
        }),
        h("p", { class: "ayuda" }, "Si estás en una obra, elegí «Obra» y después la OT. Si estás en Depósito o Logística, no hace falta OF.")
      );
    };
    app.replaceChildren(marca, pasos(3), h("h1", {}, "¿Dónde estás?"),
      h("p", { class: "ayuda", id: "ingreso-quien" }, `Ingresaste como ${u?.nombre || ""}.`),
      cuerpo,
      h("a", { class: "btn secundario", id: "btn-otro-inspector", href: "#/salir" }, "← No soy yo / Salir"),
      bloqueInstalar(), etiquetaVersion());
    pintar();
  };
  // 4) OF / proyecto (solo si el lugar es Obra; hace falta token para listar obras)
  const paso4 = () => {
    const u = leerSesion().usuario;
    d.obra = undefined;
    app.replaceChildren(marca, pasos(4), h("h1", {}, "¿En qué obra (OF) estás?"),
      h("p", { class: "ayuda", id: "ingreso-quien" }, `Ingresaste como ${u?.nombre || ""}. Elegiste sector Obra.`),
      selectorObra(d, "obra", { etiqueta: "Obra (OT)", incluirPlanta: false, prefill: false, alCambiar: (o) => {
        const lugar = lugarObra(o);
        if (lugar) entrarConLugar(lugar);
      } }),
      h("button", { type: "button", class: "btn secundario", id: "btn-otro-lugar", onclick: () => paso3() }, "← Cambiar sector"),
      h("a", { class: "btn secundario", id: "btn-otro-inspector", href: "#/salir" }, "← No soy yo / Salir"),
      bloqueInstalar(), etiquetaVersion());
  };
  if (s.usuario) paso3(); else paso1();
}

function vistaEnvios() {
  // «Enviado a Odoo» solo si el backend real respondió; lo de modo prueba quedó en el celular.
  const estado = (e) => (e.estado === "enviado" ? (envioEnPrueba(e) ? `💾 ${TEXTO_PRUEBA}` : "✅ Enviado a Odoo")
    : e.estado === "pendiente" ? "📱 En el celular" : "⛔ Rechazado");
  const pintar = () => {
    const cola = listarCola();
    const pend = cola.filter((e) => e.estado === "pendiente").length;
    app.replaceChildren(h("h1", {}, "Envíos del celular"),
      aviso("Hasta que no figura «Enviado», no se hizo.", "info"),
      h("p", { id: "cant-pendientes" }, h("b", {}, `${pend} pendiente${pend === 1 ? "" : "s"}`), navigator.onLine ? "" : " · sin señal ahora"),
      h("div", { class: "acciones" },
        h("button", { type: "button", class: "btn primario", id: "btn-reintentar", onclick: async () => { await procesarCola(); pintar(); } }, "Reintentar ahora"),
        h("button", { type: "button", class: "btn secundario", onclick: async () => { await limpiarEnviados(); pintar(); } }, "Limpiar enviados")),
      cola.some((e) => envioEnPrueba(e)) ? h("p", { class: "ayuda" }, "Los de modo prueba quedan en la lista (no se limpian): son lo único guardado de esos formularios.") : "",
      cola.length ? h("ul", { class: "lista-envios" }, cola.map((e) => h("li", { class: `${e.estado}${envioEnPrueba(e) ? " prueba" : ""}`, "data-clave": e.idempotency_key },
        h("b", {}, `HYS-${e.formulario} · ${e.titulo}`), envioEnPrueba(e) ? [" ", h("span", { class: "badge-prueba" }, ETIQUETA_PRUEBA)] : "", h("br"),
        h("span", { class: "estado-envio" }, estado(e), e.estado === "enviado" ? ` (${e.respuesta?.name || ""})` : "", e.estado === "rechazado" ? `: ${e.error}` : ""),
        e.estado === "pendiente" && e.error ? h("small", {}, ` · último intento: ${e.error}`) : "",
        tienePdfAts(e) ? [h("br"), botonPdfAts(e, { clase: "btn chico" })] : "",
        h("br"), h("small", {}, mostrarFechaHora(e.creado))))) : h("p", { class: "ayuda" }, "No hay envíos todavía."),
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
    h("p", { class: "modo" }, "Envío: ", h("span", { class: "etiqueta-modo" }, CONFIG.MODO_ENVIO), ` · API_BASE ${CONFIG.API_BASE} · obras: ${CONFIG.OBRAS_FUENTE} · catálogos ${CONFIG.MOCK ? "de ejemplo" : "del backend"}`),
    h("label", { class: "casilla" }, h("input", { type: "checkbox", id: "sim-sin-senal", checked: localStorage.getItem("hys_simular_sin_senal") === "1",
      onchange: (ev) => { localStorage.setItem("hys_simular_sin_senal", ev.target.checked ? "1" : "0"); } }), h("span", {}, "Simular sin señal")),
    h("div", { class: "acciones" },
      h("button", { type: "button", class: "btn chico", onclick: () => { if (confirm("¿Borrar los datos de ejemplo guardados en este navegador?")) { reiniciarMock(); repintar(); } } }, "Reiniciar datos de ejemplo"),
      h("button", { type: "button", class: "btn chico", onclick: () => { borrarEnviadosSimulados(); repintar(); } }, "Borrar «enviados» simulados")),
    h("h3", {}, `Payloads «enviados» (modo simulado): ${enviados.length}`),
    enviados.map((x, i) => h("details", { class: "payload", open: i === 0 },
      h("summary", {}, `${x.respuesta.name} · ${x.endpoint} · ${mostrarFechaHora(x.recibido)}`),
      h("pre", { class: "payload-json" }, `Idempotency-Key: ${x.idempotency_key}\n\n${JSON.stringify(x.cuerpo, null, 2)}`))));
}

window.addEventListener("hashchange", rutear);
window.addEventListener("hys:sesion", () => pintarEncabezado(encabezado));
alCambiar(() => pintarEncabezado(encabezado));
registrarServiceWorker();
iniciarCola();
rutear();
