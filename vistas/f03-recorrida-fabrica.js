// HYS-F03 · Recorrida semanal de Fábrica → x_hys_inspeccion (ámbito fábrica, recorrida_semanal).
// Diseño §5.5 F03 y Anexo B: 18 ítems en 6 bloques; cada «No» pide sector + gravedad + foto.
// Toma de conocimiento: Jefe de Producción Ejemplo. Valida Dirección de Fábrica en Odoo dentro de 24 h.

import { pasoInspector, pasosPorBloque, pasoTomaConocimiento, valoresInspeccion, leerItems, leerInspectores, bloquesDe, resumenChecklist } from "./_inspeccion-planta.js";
import { camposControl } from "../componentes/campos-auto.js";

const OPC = { conSector: true };

export default {
  codigo: "F03",
  titulo: "Recorrida semanal de Fábrica",
  async preparar(ctx) {
    [ctx.items, ctx.inspectores] = await Promise.all([leerItems("F03"), leerInspectores()]);
  },
  inicial: () => ({ respuestas: {}, tc_nombre: "Jefe de Producción Ejemplo" }),
  pasos: (ctx) => [
    pasoInspector(),
    ...pasosPorBloque(bloquesDe(ctx.items), (d, c) => c.items, OPC),
    pasoTomaConocimiento("Toma conocimiento el Jefe de Producción. La Dirección de Fábrica valida en Odoo dentro de 24 h.")
  ],
  resumen: (d, ctx) => [
    ["Lugar", "Fábrica"],
    ["Inspector", ctx.inspectores.find((e) => e.id === d.inspector_id)?.name],
    ["Ítems", resumenChecklist(ctx.items, d)],
    ["Tomó conocimiento", d.tc_nombre]],
  armar: (d, auto, ctx) => ({
    operacion: "crear",
    modelo: "x_hys_inspeccion",
    valores: { ...valoresInspeccion(d, auto, ctx.items, { formulario: "F03", ambito: "fabrica", tipo: "recorrida_semanal", lugar: "fabrica" }), ...camposControl(auto) }
  })
};
