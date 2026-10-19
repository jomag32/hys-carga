// HYS-F01 · Ficha de Riesgos de Obra → x_hys_ficha (diseño §2.5 y Anexo B).
// La carga la Gerencia de HyS dentro de las 48 h hábiles de creada la OT.
// Clase de riesgo, frecuencia, modalidad y hitos críticos los calcula Odoo (§3.1): acá no se eligen.

import { h, nombreM2o } from "../componentes/util.js";
import { campoTexto, campoArea, campoOpciones, campoCasillas, campoFirma, aviso } from "../componentes/campos.js";
import { selectorObra } from "../componentes/selector-obra.js";
import { camposControl } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";

const fichaDe = (d, ctx) => ctx.fichas.find((f) => f.x_ot_id?.[0] === d.obra?.id);
// Obra de la sesión (la elegida al ingresar). «Planta» no es una OT: ahí se sigue pidiendo la obra.
const obraSesion = (ctx) => (ctx.sesion?.obra && ctx.sesion.obra.id !== "planta" ? ctx.sesion.obra : null);
// El paso «Obra» se saltea si la obra ya viene de la sesión, salvo que se toque «Cambiar» o que esa OT
// ya tenga Ficha (ahí se muestra el selector con el aviso y no deja seguir).
const pasoObraVisible = (d, ctx) => !d.obra || !!d.cambiar_obra || !!fichaDe(d, ctx);
const PREDIOS = [["terreno_cliente", "Terreno del cliente"], ["planta_terceros", "Planta de terceros"], ["via_publica", "Vía pública"]];

export default {
  codigo: "F01",
  titulo: "Ficha de Riesgos de Obra",
  async preparar(ctx) {
    [ctx.riesgos, ctx.fichas] = await Promise.all([
      leerRegistros("x_hys_riesgo", [["x_active", "=", true]], ["x_codigo", "x_name", "x_gravedad"]),
      leerRegistros("x_hys_ficha", [], ["x_name", "x_ot_id", "x_estado"])]);
  },
  inicial: (ctx) => ({ riesgo_ids: [], aprobar: "borrador", ...(obraSesion(ctx) ? { obra: obraSesion(ctx) } : {}) }),
  // Borrador viejo sin obra: se completa con la de la sesión.
  retomar: (d, ctx) => { if (!d.obra && obraSesion(ctx)) d.obra = obraSesion(ctx); },
  // Encabezado compacto «Obra: X · Cambiar» cuando el paso «Obra» está salteado.
  cabecera: (d, ctx) => (pasoObraVisible(d, ctx) ? null : h("div", { class: "aviso info cabecera-obra", id: "cabecera-obra" },
    h("span", {}, "Obra: ", h("b", {}, d.obra.name)), " · ",
    h("button", { type: "button", class: "btn chico", id: "btn-cambiar-obra", onclick: () => { d.cambiar_obra = true; ctx.irA(0); } }, "Cambiar"))),
  pasos: [
    {
      titulo: "Obra",
      visible: pasoObraVisible,
      dibujar: (d, ctx) => [selectorObra(d, "obra", { alCambiar: () => { d.cambiar_obra = true; ctx.refrescar(); } }),
        fichaDe(d, ctx) ? aviso(`Esta OT ya tiene Ficha (${fichaDe(d, ctx).x_name}). Una sola Ficha por OT: los cambios se hacen en Odoo.`, "alerta")
          : aviso("Cliente y Director de Obra vienen solos desde la OT.", "info")],
      validar: (d, ctx) => (!d.obra ? "Elegí la obra." : fichaDe(d, ctx) ? "Esta OT ya tiene Ficha de Riesgos." : null)
    },
    {
      titulo: "Lugar",
      dibujar: (d) => [
        campoTexto(d, "distancia_km", "Distancia a Posadas (km)", { tipo: "number", min: 0, requerido: true, ayuda: "Más de 50 km: alterna inspección presencial y remota." }),
        campoOpciones(d, "tipo_predio", "Tipo de predio", PREDIOS, { requerido: true }),
        aviso("La ubicación (GPS) se toma sola al abrir el formulario.", "info")],
      validar: (d) => (d.distancia_km === "" || d.distancia_km == null ? "Cargá la distancia." : !d.tipo_predio ? "Elegí el tipo de predio." : null)
    },
    {
      titulo: "Riesgos aplicables",
      dibujar: (d, ctx) => [
        campoCasillas(d, "riesgo_ids", "Marcá los riesgos de esta obra", ctx.riesgos.map((r) => [r.id, r.x_name, r.x_gravedad === "critico" ? "· Crítico" : "· Medio"]), { requerido: true }),
        aviso("La clase de riesgo (A/B/C) la calcula Odoo con estos riesgos y los hitos del Gantt.", "info")],
      validar: (d) => (!d.riesgo_ids.length ? "Marcá al menos un riesgo." : null)
    },
    {
      titulo: "Controles y documentación",
      dibujar: (d) => [
        campoArea(d, "epp", "EPP y controles específicos"),
        campoArea(d, "doc_cliente", "Documentación que exige el cliente")]
    },
    {
      titulo: "Centro de salud",
      dibujar: (d) => campoArea(d, "centro_salud", "Centro de salud más cercano y teléfonos", { requerido: true }),
      validar: (d) => (!d.centro_salud?.trim() ? "El centro de salud es obligatorio." : null)
    },
    {
      titulo: "Aprobación",
      dibujar: (d) => [
        campoOpciones(d, "aprobar", "Estado de la Ficha", [["borrador", "Guardar como borrador"], ["aprobada", "Aprobar (Gerencia de HyS)"]], { columnas: 2 }),
        campoFirma(d, "firma", "Firma de aprobación", { ayuda: "Obligatoria solo para aprobar." })],
      validar: (d) => (d.aprobar === "aprobada" && !d.firma ? "Para aprobar hace falta la firma." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Obra", d.obra?.name],
    ["Cliente", nombreM2o(d.obra?.partner_id)],
    ["Distancia", `${d.distancia_km} km`],
    ["Predio", PREDIOS.find(([v]) => v === d.tipo_predio)?.[1]],
    ["Riesgos", ctx.riesgos.filter((r) => d.riesgo_ids.includes(r.id)).map((r) => r.x_name).join(", ")],
    ["Centro de salud", d.centro_salud],
    ["Estado", d.aprobar === "aprobada" ? "Aprobada (con firma)" : "Borrador"]
  ],
  armar: (d, auto) => ({
    operacion: "crear",
    modelo: "x_hys_ficha",
    valores: {
      x_ot_id: d.obra.id,
      x_director_obra_id: d.obra.user_id?.[0] || false,
      x_activa: true,
      x_estado: d.aprobar,
      x_fecha_aprobacion: d.aprobar === "aprobada" ? auto.fecha_hora_control : false,
      x_firma: d.aprobar === "aprobada" ? d.firma : false,
      x_distancia_km: Number(d.distancia_km),
      x_tipo_predio: d.tipo_predio,
      x_riesgo_ids: [[6, 0, d.riesgo_ids]],
      x_epp_controles: d.epp || false,
      x_doc_cliente: d.doc_cliente || false,
      x_centro_salud: d.centro_salud,
      ...camposControl(auto)
    }
  })
};
