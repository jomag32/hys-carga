// HYS-F02 · Inspección de obra → x_hys_inspeccion con x_linea_ids anidadas (x_hys_inspeccion_linea).
// Diseño §2.8, §2.9, §2.14, §5.5 F02 y Anexo A. Ítems: 6 generales siempre + bloques de los riesgos
// de la Ficha de la OT (si la OT no tiene Ficha aprobada, solo los generales).
// Ficha (F01): la REAL de Odoo (x_hys_ficha activa de la OT, GET /api/v1/fichas?ot=; sin señal, la copia del
// celular). Ítems: plantilla del protocolo PR-HYS-001 v1 (api/odoo.js itemsPlantillaF02; Odoo todavía no
// tiene x_hys_item_plantilla). Clase, motivo y ficha los vuelve a poner el backend al recibir (no se confía acá).
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
import { leerInspectores, leerFichaObra, itemsPlantillaF02, aFormatoOdoo, validarInspeccion, SELECCION, CAMPOS_PENDIENTES_EN_ODOO } from "../api/odoo.js";

const KM_REMOTA = 50; // x_hys_config.x_distancia_remota_km
const CLASES = { A: "Clase A · Alto riesgo", B: "Clase B · Riesgo medio", C: "Clase C · Bajo riesgo" };
const PRESENCIAL_OBLIGATORIA = ["apertura", "hito_critico"]; // §2.8 x_presencial_obligatoria
const etiqueta = (campo, v) => SELECCION[campo].find(([x]) => x === v)?.[1] || "";

const generales = (ctx) => ctx.items.filter((it) => !it.x_riesgo_codigo && !it.x_riesgo_id);
const deRiesgo = (ctx, cod) => ctx.items.filter((it) => it.x_riesgo_codigo === cod);
const esObra = (d) => d.ambito === "obra";
// Ficha de la obra: ctx.fichas[obraId] = {estado: "cargando"|"ok"|"error", f, error}. f = null → obra sin Ficha.
const cargaFicha = (d, ctx) => (esObra(d) && d.obra && d.obra.id !== "planta" ? ctx.fichas[d.obra.id] : undefined);
const ficha = (d, ctx) => cargaFicha(d, ctx)?.f || null;
const claseDe = (d, ctx) => ficha(d, ctx)?.clase || "A";
// Bloques de riesgo: solo con Ficha APROBADA (en borrador la obra va como Clase A, solo generales).
const riesgosObra = (d, ctx) => { const f = ficha(d, ctx); return f?.aprobada ? f.riesgos.map((r) => r.codigo) : []; };
const itemsDeLaObra = (d, ctx) => [...generales(ctx), ...RIESGOS_CODIGOS.filter((c) => riesgosObra(d, ctx).includes(c)).flatMap((c) => deRiesgo(ctx, c))];
// Hitos de la Ficha que pueden abrir un «Inicio de hito crítico»: críticos y no terminados.
const hitosDe = (d, ctx) => (cargaFicha(d, ctx)?.estado === "ok"
  ? (ficha(d, ctx)?.hitos || []).filter((x) => x.critico && !x.alcanzado && x.situacion !== "terminado") : undefined);
function pedirFicha(d, ctx, luego) {
  const id = d.obra?.id;
  if (!esObra(d) || !id || id === "planta" || ctx.fichas[id]) return;
  ctx.fichas[id] = { estado: "cargando" };
  leerFichaObra(id).then((f) => { ctx.fichas[id] = { estado: "ok", f }; })
    .catch((e) => { ctx.fichas[id] = { estado: "error", error: e.message }; })
    .finally(() => { if (d.obra?.id === id) luego(); });
}
const fechaCorta = (v) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : null);
const inspectorValido = (d, ctx) => ctx.inspectores.some((e) => e.id === d.inspector_id);

