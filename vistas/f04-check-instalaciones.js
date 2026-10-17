// HYS-F04 · Check mensual de instalaciones → x_hys_inspeccion (check_mensual).
// Diseño §5.5 F04 y Anexo B: Lugar Fábrica (10 ítems, F04_FAB) u Oficina (8 ítems, F04_OFI).
// «No» → gravedad + foto. Firma el responsable del lugar; valida Dirección de Fábrica o el COO.

import { campoOpciones } from "../componentes/campos.js";
import { pasoInspector, pasosPorBloque, pasoTomaConocimiento, valoresInspeccion, leerItems, leerInspectores, bloquesDe, resumenChecklist } from "./_inspeccion-planta.js";
import { camposControl } from "../componentes/campos-auto.js";

const itemsDe = (d, ctx) => (d.lugar === "oficina" ? ctx.oficina : d.lugar === "fabrica" ? ctx.fabrica : []);

export default {
  codigo: "F04",
  titulo: "Check mensual de instalaciones",
  async preparar(ctx) {
    [ctx.fabrica, ctx.oficina, ctx.inspectores] = await Promise.all([leerItems("F04_FAB"), leerItems("F04_OFI"), leerInspectores()]);
  },
  inicial: () => ({ respuestas: {} }),
  pasos: (ctx) => [
    {
      titulo: "Lugar",
      dibujar: (d) => campoOpciones(d, "lugar", "¿Dónde se hace el check?", [["fabrica", "Fábrica"], ["oficina", "Oficina"]],
        { columnas: 2, requerido: true, alCambiar: () => { d.respuestas = {}; } }),
      validar: (d) => (!d.lugar ? "Elegí el lugar." : null)
    },
    pasoInspector(),
    ...pasosPorBloque(bloquesDe([...ctx.fabrica, ...ctx.oficina]), itemsDe),
    pasoTomaConocimiento("Firma el responsable del lugar. Valida en Odoo dentro de 24 h: Dirección de Fábrica (Fábrica) o el COO (Oficina).")
  ],
  resumen: (d, ctx) => [
    ["Lugar", d.lugar === "oficina" ? "Oficina" : "Fábrica"],
    ["Inspector", ctx.inspectores.find((e) => e.id === d.inspector_id)?.name],
    ["Ítems", resumenChecklist(itemsDe(d, ctx), d)],
    ["Tomó conocimiento", d.tc_nombre]],
  armar: (d, auto, ctx) => ({
    operacion: "crear",
    modelo: "x_hys_inspeccion",
    valores: { ...valoresInspeccion(d, auto, itemsDe(d, ctx), { formulario: "F04", ambito: d.lugar, tipo: "check_mensual", lugar: d.lugar }), ...camposControl(auto) }
  })
};
