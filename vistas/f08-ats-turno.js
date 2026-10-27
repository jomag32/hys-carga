// HYS-F08 · ATS de turno sectorial → POST /api/v1/ats → x_hys_ats (+ x_linea_ids, x_tarea_ids).
// Plan de implementación F08 (20/10/2026, decisiones D-01..D-16 aceptadas). Piloto en Depósito Central
// y Logística y Mantenimiento. Turnos, controles y personas salen de GET /api/v1/ats/catalogo.
// 10 controles por sector (★ = crítico). N/A con justificación (los ★ marcados no lo admiten).
// «No» → gravedad + foto (+ medida correctiva). Crítico en «No» ⇒ el resultado no puede ser «Autorizado».
// Empresa (Coop. El Sol / Cormet): sale en el encabezado del PDF. Se recuerda la última elegida en el celular;
// si no hay, se propone la empresa del encargado (si el catálogo la trae).
// El desvío formal lo abre HyS desde Odoo (D-08): el formulario no crea x_hys_desvio.
// El ingreso elige sector/lugar ANTES de la OF (27/10/2026): si la sesión es Depósito/Logística se
// preselecciona ese sector. «Obra» en el ingreso NO es un x_sector de ATS (Odoo solo admite
// deposito|logistica); el ATS no guarda OF (no hay x_ot_id en x_hys_ats).

