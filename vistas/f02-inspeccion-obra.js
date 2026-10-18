// HYS-F02 · Inspección de obra → x_hys_inspeccion con x_linea_ids anidadas (x_hys_inspeccion_linea).
// Diseño §2.8, §2.9, §2.14, §5.5 F02 y Anexo A. Ítems: 6 generales siempre + bloques de los riesgos
// de la Ficha de la OT (si la OT no tiene Ficha aprobada, solo los generales).
// Cada «No» pide gravedad (x_criticidad) + foto (x_foto) obligatorias.
// El envío NO va a Odoo desde el celular: arma el payload exacto del create de x_hys_inspeccion y lo
// pasa a la cola (api/cola.js) → api/odoo.js enviarFormulario("/inspecciones") → simulado o backend.

import { h, nombreM2o } from "../componentes/util.js";
import { campoOpciones, campoSelect, campoTexto, campoArea, campoFirma, aviso } from "../componentes/campos.js";
import { selectorObra } from "../componentes/selector-obra.js";
import { checklist, validarChecklist, armarLineasYDesvios, resumenChecklist } from "../componentes/checklist.js";
import { camposControl, obraCorta } from "../componentes/campos-auto.js";
import { leerSesion } from "../componentes/sesion.js";
import { selectorInspector, textoInspector } from "../componentes/selector-inspector.js";
import { leerRegistros, leerInspectores, leerHitosObra, aFormatoOdoo, validarInspeccion, SELECCION, CAMPOS_PENDIENTES_EN_ODOO } from "../api/odoo.js";

const KM_REMOTA = 50; // x_hys_config.x_distancia_remota_km
const CLASES = { A: "Clase A · Alto riesgo", B: "Clase B · Riesgo medio", C: "Clase C · Bajo riesgo" };
const PRESENCIAL_OBLIGATORIA = ["apertura", "hito_critico"]; // §2.8 x_presencial_obligatoria
const etiqueta = (campo, v) => SELECCION[campo].find(([x]) => x === v)?.[1] || "";

const generales = (ctx) => ctx.items.filter((it) => !it.x_riesgo_id);
const deRiesgo = (ctx, rid) => ctx.items.filter((it) => it.x_riesgo_id && it.x_riesgo_id[0] === rid);
const esObra = (d) => d.ambito === "obra";
const ficha = (d, ctx) => (esObra(d) ? ctx.fichas.find((f) => f.x_ot_id[0] === d.obra?.id && f.x_estado === "aprobada") : null);
const riesgosObra = (d, ctx) => ficha(d, ctx)?.x_riesgo_ids || [];
const itemsDeLaObra = (d, ctx) => [...generales(ctx), ...ctx.riesgos.filter((r) => riesgosObra(d, ctx).includes(r.id)).flatMap((r) => deRiesgo(ctx, r.id))];
// Hitos de la obra (project.milestone): se piden al elegir «Inicio de hito crítico» (backend: GET /api/v1/hitos?ot=).
const hitosDe = (d, ctx) => ctx.hitosPorObra[d.obra?.id]; // undefined = sin pedir; [] = la obra no tiene hitos
const inspectorValido = (d, ctx) => ctx.inspectores.some((e) => e.id === d.inspector_id);

