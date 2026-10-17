// HYS-F02 · Inspección de obra → x_hys_inspeccion (+ x_linea_ids y x_desvio_ids anidados).
// Diseño §2.8, §2.9, §5.5 F02 y Anexo B. Ítems: 6 generales siempre + bloques de los riesgos de
// la Ficha de la OT (si la OT no tiene Ficha, solo los generales). Cada «No» → gravedad + foto → desvío.
// Esqueleto: se crea como inspección "fuera_programa"; enlazar con la programada lo resuelve el
// backend (§5.5: inspeccion_programada_id, decisión pendiente).

import { h, nombreM2o } from "../componentes/util.js";
import { campoOpciones, campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { selectorObra } from "../componentes/selector-obra.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { camposControl } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";

const KM_REMOTA = 50; // x_hys_config.x_distancia_remota_km
const CLASES = { A: "Clase A · Alto riesgo", B: "Clase B · Riesgo medio", C: "Clase C · Bajo riesgo" };

const generales = (ctx) => ctx.items.filter((it) => !it.x_riesgo_id);
const deRiesgo = (ctx, rid) => ctx.items.filter((it) => it.x_riesgo_id && it.x_riesgo_id[0] === rid);
const ficha = (d, ctx) => ctx.fichas.find((f) => f.x_ot_id[0] === d.obra?.id && f.x_estado === "aprobada");
const riesgosObra = (d, ctx) => ficha(d, ctx)?.x_riesgo_ids || [];
const itemsDeLaObra = (d, ctx) => [...generales(ctx), ...ctx.riesgos.filter((r) => riesgosObra(d, ctx).includes(r.id)).flatMap((r) => deRiesgo(ctx, r.id))];

export default {
  codigo: "F02",
  titulo: "Inspección de obra",
  async preparar(ctx) {
    [ctx.items, ctx.riesgos, ctx.fichas, ctx.inspectores] = await Promise.all([
      leerRegistros("x_hys_item_plantilla", [["x_formulario", "=", "F02"], ["x_active", "=", true]]),
      leerRegistros("x_hys_riesgo", [], ["x_codigo", "x_name"]),
      leerRegistros("x_hys_ficha", [], ["x_ot_id", "x_estado", "x_riesgo_ids", "x_clase_riesgo", "x_clase_motivo", "x_distancia_km"]),
      leerRegistros("hr.employee", [["x_mock_roles", "in", ["inspector"]]], ["name", "job_title"])
    ]);
  },
  inicial: () => ({ modalidad: "presencial", respuestas: {} }),
  get pasos() {
    return [
      {
        titulo: "Obra",
        dibujar: (d, ctx) => {
          const info = h("div");
          const pintar = () => {
            const f = ficha(d, ctx);
            info.replaceChildren(!d.obra ? "" : f
              ? aviso(`${CLASES[f.x_clase_riesgo] || "Sin clase"} — ${f.x_clase_motivo || ""}`, f.x_clase_riesgo === "A" ? "alerta" : "info")
              : aviso("Esta obra no tiene Ficha de Riesgos aprobada: es Clase A y solo se cargan los 6 ítems generales. Queda pendiente la Ficha.", "alerta"));
          };
          pintar();
          return [selectorObra(d, "obra", { alCambiar: () => { d.respuestas = {}; pintar(); } }), info];
        },
        validar: (d) => (!d.obra ? "Elegí la obra." : null)
      },
      {
        titulo: "Modalidad e inspector",
        dibujar: (d, ctx) => {
          const km = ficha(d, ctx)?.x_distancia_km ?? d.obra?.x_mock_km ?? 0;
          if (km <= KM_REMOTA) d.modalidad = "presencial";
          return [
            campoOpciones(d, "modalidad", "Modalidad", [["presencial", "Presencial"], ["remota", "Remota", { deshabilitado: km <= KM_REMOTA }]],
              { columnas: 2, requerido: true, ayuda: km <= KM_REMOTA ? `Obra a ${km} km: solo presencial.` : `Obra a ${km} km: puede alternar con remota (no en apertura ni inicio de hito crítico).` }),
            campoSelect(d, "inspector_id", "Inspector", ctx.inspectores.map((e) => [e.id, `${e.name} · ${e.job_title}`]), { requerido: true })];
        },
        validar: (d) => (!d.inspector_id ? "Elegí el inspector." : null)
      },
      {
        titulo: "Ítems generales",
        dibujar: (d, ctx) => checklist(generales(ctx), d),
        validar: (d, ctx) => validarChecklist(generales(ctx), d)
      },
      // Un paso por cada bloque de riesgo; solo aparecen los que marca la Ficha de la OT.
      ...RIESGOS_CODIGOS.map((cod) => ({
        titulo: `Riesgo: ${NOMBRES_RIESGO[cod]}`,
        visible: (d, ctx) => { const r = ctx.riesgos.find((x) => x.x_codigo === cod); return !!r && riesgosObra(d, ctx).includes(r.id); },
        dibujar: (d, ctx) => checklist(deRiesgo(ctx, ctx.riesgos.find((x) => x.x_codigo === cod).id), d),
        validar: (d, ctx) => validarChecklist(deRiesgo(ctx, ctx.riesgos.find((x) => x.x_codigo === cod).id), d)
      })),
      {
        titulo: "Toma de conocimiento",
        dibujar: (d) => [
          campoTexto(d, "tc_nombre", d.modalidad === "remota" ? "Director de Obra" : "Capataz", { requerido: true }),
          campoFirma(d, "tc_firma", "Firma «tomé conocimiento»", { requerido: true }),
          campoArea(d, "tc_obs", "Observaciones (opcional)", { filas: 2 }),
          aviso("La firma no es veto: la inspección cuenta igual. El Director de Obra valida en Odoo dentro de 24 h.", "info")],
        validar: (d) => (!d.tc_nombre?.trim() ? "Falta el nombre de quien toma conocimiento." : !d.tc_firma ? "Falta la firma." : null)
      }
    ];
  },
  resumen: (d, ctx) => {
    const f = ficha(d, ctx);
    return [
      ["Obra", d.obra?.name],
      ["Clase", f ? CLASES[f.x_clase_riesgo] : "Clase A (sin Ficha)"],
      ["Modalidad", d.modalidad === "remota" ? "Remota" : "Presencial"],
      ["Inspector", ctx.inspectores.find((e) => e.id === d.inspector_id)?.name],
      ["Ítems", resumenChecklist(itemsDeLaObra(d, ctx), d)],
      ["Tomó conocimiento", d.tc_nombre]];
  },
  armar: (d, auto, ctx) => {
    const f = ficha(d, ctx);
    const { lineas, desvios, cantNo } = armarLineasYDesvios(itemsDeLaObra(d, ctx), d,
      { origen: "F02", ambito: "obra", otId: d.obra.id, fechaControl: auto.fecha_hora_control });
    return {
      operacion: "crear",
      modelo: "x_hys_inspeccion",
      valores: {
        x_formulario: "F02", x_ambito: "obra", x_tipo_programa: "fuera_programa", x_estado: "realizada",
        x_ot_id: d.obra.id, x_modalidad: d.modalidad, x_inspector_id: d.inspector_id,
        x_clase_al_inspeccionar: f?.x_clase_riesgo || "A", x_clase_motivo: f?.x_clase_motivo || "Sin Ficha de Riesgos aprobada",
        x_tc_nombre: d.tc_nombre, x_tc_firma: d.tc_firma, x_tc_observaciones: d.tc_obs || false,
        x_validacion_estado: "pendiente", x_origen: "formulario", x_cant_no: cantNo,
        x_linea_ids: lineas, x_desvio_ids: desvios,
        ...camposControl(auto)
      }
    };
  }
};

// Orden de los bloques = orden del catálogo x_hys_riesgo (§2.4).
const NOMBRES_RIESGO = {
  altura: "Trabajo en altura", izaje: "Izaje de cargas / grúa", caliente: "Soldadura y corte (trabajo en caliente)",
  excavacion: "Excavación", confinados: "Espacios confinados", demolicion: "Demolición", hormigon: "Hormigón / bomba",
  andamios: "Andamios / escaleras", electrica: "Instalación eléctrica provisoria", viapublica: "Vía pública / terceros",
  sustancias: "Sustancias (pinturas, solventes, gases)"
};
const RIESGOS_CODIGOS = Object.keys(NOMBRES_RIESGO);
