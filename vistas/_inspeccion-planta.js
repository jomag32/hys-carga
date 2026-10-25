// Base común de F03 (Recorrida semanal de Fábrica) y F04 (Check mensual de instalaciones).
// Ambos crean x_hys_inspeccion sin OT, con ítems por bloque y toma de conocimiento.

import { h } from "../componentes/util.js";
import { campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { leerRegistros, leerInspectores as leerInspectoresHys, leerCatalogoPlanta, aFormatoOdoo, validarInspeccion } from "../api/odoo.js";
import { selectorInspector, textoInspector } from "../componentes/selector-inspector.js";
import { camposControl } from "../componentes/campos-auto.js";
import { leerSesion } from "../componentes/sesion.js";

// ---------------------------------------------------------------- F03 conectado (fase 1, 25/10/2026)
// Igual que F02: inspector de x_hys_inspector (preseleccionado quien ingresó: nadie carga por otro),
// ítems del catálogo del backend (x_hys_item_plantilla), firma del inspector, toma de conocimiento
// precargada (nombre servido por el backend desde Odoo, editable por si firma un reemplazo).
// F04 (25/10/2026) usa lo mismo, con selector de lugar. Las funciones «de prueba» de abajo ya no las usa nadie conectado.

/** Catálogo + inspectores HyS. Ítems con id = código (la clave de d.respuestas). */
export async function prepararPlanta(ctx, formulario, lugar = "fabrica") {
  const [cat, inspectores] = await Promise.all([leerCatalogoPlanta(formulario, lugar), leerInspectoresHys()]);
  ctx.catalogo = cat;
  ctx.inspectores = inspectores;
  ctx.items = (cat.items || []).map((x) => ({ id: x.codigo, x_codigo: x.codigo, x_name: x.nombre, x_bloque: x.bloque, x_secuencia: x.secuencia }));
  if (!ctx.items.length) throw new Error("No llegaron los ítems de la recorrida. Probá de nuevo con señal.");
}

export function pasoInspectorHys({ avisoPeriodo = true } = {}) {
  return {
    titulo: "Inspector",
    dibujar: (d, ctx) => {
      const yo = ctx.sesion?.usuario || leerSesion().usuario;
      if (d.inspector_id == null && yo?.fuente === "x_hys_inspector" && ctx.inspectores.some((e) => e.id === yo.id)) d.inspector_id = yo.id;
      const av = avisoPeriodo && ctx.catalogo?.periodo?.aviso;
      return [av ? aviso(av, "alerta") : "", selectorInspector(d, "inspector_id", ctx.inspectores, { etiqueta: "Inspector" })];
    },
    validar: (d, ctx) => (!ctx.inspectores.some((e) => e.id === d.inspector_id) ? "Elegí el inspector." : null)
  };
}

export function pasoTomaConocimientoPrecargada(etiqueta, textoAyuda) {
  return {
    titulo: "Toma de conocimiento",
    dibujar: (d, ctx) => {
      if (d.tc_nombre === undefined) d.tc_nombre = ctx.catalogo?.toma_conocimiento?.nombre || "";
      const tc = ctx.catalogo?.toma_conocimiento;
      return [
        tc?.aviso ? aviso(tc.aviso, "alerta") : "",
        ctx.catalogo?.avisos?.filter((a) => a !== tc?.aviso).map((a) => aviso(a, "info")) || "",
        campoTexto(d, "tc_nombre", etiqueta, { requerido: true, autocomplete: "off", ayuda: "Si firma un reemplazo, cambiá el nombre." }),
        campoFirma(d, "tc_firma", "Firma «tomé conocimiento»", { requerido: true }),
        campoArea(d, "tc_obs", "Observaciones (opcional)", { filas: 2 }),
        aviso(textoAyuda, "info")];
    },
    validar: (d) => (!d.tc_nombre?.trim() ? "Falta el nombre de quien toma conocimiento." : !d.tc_firma ? "Falta la firma." : null)
  };
}

export function pasoFirmaInspector() {
  return {
    titulo: "Firma del inspector",
    dibujar: (d, ctx) => [
      aviso(`Firma de ${textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id)) || "quien inspeccionó"}.`, "info"),
      campoFirma(d, "firma_inspector", "Firma del inspector", { requerido: true })],
    validar: (d) => (!d.firma_inspector ? "Falta la firma del inspector." : null)
  };
}

/** Envío real (operacion «enviar» → POST /api/v1/inspecciones). Sin x_desvio_ids (D-04: el «No» queda en la línea). */
export function armarEnvioPlanta(d, auto, ctx, { formulario, tipo, lugar, etiquetaLugar }) {
  const { lineas, cantNo } = armarLineasYDesvios(ctx.items, d, { origen: formulario, ambito: lugar });
  const vals = aFormatoOdoo({
    x_formulario: formulario, x_ambito: lugar, x_lugar: lugar, x_tipo_programa: tipo, x_estado: "realizada",
    x_inspector_hys_id: d.inspector_id, x_tc_nombre: d.tc_nombre.trim(), x_tc_firma: d.tc_firma,
    x_firma_inspector: d.firma_inspector || false, x_tc_observaciones: d.tc_obs?.trim() || false, x_origen: "formulario",
    ...camposControl(auto), x_linea_ids: lineas });
  const errores = validarInspeccion(vals);
  if (errores.length) throw new Error(errores.map((x) => x.mensaje).join(" · "));
  const yo = leerSesion().usuario;
  return {
    operacion: "enviar", endpoint: "/inspecciones",
    auth: { inspector_id: yo?.id ?? null, token: yo?.token || null },
    cuerpo: { formulario, idempotency_key: auto.idempotency_key, odoo: { model: "x_hys_inspeccion", method: "create", vals },
      contexto: { lugar: etiquetaLugar, modalidad: "presencial", cant_no: cantNo, inspector_modelo: "x_hys_inspector", app: "hys-carga web" } }
  };
}

// ---------------------------------------------------------------- versión de prueba (F04, hasta la fase 2)

export async function leerInspectores() {
  return leerRegistros("hr.employee", [["x_mock_roles", "in", ["inspector"]]], ["name", "job_title"]);
}
export const leerItems = (formulario) =>
  leerRegistros("x_hys_item_plantilla", [["x_formulario", "=", formulario], ["x_active", "=", true]]);

export const bloquesDe = (items) => [...new Set(items.map((it) => it.x_bloque))];

export function pasoInspector() {
  return {
    titulo: "Inspector",
    dibujar: (d, ctx) => campoSelect(d, "inspector_id", "Inspector", ctx.inspectores.map((e) => [e.id, `${e.name} · ${e.job_title}`]), { requerido: true }),
    validar: (d) => (!d.inspector_id ? "Elegí el inspector." : null)
  };
}

/** Un paso por bloque. itemsDe(d, ctx) devuelve los ítems vigentes; nombres = lista fija de bloques posibles. */
export function pasosPorBloque(nombres, itemsDe, opts = {}) {
  return nombres.map((bloque) => ({
    titulo: bloque,
    visible: (d, ctx) => itemsDe(d, ctx).some((it) => it.x_bloque === bloque),
    dibujar: (d, ctx) => checklist(itemsDe(d, ctx).filter((it) => it.x_bloque === bloque), d, opts),
    validar: (d, ctx) => validarChecklist(itemsDe(d, ctx).filter((it) => it.x_bloque === bloque), d, opts)
  }));
}

export function pasoTomaConocimiento(textoAyuda) {
  return {
    titulo: "Toma de conocimiento",
    dibujar: (d) => [
      campoTexto(d, "tc_nombre", "Nombre de quien toma conocimiento", { requerido: true }),
      campoFirma(d, "tc_firma", "Firma «tomé conocimiento»", { requerido: true }),
      campoArea(d, "tc_obs", "Observaciones (opcional)", { filas: 2 }),
      aviso(textoAyuda, "info")],
    validar: (d) => (!d.tc_nombre?.trim() ? "Falta el nombre." : !d.tc_firma ? "Falta la firma." : null)
  };
}

export function valoresInspeccion(d, auto, items, { formulario, ambito, tipo, lugar }) {
  const { lineas, desvios, cantNo } = armarLineasYDesvios(items, d, { origen: formulario, ambito, fechaControl: auto.fecha_hora_control });
  return {
    x_formulario: formulario, x_ambito: ambito, x_tipo_programa: tipo, x_estado: "realizada",
    x_lugar: lugar || false, x_modalidad: "presencial", x_inspector_id: d.inspector_id,
    x_tc_nombre: d.tc_nombre, x_tc_firma: d.tc_firma, x_tc_observaciones: d.tc_obs || false,
    x_validacion_estado: "pendiente", x_origen: "formulario", x_cant_no: cantNo,
    x_linea_ids: lineas, x_desvio_ids: desvios
  };
}

export { resumenChecklist, h, textoInspector };
