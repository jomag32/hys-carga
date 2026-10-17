// HYS-F08 · ATS de turno sectorial → x_hys_ats (+ x_linea_ids, x_tarea_ids, x_desvio_ids).
// Diseño §2.13, §3.8, §5.5 F08 y Anexo B. Piloto en Depósito Central y Logística y Mantenimiento.
// 10 controles previos (★ = crítico). N/A con justificación. «No» → gravedad + foto → desvío.
// Crítico en «No» ⇒ el resultado no puede ser «Autorizado».

import { h } from "../componentes/util.js";
import { campoOpciones, campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { selectorTurno } from "../componentes/selector-turno.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { camposControl, hoyIso } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";

const SECTORES = {
  deposito: { nombre: "Depósito Central", plantilla: "F08_DEP", codigo: "ATS-DEP-001", encargado: 17, autoriza: 18 },
  logistica: { nombre: "Logística y Mantenimiento", plantilla: "F08_LOG", codigo: "ATS-LOG-MANT-001", encargado: null, autoriza: 19 }
};
const DETENCION = "No iniciar o suspender ante fugas, cargas inestables, equipos dañados, resguardos ausentes, falta de aislamiento de energía, tránsito sin control, derrames no controlados, incompatibilidades de almacenamiento o falta de controles críticos. Aislar, corregir y verificar antes de autorizar.";
const RESULTADOS = [["autorizado", "Autorizado", { clase: "verde" }], ["autorizado_correccion", "Autorizado tras corrección", { clase: "naranja" }], ["no_autorizado", "No autorizado", { clase: "rojo" }]];
const OPC = { naJustificado: true };

const items = (d, ctx) => (d.sector ? ctx.items[SECTORES[d.sector].plantilla] : []);
const mitad = (d, ctx, n) => { const it = items(d, ctx); const m = Math.ceil(it.length / 2); return n === 1 ? it.slice(0, m) : it.slice(m); };
const criticoEnNo = (d, ctx) => items(d, ctx).some((it) => it.x_critico && d.respuestas?.[it.id]?.respuesta === "no");

export default {
  codigo: "F08",
  titulo: "ATS de turno sectorial",
  async preparar(ctx) {
    const [dep, log, emp] = await Promise.all([
      leerRegistros("x_hys_item_plantilla", [["x_formulario", "=", "F08_DEP"]]),
      leerRegistros("x_hys_item_plantilla", [["x_formulario", "=", "F08_LOG"]]),
      leerRegistros("hr.employee", [], ["name", "job_title"])]);
    ctx.items = { F08_DEP: dep, F08_LOG: log };
    ctx.empleados = emp;
  },
  inicial: () => ({ fecha: hoyIso(), respuestas: {}, tareas: [], fuera_rutina: "no" }),
  pasos: [
    {
      titulo: "Sector y turno",
      dibujar: (d, ctx) => [
        campoOpciones(d, "sector", "Sector", Object.entries(SECTORES).map(([k, s]) => [k, s.nombre]), {
          columnas: 2, requerido: true,
          alCambiar: (v) => { d.respuestas = {}; d.encargado_id = SECTORES[v].encargado; d.autoriza_id = SECTORES[v].autoriza; }
        }),
        campoTexto(d, "fecha", "Fecha del turno", { tipo: "date", requerido: true, alCambiar: () => ctx.refrescar() }),
        selectorTurno(d, "turno")],
      validar: (d) => (!d.sector ? "Elegí el sector." : !d.fecha ? "Cargá la fecha." : !d.turno ? "Elegí el turno." : null)
    },
    {
      titulo: "Actividades y responsables",
      dibujar: (d, ctx) => {
        const ops = ctx.empleados.map((e) => [e.id, `${e.name} · ${e.job_title}`]);
        return [campoArea(d, "actividades", "Turno y actividades", { requerido: true, filas: 3 }),
          campoSelect(d, "encargado_id", "Encargado", ops, { requerido: true, ayuda: d.sector === "logistica" ? "Encargado de Logística: a designar." : null }),
          campoSelect(d, "autoriza_id", "Autoriza", ops, { requerido: true })];
      },
      validar: (d) => (!d.actividades?.trim() ? "Contá las actividades del turno." : !d.encargado_id ? "Elegí el encargado." : !d.autoriza_id ? "Elegí quién autoriza." : null)
    },
    {
      titulo: "Controles previos (1 de 2)",
      dibujar: (d, ctx) => [aviso(DETENCION, "alerta"), checklist(mitad(d, ctx, 1), d, OPC)],
      validar: (d, ctx) => validarChecklist(mitad(d, ctx, 1), d, OPC)
    },
    {
      titulo: "Controles previos (2 de 2)",
      dibujar: (d, ctx) => checklist(mitad(d, ctx, 2), d, OPC),
      validar: (d, ctx) => validarChecklist(mitad(d, ctx, 2), d, OPC)
    },
    {
      titulo: "Tareas fuera de rutina",
      dibujar: (d, ctx) => {
        const lista = d.fuera_rutina === "si" ? [
          ...d.tareas.map((t, i) => h("fieldset", { class: "tarea" }, h("legend", {}, `Tarea ${i + 1}`),
            campoTexto(t, "paso", "Tarea", { requerido: true }), campoTexto(t, "riesgo", "Qué puede salir mal"),
            campoTexto(t, "control", "Cómo lo evitamos"), campoTexto(t, "responsable", "Responsable"),
            h("button", { type: "button", class: "btn chico", onclick: () => { d.tareas.splice(i, 1); ctx.refrescar(); } }, "Quitar"))),
          h("button", { type: "button", class: "btn secundario", onclick: () => { d.tareas.push({}); ctx.refrescar(); } }, "+ Agregar tarea")] : [];
        return [campoOpciones(d, "fuera_rutina", "¿Hay tareas fuera de rutina?", [["no", "No"], ["si", "Sí"]], {
          columnas: 2, requerido: true, alCambiar: (v) => { if (v === "si" && !d.tareas.length) d.tareas.push({}); ctx.refrescar(); }
        }), ...lista];
      },
      validar: (d) => (d.fuera_rutina === "si" && !d.tareas.some((t) => t.paso?.trim()) ? "Cargá al menos una tarea." : null)
    },
    {
      titulo: "Dotación y resultado",
      dibujar: (d, ctx) => {
        const crit = criticoEnNo(d, ctx);
        if (crit && d.resultado === "autorizado") d.resultado = null;
        return [campoTexto(d, "dotacion", "Dotación presente", { tipo: "number", min: 1, requerido: true, ayuda: "Toma de conocimiento grupal." }),
          crit && aviso("Hay un control crítico en «No»: no se puede «Autorizado».", "error"),
          campoOpciones(d, "resultado", "Resultado", RESULTADOS.map(([v, t, o]) => [v, t, { ...o, deshabilitado: crit && v === "autorizado" }]), { requerido: true })];
      },
      validar: (d, ctx) => !(d.dotacion >= 1) ? "La dotación tiene que ser 1 o más." : !d.resultado ? "Elegí el resultado." :
        criticoEnNo(d, ctx) && d.resultado === "autorizado" ? "Con un crítico en «No» no puede ser «Autorizado»." : null
    },
    {
      titulo: "Firmas",
      dibujar: (d) => [campoFirma(d, "firma_encargado", "Firma del encargado", { requerido: true }), campoFirma(d, "firma_autoriza", "Firma de quien autoriza", { requerido: true })],
      validar: (d) => (!d.firma_encargado ? "Falta la firma del encargado." : !d.firma_autoriza ? "Falta la firma de quien autoriza." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Sector", SECTORES[d.sector]?.nombre], ["Fecha", d.fecha], ["Turno", d.turno ? `${d.turno.nombre} · ${d.turno.inicio}` : ""],
    ["Actividades", d.actividades],
    ["Controles", resumenChecklist(items(d, ctx), d)],
    ["Fuera de rutina", d.fuera_rutina === "si" ? `Sí · ${d.tareas.filter((t) => t.paso).length} tarea(s)` : "No"],
    ["Dotación", d.dotacion], ["Resultado", RESULTADOS.find(([v]) => v === d.resultado)?.[1]]],
  armar: (d, auto, ctx) => {
    const ambito = d.sector; // en x_hys_desvio: "deposito" | "logistica"
    const { lineas, desvios } = armarLineasYDesvios(items(d, ctx), d, { tipo: "ats", origen: "F08", ambito, fechaControl: auto.fecha_hora_control });
    return {
      operacion: "crear",
      modelo: "x_hys_ats",
      valores: {
        x_sector: d.sector, x_codigo_ats: SECTORES[d.sector].codigo, x_fecha: d.fecha,
        x_turno: d.turno.codigo, x_inicio_turno: d.inicio_turno,
        x_actividades: d.actividades, x_encargado_id: d.encargado_id, x_autoriza_id: d.autoriza_id,
        x_linea_ids: lineas, x_desvio_ids: desvios,
        x_fuera_rutina: d.fuera_rutina,
        x_tarea_ids: d.fuera_rutina === "si" ? d.tareas.filter((t) => t.paso?.trim()).map((t) => [0, 0, {
          x_paso: t.paso, x_riesgo: t.riesgo || false, x_control: t.control || false, x_responsable: t.responsable || false }]) : [],
        x_dotacion: Number(d.dotacion), x_resultado: d.resultado,
        x_firma_encargado: d.firma_encargado, x_firma_autoriza: d.firma_autoriza,
        ...camposControl(auto)
      }
    };
  }
};
