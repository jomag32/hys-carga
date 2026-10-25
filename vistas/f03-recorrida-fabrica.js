// HYS-F03 · Recorrida semanal de Fábrica → POST /api/v1/inspecciones (x_hys_inspeccion, ámbito fábrica).
// Diseño §5.5 F03 y Anexo B; fase 1 (25/10/2026). 18 ítems en 6 bloques (catálogo del backend, x_hys_item_plantilla).
// Cada «No» pide sector + gravedad + foto y queda en la línea (x_hys_desvio llega con F07).
// Toma de conocimiento: el Jefe de Producción (nombre precargado desde Odoo, editable). Valida la Dirección
// de Fábrica en Odoo dentro de 24 h. La 2.ª recorrida de la semana se registra como «fuera de programa».

import { prepararPlanta, pasoInspectorHys, pasosPorBloque, pasoTomaConocimientoPrecargada, pasoFirmaInspector, armarEnvioPlanta,
  bloquesDe, resumenChecklist, textoInspector } from "./_inspeccion-planta.js";
import { campoOpciones } from "../componentes/campos.js";

const OPC = { conSector: true };

export default {
  codigo: "F03",
  titulo: "Recorrida semanal de Fábrica",
  async preparar(ctx) { await prepararPlanta(ctx, "F03", "fabrica"); },
  inicial: () => ({ respuestas: {} }),
  pasos: (ctx) => [
    {
      ...pasoInspectorHys(),
      dibujar: (d, c) => {
        if (!d.tipo_programa) d.tipo_programa = c.catalogo?.periodo?.realizada ? "fuera_programa" : "recorrida_semanal";
        return [...pasoInspectorHys().dibujar(d, c),
          campoOpciones(d, "tipo_programa", "Tipo", [["recorrida_semanal", "Recorrida semanal"], ["fuera_programa", "Fuera de programa"]],
            { columnas: 2, requerido: true, ayuda: "Si ya hay una recorrida esta semana, igual se registra como «fuera de programa»." })];
      }
    },
    ...pasosPorBloque(bloquesDe(ctx.items), (d, c) => c.items, OPC),
    pasoTomaConocimientoPrecargada("Jefe de Producción (o reemplazo) · nombre",
      "La firma no es veto: la recorrida cuenta igual. La Dirección de Fábrica valida en Odoo dentro de 24 h."),
    pasoFirmaInspector()
  ],
  resumen: (d, ctx) => [
    ["Lugar", "Fábrica"],
    ["Tipo", d.tipo_programa === "fuera_programa" ? "Fuera de programa" : "Recorrida semanal"],
    ["Inspector", textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id))],
    ["Ítems", resumenChecklist(ctx.items, d)],
    ["Tomó conocimiento", d.tc_nombre],
    ["Firma del inspector", d.firma_inspector ? "Firmada" : "—"]],
  armar: (d, auto, ctx) => armarEnvioPlanta(d, auto, ctx,
    { formulario: "F03", tipo: d.tipo_programa || "recorrida_semanal", lugar: "fabrica", etiquetaLugar: "Fábrica" })
};
