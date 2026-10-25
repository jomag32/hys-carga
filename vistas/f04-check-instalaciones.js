// HYS-F04 · Check mensual de instalaciones → POST /api/v1/inspecciones (x_hys_inspeccion, check_mensual). Conectado 25/10/2026.
// Lugar Fábrica (F04_FAB, 10 ítems) u Oficina (F04_OFI, 8 ítems): los ítems salen del catálogo del backend
// (GET /api/v1/inspecciones/catalogo?formulario=F04&lugar=…). Cada «No» pide gravedad + foto (queda en la línea).
// Toma de conocimiento: el responsable del lugar (precargado si Odoo lo tiene, siempre editable).
// Valida en Odoo: Dirección de Fábrica (Fábrica) o el COO (Oficina). Vence el día 7 del mes; el 2.º del mes
// en el mismo lugar se registra como «fuera de programa»; si Odoo dejó el check «programado» del mes, se completa ese.

import { prepararPlanta, pasoInspectorHys, pasosPorBloque, pasoTomaConocimientoPrecargada, pasoFirmaInspector, armarEnvioPlanta,
  bloquesDe, resumenChecklist, textoInspector } from "./_inspeccion-planta.js";
import { campoOpciones } from "../componentes/campos.js";

const LUGARES = [["fabrica", "Fábrica"], ["oficina", "Oficina"]];
const etiqueta = (l) => (l === "oficina" ? "Oficina" : "Fábrica");

/** Deja en ctx el catálogo y los ítems del lugar elegido (los dos se leen al abrir). */
function usarLugar(d, ctx) {
  const c = ctx.porLugar?.[d.lugar];
  ctx.catalogo = c?.catalogo || null;
  ctx.items = c?.items || [];
}
const conLugar = (paso) => ({
  ...paso,
  visible: (d, ctx) => { usarLugar(d, ctx); return paso.visible ? paso.visible(d, ctx) : true; },
  dibujar: (d, ctx) => { usarLugar(d, ctx); return paso.dibujar(d, ctx); },
  validar: paso.validar && ((d, ctx) => { usarLugar(d, ctx); return paso.validar(d, ctx); })
});

export default {
  codigo: "F04",
  titulo: "Check mensual de instalaciones",
  async preparar(ctx) {
    const fab = {}, ofi = {};
    await Promise.all([prepararPlanta(fab, "F04", "fabrica"), prepararPlanta(ofi, "F04", "oficina")]);
    ctx.porLugar = { fabrica: fab, oficina: ofi };
    ctx.inspectores = fab.inspectores;
    ctx.catalogo = null; ctx.items = [];
  },
  inicial: () => ({ respuestas: {} }),
  pasos: (ctx) => [
    {
      titulo: "Lugar",
      dibujar: (d) => campoOpciones(d, "lugar", "¿Dónde se hace el check?", LUGARES, {
        columnas: 2, requerido: true,
        // Cambiar de lugar cambia los ítems y quién toma conocimiento: se empieza de nuevo.
        alCambiar: () => { d.respuestas = {}; d.tc_nombre = undefined; d.tipo_programa = undefined; }
      }),
      validar: (d) => (!d.lugar ? "Elegí el lugar." : null)
    },
    conLugar({
      ...pasoInspectorHys(),
      dibujar: (d, c) => {
        if (!d.tipo_programa) d.tipo_programa = c.catalogo?.periodo?.realizada ? "fuera_programa" : "check_mensual";
        return [...pasoInspectorHys().dibujar(d, c),
          campoOpciones(d, "tipo_programa", "Tipo", [["check_mensual", "Check mensual"], ["fuera_programa", "Fuera de programa"]],
            { columnas: 2, requerido: true, ayuda: `Si ya hay un check este mes en ${etiqueta(d.lugar)}, igual se registra como «fuera de programa».` })];
      }
    }),
    ...pasosPorBloque(bloquesDe([...ctx.porLugar.fabrica.items, ...ctx.porLugar.oficina.items]),
      (d, c) => (c.porLugar[d.lugar]?.items || [])).map(conLugar),
    conLugar(pasoTomaConocimientoPrecargada("Responsable del lugar (o reemplazo) · nombre",
      "La firma no es veto: el check cuenta igual. Valida en Odoo dentro de 24 h: Dirección de Fábrica (Fábrica) o el COO (Oficina).")),
    conLugar(pasoFirmaInspector())
  ],
  resumen: (d, ctx) => {
    usarLugar(d, ctx);
    return [
      ["Lugar", etiqueta(d.lugar)],
      ["Tipo", d.tipo_programa === "fuera_programa" ? "Fuera de programa" : "Check mensual"],
      ["Inspector", textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id))],
      ["Ítems", resumenChecklist(ctx.items, d)],
      ["Tomó conocimiento", d.tc_nombre],
      ["Firma del inspector", d.firma_inspector ? "Firmada" : "—"]];
  },
  armar: (d, auto, ctx) => {
    usarLugar(d, ctx);
    return armarEnvioPlanta(d, auto, ctx, { formulario: "F04", tipo: d.tipo_programa || "check_mensual", lugar: d.lugar, etiquetaLugar: etiqueta(d.lugar) });
  }
};
