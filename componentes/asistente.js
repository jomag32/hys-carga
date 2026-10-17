// Motor de "asistente" por pasos, compartido por todas las vistas F01–F08.
// Cada vista declara pasos cortos (pocos campos por pantalla); el motor agrega:
//   · Atrás / Siguiente con validación por paso, barra de progreso,
//   · pantalla final de Revisión + Enviar,
//   · campos automáticos (idempotency key al abrir, GPS al cargar, fecha/hora al enviar),
//   · borrador en el celular (si se sale a mitad de camino, se retoma con la MISMA clave),
//   · envío a la cola sin conexión (api/cola.js) y resultado visible.
//
// def = {
//   codigo: "F02", titulo: "Inspección de obra",
//   preparar?: async (ctx) => {...}     // lee catálogos y los deja en ctx
//   inicial?: (ctx) => ({...})          // datos iniciales del formulario
//   pasos: [...] o (ctx) => [...], cada uno { titulo, visible?(d, ctx), dibujar(d, ctx) → Node|Node[], validar?(d, ctx) → "error"|null }],
//   resumen: (d, ctx) => [[etiqueta, valor], ...],
//   armar: (d, auto, ctx) => ({ operacion: "crear"|"escribir", modelo, valores, ids? })
// }

import { h } from "./util.js";
import { aviso } from "./campos.js";
import { nuevaClaveIdempotencia, tomarGps, ahoraIso, TEXTO_GPS } from "./campos-auto.js";
import { leerSesion } from "./sesion.js";
import { encolar, procesarCola, buscarEnvio } from "../api/cola.js";

