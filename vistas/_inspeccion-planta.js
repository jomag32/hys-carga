// Base común de F03 (Recorrida semanal de Fábrica) y F04 (Check mensual de instalaciones).
// Ambos crean x_hys_inspeccion sin OT, con ítems por bloque y toma de conocimiento.

import { h } from "../componentes/util.js";
import { campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { leerRegistros } from "../api/odoo.js";

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

export { resumenChecklist, h };