export default {
  codigo: "F02",
  titulo: "Inspección de obra",
  async preparar(ctx) {
    ctx.hitosPorObra = {};
    [ctx.items, ctx.riesgos, ctx.fichas, ctx.inspectores] = await Promise.all([
      leerRegistros("x_hys_item_plantilla", [["x_formulario", "=", "F02"], ["x_active", "=", true]]),
      leerRegistros("x_hys_riesgo", [], ["x_codigo", "x_name"]),
      leerRegistros("x_hys_ficha", [], ["x_ot_id", "x_estado", "x_riesgo_ids", "x_clase_riesgo", "x_clase_motivo", "x_distancia_km"]),
      leerInspectores() // [{id, nombre, legajo}] de hr.employee (backend) o ejemplos
    ]);
    ctx.items.sort((a, b) => a.x_secuencia - b.x_secuencia);
  },
  inicial: () => ({ ambito: "obra", tipo_programa: null, modalidad: "presencial", respuestas: {} }),
  get pasos() {
    return [
      {
        titulo: "Tipo de inspección",
        dibujar: (d) => [
          campoOpciones(d, "ambito", "Ámbito", SELECCION.x_ambito, { columnas: 3, requerido: true,
            alCambiar: () => { if (!esObra(d)) { d.hito_id = null; } } }),
          campoOpciones(d, "tipo_programa", "Tipo", SELECCION.x_tipo_programa, { requerido: true,
            ayuda: "Si no te la asignaron en el programa, elegí «Fuera de programa».",
            alCambiar: (v) => { if (v !== "hito_critico") d.hito_id = null; if (PRESENCIAL_OBLIGATORIA.includes(v)) d.modalidad = "presencial"; } })],
        validar: (d) => (!d.ambito ? "Elegí el ámbito." : !d.tipo_programa ? "Elegí el tipo de inspección." :
          d.tipo_programa === "hito_critico" && !esObra(d) ? "El inicio de hito crítico es solo para obras." : null)
      },
      {
        titulo: "Obra",
        visible: (d) => esObra(d),
        dibujar: (d, ctx) => {
          const info = h("div");
          const hito = h("div");
          const pintar = () => {
            const f = ficha(d, ctx);
            info.replaceChildren(!d.obra ? "" : f
              ? aviso(`${CLASES[f.x_clase_riesgo] || "Sin clase"} — ${f.x_clase_motivo || ""}`, f.x_clase_riesgo === "A" ? "alerta" : "info")
              : aviso("Esta obra no tiene Ficha de Riesgos aprobada: es Clase A y solo se cargan los 6 ítems generales. Queda pendiente la Ficha.", "alerta"));
            hito.replaceChildren(d.tipo_programa === "hito_critico" && d.obra ? cajaHito() : "");
          };
          const cajaHito = () => {
            const lista = hitosDe(d, ctx);
            if (lista === undefined) {
              const obraId = d.obra.id;
              leerHitosObra(obraId).then((l) => { ctx.hitosPorObra[obraId] = l; })
                .catch((e) => { ctx.hitosPorObra[obraId] = null; ctx.errorHitos = e.message; })
                .finally(() => { if (d.obra?.id === obraId) pintar(); });
              return h("p", { class: "ayuda cargando-obras" }, "⏳ Cargando hitos de la obra…");
            }
            if (lista === null) return h("div", { class: "aviso error" }, `No se pudieron leer los hitos: ${ctx.errorHitos || ""}`,
              h("br"), h("button", { type: "button", class: "btn secundario", onclick: () => { delete ctx.hitosPorObra[d.obra.id]; pintar(); } }, "Reintentar"));
            if (!lista.length) { d.hito_id = null; return aviso("Esta obra no tiene hitos cargados en Odoo. El inicio de hito crítico necesita un hito: cargalo en el proyecto de Odoo o elegí otro tipo de inspección.", "alerta"); }
            if (!lista.some((x) => x.id === d.hito_id)) d.hito_id = null;
            return campoSelect(d, "hito_id", "Hito crítico que arrancó", lista.map((x) => [x.id, x.name]),
              { requerido: true, ayuda: "Inspección presencial dentro de las 72 h del inicio real del hito." });
          };
          // selectorObra primero: deja marcada la obra del ingreso (d.obra) antes de pintar hito e info.
          const selector = selectorObra(d, "obra", { etiqueta: "Obra (OT)", alCambiar: () => { d.respuestas = {}; d.hito_id = null; pintar(); } });
          pintar();
          return [selector, hito, info];
        },
        validar: (d, ctx) => (!d.obra ? "Elegí la obra (OT): es obligatoria si el ámbito es Obra." :
          d.tipo_programa === "hito_critico" && !d.hito_id
            ? (hitosDe(d, ctx)?.length === 0 ? "Esta obra no tiene hitos en Odoo: no se puede cargar un inicio de hito crítico. Elegí otro tipo." : "Elegí el hito crítico.")
            : null)
      },
      {
        titulo: "Modalidad e inspector",
        dibujar: (d, ctx) => {
          const km = esObra(d) ? (ficha(d, ctx)?.x_distancia_km ?? d.obra?.x_mock_km ?? 0) : 0;
          const obligatoria = PRESENCIAL_OBLIGATORIA.includes(d.tipo_programa);
          const remotaOk = esObra(d) && km > KM_REMOTA && !obligatoria;
          if (!remotaOk) d.modalidad = "presencial";
          // Por defecto, el inspector es quien ingresó (se puede cambiar).
          const yo = ctx.sesion?.usuario;
          if (d.inspector_id == null && yo?.fuente === "x_hys_inspector" && ctx.inspectores.some((e) => e.id === yo.id)) d.inspector_id = yo.id;
          return [
            campoOpciones(d, "modalidad", "Modalidad", [["presencial", "Presencial"], ["remota", "Remota", { deshabilitado: !remotaOk }]],
              { columnas: 2, requerido: true, ayuda: !esObra(d) ? "Fuera de obra: presencial." : obligatoria ? "Apertura e inicio de hito crítico: presencial obligatoria."
                : km <= KM_REMOTA ? `Obra a ${km} km: solo presencial.` : `Obra a ${km} km: puede ser remota.` }),
            selectorInspector(d, "inspector_id", ctx.inspectores, { etiqueta: "Inspector" })];
        },
        validar: (d, ctx) => (!inspectorValido(d, ctx) ? "Elegí el inspector." : null)
      },
      {
        titulo: "Ítems generales",
        dibujar: (d, ctx) => checklist(generales(ctx), d, { comentarioSiempre: true }),
        validar: (d, ctx) => validarChecklist(generales(ctx), d)
      },
      // Un paso por cada bloque de riesgo; solo aparecen los que marca la Ficha de la OT.
      ...RIESGOS_CODIGOS.map((cod) => ({
        titulo: `Riesgo: ${NOMBRES_RIESGO[cod]}`,
        visible: (d, ctx) => { const r = ctx.riesgos.find((x) => x.x_codigo === cod); return !!r && riesgosObra(d, ctx).includes(r.id); },
        dibujar: (d, ctx) => checklist(deRiesgo(ctx, ctx.riesgos.find((x) => x.x_codigo === cod).id), d, { comentarioSiempre: true }),
        validar: (d, ctx) => validarChecklist(deRiesgo(ctx, ctx.riesgos.find((x) => x.x_codigo === cod).id), d)
      })),
      {
        titulo: "Toma de conocimiento",
        dibujar: (d) => [
          campoTexto(d, "tc_nombre", d.modalidad === "remota" ? "Director de Obra · nombre" : esObra(d) ? "Capataz · nombre" : "Responsable · nombre", { requerido: true, autocomplete: "off" }),
          campoFirma(d, "tc_firma", "Firma «tomé conocimiento»", { requerido: true }),
          campoArea(d, "tc_obs", "Observaciones (opcional)", { filas: 2 }),
          aviso("La firma no es veto: la inspección cuenta igual.", "info")],
        validar: (d) => (!d.tc_nombre?.trim() ? "Falta el nombre de quien toma conocimiento." : !d.tc_firma ? "Falta la firma." : null)
      }
    ];
  },
  resumen: (d, ctx) => {
    const f = ficha(d, ctx);
    return [
      ["Ámbito", etiqueta("x_ambito", d.ambito)],
      ["Tipo", etiqueta("x_tipo_programa", d.tipo_programa)],
      ...(esObra(d) ? [["Obra", d.obra?.name], ["Clase", f ? CLASES[f.x_clase_riesgo] : "Clase A (sin Ficha)"]] : []),
      ...(d.tipo_programa === "hito_critico" ? [["Hito", (hitosDe(d, ctx) || []).find((x) => x.id === d.hito_id)?.name]] : []),
      ["Modalidad", d.modalidad === "remota" ? "Remota" : "Presencial"],
      ["Inspector", textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id))],
      ["Ítems", resumenChecklist(itemsDeLaObra(d, ctx), d)],
      ["Tomó conocimiento", d.tc_nombre]];
  },
  armar: (d, auto, ctx) => {
    const f = ficha(d, ctx);
    const { lineas, cantNo } = armarLineasYDesvios(itemsDeLaObra(d, ctx), d, { origen: "F02", ambito: d.ambito });
    // Payload EXACTO del create de x_hys_inspeccion (solo campos del modelo creado en Odoo).
    const vals = aFormatoOdoo({
      x_formulario: "F02",
      x_ambito: d.ambito,
      x_tipo_programa: d.tipo_programa,
      x_estado: "realizada",
      x_ot_id: esObra(d) ? d.obra.id : false,
      x_hito_id: d.tipo_programa === "hito_critico" ? d.hito_id : false,
      x_inspector_hys_id: d.inspector_id, // x_hys_inspector (el backend agrega x_inspector_texto)
      x_tc_nombre: d.tc_nombre.trim(),
      x_tc_firma: d.tc_firma,
      x_tc_observaciones: d.tc_obs?.trim() || false,
      x_origen: "formulario",
      ...camposControl(auto), // x_idempotency_key, x_fecha_hora_control, x_gps_*, x_cargado_por
      x_linea_ids: lineas     // [[0, 0, {...}], ...] = Command.create
    });
    // Misma validación que hará el backend (422): si falla, no se encola y el borrador sigue.
    const errores = validarInspeccion(vals);
    if (errores.length) throw new Error(errores.map((x) => x.mensaje).join(" · "));
    return {
      operacion: "enviar",
      endpoint: "/inspecciones",
      cuerpo: {
        formulario: "F02",
        idempotency_key: auto.idempotency_key,
        odoo: { model: "x_hys_inspeccion", method: "create", vals },
        // Datos que NO van al create (no confirmados en el modelo creado); el backend decide.
        contexto: {
          obra: esObra(d) ? d.obra.name : etiqueta("x_ambito", d.ambito),
          modalidad: d.modalidad,
          clase_al_inspeccionar: esObra(d) ? f?.x_clase_riesgo || "A" : false,
          clase_motivo: esObra(d) ? f?.x_clase_motivo || "Sin Ficha de Riesgos aprobada" : false,
          cant_no: cantNo,
          desvios_a_generar: cantNo, // un x_hys_desvio por cada «No» (lo crea el backend/Odoo, no este payload)
          campos_pendientes_en_odoo: CAMPOS_PENDIENTES_EN_ODOO,
          inspector_modelo: "x_hys_inspector",
          cargado_por_inspector_id: leerSesion().usuario?.id ?? null, // el backend verifica que sea un inspector activo
          lugar: obraCorta(leerSesion().obra),
          app: "hys-carga web"
        }
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