export async function montarAsistente(cont, def) {
  const claveBorrador = `hys_borrador_${def.codigo}`;
  const ctx = { sesion: leerSesion() };
  cont.replaceChildren(h("p", { class: "cargando" }, "Cargando…"));
  try { await def.preparar?.(ctx); }
  catch (e) { cont.replaceChildren(aviso(`No se pudieron leer los datos: ${e.message}`, "error")); return; }

  let borrador = null;
  try { borrador = JSON.parse(localStorage.getItem(claveBorrador) || "null"); } catch (e) { /* nada */ }
  const d = borrador?.d || def.inicial?.(ctx) || {};
  const auto = borrador?.auto || { idempotency_key: nuevaClaveIdempotencia(), abierto: ahoraIso(), gps: { estado: "pendiente" } };
  let i = borrador?.paso || 0;
  let error = null;

  // D-03: el GPS se toma al cargar el formulario; si falla, se envía igual con la marca.
  const pedirGps = () => {
    auto.gps = { estado: "pendiente" }; pintarGps();
    tomarGps().then((g) => { auto.gps = g; pintarGps(); });
  };
  const chipGps = h("div", { class: "chip-gps" });
  function pintarGps() {
    const g = auto.gps;
    chipGps.className = `chip-gps ${g.estado}`;
    chipGps.replaceChildren(`📍 ${TEXTO_GPS[g.estado] || g.estado}`,
      g.estado === "ok" ? ` (±${g.precision} m)` : "",
      !["ok", "pendiente"].includes(g.estado) ? h("button", { type: "button", class: "btn chico", onclick: pedirGps }, "Reintentar") : "");
  }
  if (auto.gps?.estado !== "ok") pedirGps(); else pintarGps();

  const guardarBorrador = () => {
    try { localStorage.setItem(claveBorrador, JSON.stringify({ d, auto, paso: i })); }
    catch (e) { console.warn("No se pudo guardar el borrador (espacio)", e); }
  };
  const descartar = () => {
    if (!confirm("¿Descartar lo cargado en este formulario?")) return;
    localStorage.removeItem(claveBorrador); location.hash = "#/";
  };
  ctx.refrescar = () => pintar();

  const todos = () => (typeof def.pasos === "function" ? def.pasos(ctx) : def.pasos);
  const visibles = () => todos().filter((p) => !p.visible || p.visible(d, ctx));

  const titulo = h("div", { class: "form-titulo" }, h("span", { class: "codigo" }, `HYS-${def.codigo}`), h("h1", {}, def.titulo));
  const progreso = h("div", { class: "progreso" });
  const cuerpo = h("section", { class: "paso" });
  const nav = h("nav", { class: "nav-pasos" });
  cont.replaceChildren(titulo, borrador ? h("div", { class: "aviso info" }, "Seguís un borrador guardado en el celular. ",
    h("button", { type: "button", class: "btn chico", onclick: descartar }, "Descartar")) : "", chipGps, progreso, cuerpo, nav);

  function pintar() {
    const ps = visibles();
    if (i > ps.length) i = ps.length;
    const enRevision = i === ps.length;
    progreso.replaceChildren(
      h("div", { class: "barra" }, h("div", { class: "relleno", style: `width:${Math.round((i / ps.length) * 100)}%` })),
      h("p", {}, enRevision ? "Revisión final" : `Paso ${i + 1} de ${ps.length} · ${ps[i].titulo}`));
    const contenido = enRevision ? revision(ps) : [h("h2", {}, ps[i].titulo), ps[i].dibujar(d, ctx)];
    cuerpo.replaceChildren(...[contenido].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false && x !== ""), error ? aviso(error, "error") : "");
    nav.replaceChildren(
      h("button", { type: "button", class: "btn secundario", onclick: atras }, i === 0 ? "Salir" : "← Atrás"),
      enRevision
        ? h("button", { type: "button", class: "btn primario", id: "btn-enviar", onclick: enviar }, "Enviar ✓")
        : h("button", { type: "button", class: "btn primario", id: "btn-siguiente", onclick: siguiente }, "Siguiente →"));
    window.scrollTo(0, 0);
  }

  function revision() {
    const u = ctx.sesion.usuario || {};
    const filas = [...def.resumen(d, ctx),
      ["Carga", `${u.nombre || "—"} · ${u.rol || ""}`],
      ["Ubicación", auto.gps.estado === "ok" ? `${auto.gps.lat.toFixed(5)}, ${auto.gps.lon.toFixed(5)} (±${auto.gps.precision} m)` : TEXTO_GPS[auto.gps.estado]],
      ["Fecha y hora", "Se toma al tocar «Enviar»"]];
    return [h("h2", {}, "Revisá antes de enviar"),
      h("dl", { class: "resumen" }, filas.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v === "" || v == null ? "—" : String(v))])),
      aviso("Hasta que no figure «Enviado», no se hizo.", "info")];
  }

  function atras() {
    error = null;
    if (i === 0) { guardarBorrador(); location.hash = "#/"; return; }
    i--; guardarBorrador(); pintar();
  }
  function siguiente() {
    const p = visibles()[i];
    error = p.validar?.(d, ctx) || null;
    if (!error) { i++; guardarBorrador(); }
    pintar();
  }

  async function enviar(e) {
    e.target.disabled = true;
    const u = ctx.sesion.usuario;
    if (!u) { error = "No hay usuario elegido. Volvé al inicio y elegí quién carga."; pintar(); return; }
    if (auto.gps.estado === "pendiente") auto.gps = { lat: null, lon: null, precision: null, fecha: ahoraIso(), estado: "sin_posicion" };
    auto.fecha_hora_control = ahoraIso();
    try {
      const envio = def.armar(d, auto, ctx);
      await encolar({ ...envio, formulario: def.codigo, titulo: def.titulo, idempotency_key: auto.idempotency_key });
    } catch (err) { error = err.message; e.target.disabled = false; pintar(); return; }
    localStorage.removeItem(claveBorrador);
    cuerpo.replaceChildren(h("p", { class: "cargando" }, "Enviando…"));
    nav.replaceChildren();
    await procesarCola();
    resultado(buscarEnvio(auto.idempotency_key));
  }

  function resultado(env) {
    progreso.replaceChildren();
    const caja = env?.estado === "enviado"
      ? h("div", { class: "resultado ok", id: "resultado" }, h("p", { class: "grande" }, env.respuesta?.simulado ? "✅ Enviado (modo prueba)" : "✅ Enviado a Odoo"),
        h("p", {}, `${env.respuesta.name}`),
        env.respuesta?.simulado ? h("p", { class: "ayuda" }, "Modo prueba: los datos quedaron en este celular y no llegaron a Odoo.") : "")
      : env?.estado === "rechazado"
        ? h("div", { class: "resultado error", id: "resultado" }, h("p", { class: "grande" }, "⛔ Rechazado"), h("p", {}, env.error))
        : h("div", { class: "resultado pendiente", id: "resultado" }, h("p", { class: "grande" }, "📱 Guardado en el celular"),
          h("p", {}, "Sin señal por ahora. Se envía solo cuando vuelva la conexión. Todavía NO cuenta como hecho."));
    cuerpo.replaceChildren(caja);
    nav.replaceChildren(
      h("a", { class: "btn secundario", href: "#/envios" }, "Ver envíos"),
      h("a", { class: "btn primario", href: "#/" }, "Volver al inicio"));
  }

  pintar();
}