export default {
  codigo: "F02",
  titulo: "Inspección de obra",
  async preparar(ctx) {
    ctx.fichas = {};
    ctx.items = itemsPlantillaF02();
    ctx.inspectores = await leerInspectores(); // [{id, nombre, legajo}] de x_hys_inspector (backend) o ejemplos
  },
  // Al retomar un borrador ya pasado el paso «Obra»: leer la Ficha antes de pintar (bloques de riesgo e hitos).
  async retomar(d, ctx) {
    // Borradores viejos (antes del 18/10/2026 22:35) traían la obra del ingreso marcada sola: si la persona
    // no la eligió en ese borrador (obra_elegida), se quita y hay que elegirla.
    if (d.obra && !d.obra_elegida) { delete d.obra; d.respuestas = {}; d.ficha_hito_id = null; }
    const id = d.obra?.id;
    if (!esObra(d) || !id || id === "planta") return;
    try { ctx.fichas[id] = { estado: "ok", f: await leerFichaObra(id) }; }
    catch (e) { ctx.fichas[id] = { estado: "error", error: e.message }; }
  },
  inicial: () => ({ ambito: "obra", tipo_programa: null, modalidad: "presencial", respuestas: {} }),
  get pasos() {
    return [
      {
        titulo: "Tipo de inspección",
        dibujar: (d) => [
          campoOpciones(d, "ambito", "Ámbito", SELECCION.x_ambito, { columnas: 3, requerido: true,
            alCambiar: () => { if (!esObra(d)) { d.ficha_hito_id = null; } } }),
          // 2 columnas: las 6 opciones entran sin quedar debajo de la barra fija (390 × 844).
          campoOpciones(d, "tipo_programa", "Tipo", SELECCION.x_tipo_programa, { requerido: true, columnas: 2,
            ayuda: "Si no te la asignaron en el programa, elegí «Fuera de programa».",
            alCambiar: (v) => { if (v !== "hito_critico") d.ficha_hito_id = null; if (PRESENCIAL_OBLIGATORIA.includes(v)) d.modalidad = "presencial"; } })],
        validar: (d) => (!d.ambito ? "Elegí el ámbito." : !d.tipo_programa ? "Elegí el tipo de inspección." :
          d.tipo_programa === "hito_critico" && !esObra(d) ? "El inicio de hito crítico es solo para obras." : null)
      },
      {
        titulo: "Obra",
        visible: (d) => esObra(d),
        dibujar: (d, ctx) => {
          const info = h("div", { id: "ficha-obra" });
          const hito = h("div");
          const pintar = () => {
            pedirFicha(d, ctx, pintar);
            const c = cargaFicha(d, ctx);
            info.replaceChildren(!d.obra || !c ? "" : c.estado === "cargando" ? h("p", { class: "ayuda cargando-obras" }, "⏳ Leyendo la Ficha de Riesgos de la obra…")
              : c.estado === "error" ? h("div", { class: "aviso error", role: "alert" }, `No se pudo leer la Ficha de Riesgos (${c.error || "sin conexión"}). `,
                "Si seguís, se cargan solo los 6 ítems generales.", h("br"),
                h("button", { type: "button", class: "btn secundario", id: "reintentar-ficha", onclick: () => { delete ctx.fichas[d.obra.id]; pintar(); } }, "Reintentar"))
              : cajaFicha(c.f));
            hito.replaceChildren(d.tipo_programa === "hito_critico" && d.obra && c?.estado === "ok" ? cajaHito() : "");
          };
          const cajaFicha = (f) => {
            if (!f) return aviso("Obra sin ficha → Clase A (sin Ficha). Se cargan solo los 6 ítems generales. Queda pendiente que HyS cargue la Ficha de Riesgos.", "alerta");
            const avisos = [f.faltan_hitos && "Faltan hitos", f.aviso_ugeop && "Revisar con UGEOP"].filter(Boolean);
            return h("div", { class: `aviso ${f.clase === "A" ? "alerta" : "info"}` },
              h("p", {}, h("b", {}, `Ficha ${f.nombre || f.id}`), ` · ${f.aprobada ? "Aprobada" : "En borrador"}`),
              h("p", {}, h("b", {}, CLASES[f.clase] || `Clase ${f.clase}`), f.motivo ? ` — ${f.motivo}` : ""),
              f.aprobada ? (f.riesgos.length ? h("p", {}, "Riesgos: ", f.riesgos.map((r) => r.nombre).join(", ")) : h("p", {}, "La Ficha no marca riesgos: solo ítems generales."))
                : h("p", {}, "Ficha sin aprobar: se trata como Clase A y se cargan solo los 6 ítems generales."),
              avisos.length ? h("p", { class: "avisos-ficha" }, avisos.map((t) => h("span", { class: "etiqueta-aviso" }, `⚠ ${t}`))) : "",
              f.aviso ? h("p", { class: "ayuda" }, f.aviso) : "");
          };
          const cajaHito = () => {
            const lista = hitosDe(d, ctx) || [];
            if (!lista.length) {
              d.ficha_hito_id = null;
              return aviso(ficha(d, ctx) ? "La Ficha de Riesgos de esta obra no tiene hitos críticos pendientes. El inicio de hito crítico necesita uno: pedile a HyS que lo cargue en la Ficha o elegí otro tipo de inspección."
                : "Obra sin Ficha de Riesgos: no hay hitos críticos. Elegí otro tipo de inspección o pedile a HyS que cargue la Ficha.", "alerta");
            }
            if (!lista.some((x) => x.id === d.ficha_hito_id)) d.ficha_hito_id = null;
            const texto = (x) => [x.name, x.inicio_real ? `inició ${fechaCorta(x.inicio_real)}` : x.inicio_previsto ? `previsto ${fechaCorta(x.inicio_previsto)}` : "sin fecha",
              x.situacion === "atrasado" ? "atrasado" : null].filter(Boolean).join(" · ");
            return campoSelect(d, "ficha_hito_id", "Hito crítico que arrancó", lista.map((x) => [x.id, texto(x)]),
              { requerido: true, ayuda: "Hitos críticos de la Ficha de Riesgos. Inspección presencial dentro de las 72 h del inicio real del hito." });
          };
          // selectorObra primero (antes de pintar hito e info). Arranca VACÍO en todo F02 (prefill:false,
          // pedido de Jorge 18/10/2026 22:35): ni la obra del ingreso ni la última elegida. Solo un borrador
          // retomado conserva la obra que se eligió en ese borrador (se puede «Descartar»).
          const selector = selectorObra(d, "obra", { etiqueta: "Obra (OT)", prefill: false, alCambiar: () => { d.obra_elegida = true; d.respuestas = {}; d.ficha_hito_id = null; pintar(); } });
          pintar();
          return [selector, info, hito];
        },
        validar: (d, ctx) => {
          if (!d.obra) return "Elegí la obra (OT): es obligatoria si el ámbito es Obra.";
          const c = cargaFicha(d, ctx);
          if (c?.estado === "cargando") return "Esperá: se está leyendo la Ficha de Riesgos de la obra.";
          if (d.tipo_programa !== "hito_critico" || d.ficha_hito_id) return null;
          if (c?.estado === "error") return "Sin la Ficha no se pueden ver los hitos: reintentá con señal o elegí otro tipo.";
          return hitosDe(d, ctx)?.length === 0 ? "Esta obra no tiene hitos críticos en su Ficha: no se puede cargar un inicio de hito crítico. Elegí otro tipo." : "Elegí el hito crítico.";
        }
      },
      {
        titulo: "Modalidad e inspector",
        dibujar: (d, ctx) => {
          const km = esObra(d) ? (ficha(d, ctx)?.distancia_km ?? d.obra?.x_mock_km ?? 0) : 0;
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
        visible: (d, ctx) => riesgosObra(d, ctx).includes(cod) && deRiesgo(ctx, cod).length > 0,
        dibujar: (d, ctx) => checklist(deRiesgo(ctx, cod), d, { comentarioSiempre: true }),
        validar: (d, ctx) => validarChecklist(deRiesgo(ctx, cod), d)
      })),
      {
        titulo: "Toma de conocimiento",
        dibujar: (d) => [
          campoTexto(d, "tc_nombre", d.modalidad === "remota" ? "Director de Obra · nombre" : esObra(d) ? "Capataz · nombre" : "Responsable · nombre", { requerido: true, autocomplete: "off" }),
          campoFirma(d, "tc_firma", "Firma «tomé conocimiento»", { requerido: true }),
          campoArea(d, "tc_obs", "Observaciones (opcional)", { filas: 2 }),
          aviso("La firma no es veto: la inspección cuenta igual.", "info")],
        validar: (d) => (!d.tc_nombre?.trim() ? "Falta el nombre de quien toma conocimiento." : !d.tc_firma ? "Falta la firma." : null)
      },
      // Firma del inspector HyS que hizo la inspección → x_firma_inspector (opcional en Odoo; la app la pide
      // para que cada inspección quede firmada por quien la hizo, igual que la del capataz).
      {
        titulo: "Firma del inspector",
        dibujar: (d, ctx) => [
          aviso(`Firma de ${textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id)) || "quien inspeccionó"}.`, "info"),
          campoFirma(d, "firma_inspector", "Firma del inspector", { requerido: true })],
        validar: (d) => (!d.firma_inspector ? "Falta la firma del inspector." : null)
      }
    ];
  },
  resumen: (d, ctx) => {
    const f = ficha(d, ctx);
    return [
      ["Ámbito", etiqueta("x_ambito", d.ambito)],
      ["Tipo", etiqueta("x_tipo_programa", d.tipo_programa)],
      ...(esObra(d) ? [["Obra", d.obra?.name], ["Ficha", f ? `${f.nombre || f.id} · ${f.aprobada ? "aprobada" : "en borrador"}` : "Sin Ficha"],
        ["Clase", f ? CLASES[f.clase] || `Clase ${f.clase}` : "Clase A (sin Ficha)"]] : []),
      ...(d.tipo_programa === "hito_critico" ? [["Hito", (hitosDe(d, ctx) || []).find((x) => x.id === d.ficha_hito_id)?.name]] : []),
      ["Modalidad", d.modalidad === "remota" ? "Remota" : "Presencial"],
      ["Inspector", textoInspector(ctx.inspectores.find((e) => e.id === d.inspector_id))],
      ["Ítems", resumenChecklist(itemsDeLaObra(d, ctx), d)],
      ["Tomó conocimiento", d.tc_nombre],
      ["Firma del inspector", d.firma_inspector ? "Firmada" : "—"]];
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
      x_ficha_hito_id: d.tipo_programa === "hito_critico" ? d.ficha_hito_id : false, // x_hys_ficha_hito (el backend valida que sea de la Ficha)
      x_inspector_hys_id: d.inspector_id, // x_hys_inspector (el backend agrega x_inspector_texto)
      x_tc_nombre: d.tc_nombre.trim(),
      x_tc_firma: d.tc_firma,
      x_firma_inspector: d.firma_inspector || false,
      x_tc_observaciones: d.tc_obs?.trim() || false,
      x_origen: "formulario",
      ...camposControl(auto), // x_idempotency_key, x_fecha_hora_control, x_gps_*, x_cargado_por
      x_linea_ids: lineas     // [[0, 0, {...}], ...] = Command.create
    });
    // Misma validación que hará el backend (422): si falla, no se encola y el borrador sigue.
    const errores = validarInspeccion(vals);
    if (errores.length) throw new Error(errores.map((x) => x.mensaje).join(" · "));
    const yo = leerSesion().usuario;
    return {
      operacion: "enviar",
      endpoint: "/inspecciones",
      auth: { inspector_id: yo?.id ?? null, token: yo?.token || null }, // el backend saca «quién carga» del token
      cuerpo: {
        formulario: "F02",
        idempotency_key: auto.idempotency_key,
        odoo: { model: "x_hys_inspeccion", method: "create", vals },
        // Datos que NO van al create (no confirmados en el modelo creado); el backend decide.
        contexto: {
          obra: esObra(d) ? d.obra.name : etiqueta("x_ambito", d.ambito),
          modalidad: d.modalidad,
          // Solo informativo: el backend vuelve a leer la Ficha y pone x_ficha_id, clase y motivo.
          ficha_id: f?.id ?? null,
          clase_al_inspeccionar: esObra(d) ? claseDe(d, ctx) : false,
          clase_motivo: esObra(d) ? f?.motivo || "Sin Ficha de Riesgos: se trata como Clase A" : false,
          cant_no: cantNo,
          desvios_a_generar: cantNo, // un x_hys_desvio por cada «No» (lo crea el backend/Odoo, no este payload)
          campos_pendientes_en_odoo: CAMPOS_PENDIENTES_EN_ODOO,
          inspector_modelo: "x_hys_inspector",
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