import { h } from "../componentes/util.js";
import { campoOpciones, campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { selectorTurno } from "../componentes/selector-turno.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { camposControl, hoyIso } from "../componentes/campos-auto.js";
import { leerCatalogoAts, leerAtsDelDia } from "../api/odoo.js";
import { leerSesion } from "../componentes/sesion.js";
import { sectorDeSesion, esObraReal } from "../componentes/lugares.js";

const PLANTILLA = { deposito: "F08_DEP", logistica: "F08_LOG" };
const DETENCION = "No iniciar o suspender ante fugas, cargas inestables, equipos dañados, resguardos ausentes, falta de aislamiento de energía, tránsito sin control, derrames no controlados, incompatibilidades de almacenamiento o falta de controles críticos. Aislar, corregir y verificar antes de autorizar.";
const RESULTADOS = [["autorizado", "Autorizado", { clase: "verde" }], ["autorizado_correccion", "Autorizado tras corrección", { clase: "naranja" }], ["no_autorizado", "No autorizado", { clase: "rojo" }]];
const RES_TXT = Object.fromEntries(RESULTADOS.map(([v, t]) => [v, t]));

// Ítems del catálogo con la forma que usa el checklist (id = código del control).
const items = (d, ctx) => (d.sector ? (ctx.cat.controles[PLANTILLA[d.sector]] || []).map((c) => ({
  id: c.codigo, x_codigo: c.codigo, x_name: c.nombre, x_bloque: c.bloque, x_critico: c.critico, admite_na: c.admite_na, x_secuencia: c.secuencia })) : []);
const mitad = (d, ctx, n) => { const it = items(d, ctx); const m = Math.ceil(it.length / 2); return n === 1 ? it.slice(0, m) : it.slice(m); };
const criticoEnNo = (d, ctx) => items(d, ctx).some((it) => it.x_critico && d.respuestas?.[it.id]?.respuesta === "no");
const opc = (ctx) => ({ naJustificado: true, medida: true, minJustif: ctx.cat.min_justificacion_na || 10 });
const nombreSector = (ctx, s) => ctx.cat.sectores.find(([k]) => k === s)?.[1] || s;
// ¿Ya hay un ATS válido para este turno? (uno «No autorizado» se puede rehacer: D-10)
const bloqueante = (d) => (d.previos || []).find((a) => a.turno_id === d.turno?.id && a.resultado !== "no_autorizado");

const CLAVE_EMPRESA = "hys_f08_empresa";
const empresas = (ctx) => ctx.cat.empresas || [];
const leerUltimaEmpresa = () => { try { return Number(localStorage.getItem(CLAVE_EMPRESA)) || null; } catch { return null; } };
const guardarEmpresa = (id) => { try { localStorage.setItem(CLAVE_EMPRESA, String(id)); } catch { /* sin almacenamiento */ } };
const empresaDe = (ctx, sector, idPersona) => (ctx.cat.personas[sector] || []).find((p) => p.id === Number(idPersona))?.empresa_id || null;
/** Propone empresa si no la eligió a mano: la del encargado, si es una de las opciones. */
function proponerEmpresa(d, ctx) {
  if (d._empresaManual || !empresas(ctx).length) return;
  const e = empresaDe(ctx, d.sector, d.encargado_id);
  if (e && empresas(ctx).some((x) => x.id === e)) d.empresa_id = e;
}
function selectorEmpresa(d, ctx) {
  if (!empresas(ctx).length) return null; // backend sin la opción: vale la empresa del encargado en Odoo
  if (!empresas(ctx).some((x) => x.id === d.empresa_id)) d.empresa_id = null;
  if (!d.empresa_id) { const u = leerUltimaEmpresa(); if (empresas(ctx).some((x) => x.id === u)) d.empresa_id = u; else proponerEmpresa(d, ctx); }
  return campoOpciones(d, "empresa_id", "Empresa", empresas(ctx).map((e) => [e.id, e.corto || e.nombre]), {
    columnas: 2, requerido: true, ayuda: "Sale con su logo en el encabezado del PDF.",
    alCambiar: (v) => { d._empresaManual = true; guardarEmpresa(v); }
  });
}

// Encargado de sector: solo su sector (el backend lo vuelve a controlar: 403).
const soloSector = () => { const u = leerSesion().usuario; return u?.rol_hys === "encargado" ? u.sector || "ninguno" : null; };

function buscarPrevios(d, ctx) {
  if (!d.sector || !d.fecha) return;
  const clave = `${d.sector}|${d.fecha}`;
  if (d._previosDe === clave) return;
  d._previosDe = clave; d.previos = [];
  leerAtsDelDia(d.sector, d.fecha).then((r) => { if (d._previosDe === clave) { d.previos = r; ctx.refrescar(); } }).catch(() => {});
}

export default {
  codigo: "F08",
  titulo: "ATS de turno sectorial",
  async preparar(ctx) {
    ctx.cat = await leerCatalogoAts();
  },
  inicial: () => {
    const s = leerSesion();
    const u = s.usuario;
    // Encargado: su sector. Inspector: el sector del lugar de ingreso si es deposito/logistica.
    const sector = u?.rol_hys === "encargado" ? (u.sector || null) : (sectorDeSesion(s.obra) || undefined);
    return { fecha: hoyIso(), respuestas: {}, tareas: [], fuera_rutina: "no", sector };
  },
  pasos: [
    {
      titulo: "Sector y turno",
      dibujar: (d, ctx) => {
        buscarPrevios(d, ctx);
        const ya = bloqueante(d);
        const rehace = (d.previos || []).find((a) => a.turno_id === d.turno?.id && a.resultado === "no_autorizado");
        const ponerResponsables = (t) => { d.encargado_id = t.encargado_id || d.encargado_id || null; d.autoriza_id = t.autoriza_id || d.autoriza_id || null; };
        const enObra = esObraReal(leerSesion().obra);
        return [
          enObra && aviso("Ingresaste en una obra (OF). El ATS de turno (F08) es de Depósito o Logística: elegí el sector del turno. La OF no se guarda en el ATS.", "info"),
          selectorEmpresa(d, ctx),
          campoOpciones(d, "sector", "Sector", ctx.cat.sectores.filter(([k]) => !soloSector() || k === soloSector()), {
            columnas: 2, requerido: true,
            alCambiar: () => { d.respuestas = {}; d.turno = null; d.encargado_id = null; d.autoriza_id = null; ctx.refrescar(); }
          }),
          campoTexto(d, "fecha", "Fecha del turno", { tipo: "date", requerido: true, alCambiar: () => ctx.refrescar() }),
          d.sector && selectorTurno(d, ctx.cat.turnos, "turno", { alCambiar: (t) => { ponerResponsables(t); proponerEmpresa(d, ctx); ctx.refrescar(); } }),
          ya && aviso(`Ya hay un ATS para este turno (${ya.name || "cargado"}). No se carga otro: si hay que corregirlo, avisá a HyS.`, "error"),
          rehace && aviso(`El ATS anterior de este turno (${rehace.name}) quedó «No autorizado». Este lo reemplaza.`, "alerta")].filter(Boolean);
      },
      validar: (d, ctx) => (empresas(ctx).length && !d.empresa_id ? "Elegí la empresa." : !d.sector ? "Elegí el sector." : !d.fecha ? "Cargá la fecha." : !d.turno ? "Elegí el turno."
        : bloqueante(d) ? "Ya hay un ATS para este turno." : null)
    },
    {
      titulo: "Actividades y responsables",
      dibujar: (d, ctx) => {
        const ops = (ctx.cat.personas[d.sector] || []).map((e) => [e.id, e.puesto ? `${e.nombre} · ${e.puesto}` : e.nombre]);
        return [campoArea(d, "actividades", "Turno y actividades", { requerido: true, filas: 3 }),
          campoSelect(d, "encargado_id", "Encargado", ops, { requerido: true, alCambiar: () => proponerEmpresa(d, ctx) }),
          campoSelect(d, "autoriza_id", "Autoriza", ops, { requerido: true })];
      },
      validar: (d) => (!d.actividades?.trim() ? "Contá las actividades del turno." : !d.encargado_id ? "Elegí el encargado." : !d.autoriza_id ? "Elegí quién autoriza." : null)
    },
    {
      titulo: "Controles previos (1 de 2)",
      dibujar: (d, ctx) => [aviso(DETENCION, "alerta"), checklist(mitad(d, ctx, 1), d, opc(ctx))],
      validar: (d, ctx) => validarChecklist(mitad(d, ctx, 1), d, opc(ctx))
    },
    {
      titulo: "Controles previos (2 de 2)",
      dibujar: (d, ctx) => checklist(mitad(d, ctx, 2), d, opc(ctx)),
      validar: (d, ctx) => validarChecklist(mitad(d, ctx, 2), d, opc(ctx))
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
        return [campoTexto(d, "dotacion", "Dotación presente", { tipo: "number", min: 1, requerido: true }),
          campoOpciones(d, "charla", "¿Se hizo la charla previa con toda la dotación?", [["si", "Sí", { clase: "verde" }], ["no", "No", { clase: "rojo" }]], { columnas: 2, requerido: true, alCambiar: () => ctx.refrescar() }),
          crit && aviso("Hay un control crítico en «No»: no se puede «Autorizado».", "error"),
          campoOpciones(d, "resultado", "Resultado", RESULTADOS.map(([v, t, o]) => [v, t, { ...o, deshabilitado: crit && v === "autorizado" }]), { requerido: true, alCambiar: () => ctx.refrescar() }),
          d.resultado === "autorizado_correccion" && campoArea(d, "correccion", "¿Qué se corrigió y quién lo verificó?", { requerido: true, filas: 2 }),
          campoArea(d, "observaciones", "Observaciones (opcional)", { filas: 2 })].filter(Boolean);
      },
      validar: (d, ctx) => !(d.dotacion >= 1) ? "La dotación tiene que ser 1 o más." : d.charla !== "si" ? "Sin charla previa con toda la dotación no se puede cerrar el ATS." :
        !d.resultado ? "Elegí el resultado." : criticoEnNo(d, ctx) && d.resultado === "autorizado" ? "Con un crítico en «No» no puede ser «Autorizado»." :
          d.resultado === "autorizado_correccion" && !d.correccion?.trim() ? "Contá qué se corrigió y quién lo verificó." : null
    },
    {
      titulo: "Firmas",
      dibujar: (d, ctx) => [campoFirma(d, "firma_encargado", "Firma del encargado", { requerido: true }),
        campoOpciones(d, "remota", "¿Quien autoriza no está en el lugar (autorizó por teléfono)?", [["no", "No, firma acá"], ["si", "Sí, autorizó a distancia"]], { columnas: 2, alCambiar: () => ctx.refrescar() }),
        d.remota !== "si" && campoFirma(d, "firma_autoriza", "Firma de quien autoriza", { requerido: true })].filter(Boolean),
      validar: (d) => (!d.firma_encargado ? "Falta la firma del encargado." : d.remota !== "si" && !d.firma_autoriza ? "Falta la firma de quien autoriza." : null)
    }
  ],
  resumen: (d, ctx) => [
    ...(empresas(ctx).length ? [["Empresa", empresas(ctx).find((e) => e.id === d.empresa_id)?.nombre || ""]] : []),
    ["Sector", nombreSector(ctx, d.sector)], ["Fecha", d.fecha], ["Turno", d.turno ? `${d.turno.nombre} · ${d.turno.inicio}` : ""],
    ["Actividades", d.actividades],
    ["Controles", resumenChecklist(items(d, ctx), d)],
    ["Fuera de rutina", d.fuera_rutina === "si" ? `Sí · ${d.tareas.filter((t) => t.paso).length} tarea(s)` : "No"],
    ["Dotación", d.dotacion], ["Resultado", RES_TXT[d.resultado]],
    ["Autorización", d.remota === "si" ? "A distancia" : "Firmada en el lugar"]],
  armar: (d, auto, ctx) => {
    const { lineas } = armarLineasYDesvios(items(d, ctx), d, { tipo: "ats" });
    const control = camposControl(auto);
    delete control.x_cargado_por; delete control.x_idempotency_key; // los pone el backend (sesión y clave del cuerpo)
    const yo = leerSesion().usuario;
    const vals = {
      x_sector: d.sector, x_turno_id: d.turno.id, x_fecha: d.fecha,
      x_actividades: d.actividades, x_encargado_id: Number(d.encargado_id), x_autoriza_id: Number(d.autoriza_id),
      x_linea_ids: lineas, x_fuera_rutina: d.fuera_rutina,
      x_tarea_ids: d.fuera_rutina === "si" ? d.tareas.filter((t) => t.paso?.trim()).map((t) => [0, 0, {
        x_paso: t.paso.trim(), x_riesgo: t.riesgo?.trim() || false, x_control: t.control?.trim() || false, x_responsable: t.responsable?.trim() || false }]) : [],
      x_dotacion: Number(d.dotacion), x_charla_previa: d.charla === "si", x_resultado: d.resultado,
      x_correccion: d.resultado === "autorizado_correccion" ? d.correccion.trim() : false,
      x_observaciones: d.observaciones?.trim() || false,
      x_autorizacion_remota: d.remota === "si",
      ...(d.empresa_id ? { x_empresa_id: Number(d.empresa_id) } : {}),
      x_firma_encargado: d.firma_encargado, x_firma_autoriza: d.remota === "si" ? false : d.firma_autoriza,
      ...control
    };
    return {
      operacion: "enviar",
      endpoint: "/ats",
      auth: { inspector_id: yo?.id ?? null, token: yo?.token || null },
      cuerpo: { formulario: "F08", idempotency_key: auto.idempotency_key, odoo: { model: "x_hys_ats", method: "create", vals },
        contexto: { sector: nombreSector(ctx, d.sector), turno: d.turno.nombre, app: "hys-carga web" } }
    };
  }
};
