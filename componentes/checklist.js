// Checklist Sí / No / N/A compartido por F02, F03, F04 y F08.
// Regla del diseño: cada «No» pide gravedad + foto obligatoria y genera un desvío (§2.9, §2.10).
// En F03 además pide el sector; en F08 el N/A exige justificación y los controles ★ son críticos.
// El desvío se arma acá (x_desvio_ids); vencimiento y responsable los calcula Odoo (§3.3).

import { h } from "./util.js";
import { campoOpciones, campoFoto, campoArea, campoSelect, aviso } from "./campos.js";

export const GRAVEDADES = [
  ["critico", "Crítico · 24 h", { clase: "rojo" }],
  ["mayor", "Mayor · 5 días hábiles", { clase: "naranja" }],
  ["menor", "Menor · 15 días", { clase: "amarillo" }]
];
export const ACCION_INMEDIATA = { critico: "Se detiene la tarea", mayor: "Se corrige o se restringe", menor: "Se registra y se programa" };

export const SECTORES_FABRICA = [
  ["corte_laser", "Corte Láser"], ["corte_plegado", "Corte y Plegado"], ["conformado", "Conformado"],
  ["estructura_soldadura", "Estructura y Soldadura"], ["carpinteria", "Carpintería Metálica"],
  ["pintura", "Pintura"], ["aluminio", "Aluminio"], ["recepcion_deposito", "Recepción y Depósito"]
];

/** Dibuja los ítems. d.respuestas[item.id] = {respuesta, criticidad, foto, comentario, sector, justificacion_na} */
export function checklist(items, d, { conSector = false, naJustificado = false } = {}) {
  d.respuestas = d.respuestas || {};
  return h("div", { class: "checklist" }, items.map((it) => {
    const r = (d.respuestas[it.id] = d.respuestas[it.id] || {});
    const detalle = h("div", { class: "detalle-no" });
    const pintarDetalle = () => {
      if (r.respuesta === "no") {
        detalle.replaceChildren(...[
          aviso(it.x_critico ? "Control crítico en «No»: detener, corregir y verificar antes de seguir." : "Se genera un desvío con esta foto.", it.x_critico ? "error" : "alerta"),
          conSector && campoSelect(r, "sector", "Sector", SECTORES_FABRICA, { requerido: true }),
          campoOpciones(r, "criticidad", "Gravedad", GRAVEDADES, { requerido: true }),
          campoFoto(r, "foto", "Foto del problema", { requerido: true }),
          campoArea(r, "comentario", "Comentario (opcional)", { filas: 2 })].filter(Boolean));
      } else if (r.respuesta === "na" && naJustificado) {
        detalle.replaceChildren(campoArea(r, "justificacion_na", "¿Por qué no aplica?", { requerido: true, filas: 2 }));
      } else detalle.replaceChildren();
    };
    pintarDetalle();
    return h("div", { class: `item ${it.x_critico ? "critico" : ""}` },
      h("p", { class: "item-texto" }, it.x_critico ? "★ " : "", it.x_name),
      campoOpciones(r, "respuesta", null, [["si", "Sí", { clase: "verde" }], ["no", "No", { clase: "rojo" }], ["na", "N/A"]],
        { columnas: 3, alCambiar: pintarDetalle }),
      detalle);
  }));
}

/** Devuelve el primer error o null. */
export function validarChecklist(items, d, { conSector = false, naJustificado = false } = {}) {
  for (const it of items) {
    const r = d.respuestas?.[it.id] || {};
    const corto = it.x_name.length > 50 ? it.x_name.slice(0, 50) + "…" : it.x_name;
    if (!r.respuesta) return `Falta responder: «${corto}»`;
    if (r.respuesta === "no") {
      if (conSector && !r.sector) return `Elegí el sector en «${corto}»`;
      if (!r.criticidad) return `Elegí la gravedad en «${corto}»`;
      if (!r.foto) return `La foto es obligatoria en «${corto}» (sin foto no se crea el desvío)`;
    }
    if (r.respuesta === "na" && naJustificado && !r.justificacion_na?.trim()) return `Justificá el N/A en «${corto}»`;
  }
  return null;
}

/**
 * Arma las líneas (one2many) y los desvíos de cada «No», con comandos [0, 0, vals] de Odoo.
 * tipo: "inspeccion" (x_hys_inspeccion_linea) o "ats" (x_hys_ats_linea).
 */
export function armarLineasYDesvios(items, d, { tipo = "inspeccion", origen, ambito, otId, fechaControl }) {
  const lineas = [], desvios = [];
  for (const it of items) {
    const r = d.respuestas[it.id];
    const base = { x_item_id: it.id, x_name: it.x_name, x_secuencia: it.x_secuencia, x_respuesta: r.respuesta };
    if (tipo === "inspeccion") Object.assign(base, { x_bloque: it.x_bloque, x_comentario: r.comentario || false });
    else Object.assign(base, { x_critico: !!it.x_critico, x_justificacion_na: r.justificacion_na || false });
    if (r.respuesta === "no") {
      Object.assign(base, { x_criticidad: r.criticidad, x_foto: r.foto });
      if (r.sector) base.x_sector = r.sector;
      desvios.push([0, 0, {
        x_origen_formulario: origen, x_ambito: ambito, x_ot_id: otId || false, x_sector: r.sector || false,
        x_descripcion: it.x_name, x_criticidad: r.criticidad, x_accion_inmediata: ACCION_INMEDIATA[r.criticidad],
        x_foto_deteccion: r.foto, x_fecha_deteccion: fechaControl
      }]);
    }
    lineas.push([0, 0, base]);
  }
  return { lineas, desvios, cantNo: desvios.length };
}

/** Resumen corto para la pantalla de revisión. */
export function resumenChecklist(items, d) {
  const c = { si: 0, no: 0, na: 0 };
  items.forEach((it) => { const v = d.respuestas?.[it.id]?.respuesta; if (v) c[v]++; });
  return `${c.si} Sí · ${c.no} No · ${c.na} N/A${c.no ? ` → ${c.no} desvío${c.no > 1 ? "s" : ""}` : ""}`;
}
