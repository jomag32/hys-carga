// F08 · ATS de turno sectorial (piloto Depósito / Logística; obra BORRADOR 27/10/2026).
// Decisiones D-01…D-16 (20/10/2026). ATS de obra: sector «obra» + x_ot_id → OF (project.project).
//   GET  /api/v1/ats/catalogo        → turnos, controles F08_DEP/F08_LOG(/F08_OBRA si habilitado), personas, empresas
//   GET  /api/v1/ats?sector=&fecha=  → ATS del día
//   POST /api/v1/ats                 → create x_hys_ats (+ x_ot_id si obra)
// HYS_ATS_OBRA=1|0 fuerza obra; vacío = auto (fields_get: valor «obra» en x_sector + campo x_ot_id).
// Con el Odoo de hoy (solo deposito|logistica, sin x_ot_id) el sector obra no sale del catálogo.
import { ErrorOdoo } from "./odoo.js";
import { ErrorEntrada } from "./inspecciones.js";
import { textoInspector } from "./catalogos.js";

export const SECTORES_PLANTA = {
  deposito: { nombre: "Depósito Central", plantilla: "F08_DEP" },
  logistica: { nombre: "Logística y Mantenimiento", plantilla: "F08_LOG" }
};
export const SECTOR_OBRA = { obra: { nombre: "Obra", plantilla: "F08_OBRA", requiere_ot: true } };
/** Todos los sectores que el código conoce (planta + obra). */
export const SECTORES = { ...SECTORES_PLANTA, ...SECTOR_OBRA };

/** HYS_ATS_OBRA: "1" fuerza; "0" apaga; vacío = auto vía fields_get de Odoo. */
export function leerFlagAtsObra(env = process.env) {
  const v = String(env.HYS_ATS_OBRA ?? "").trim().toLowerCase();
  if (["1", "true", "si", "sí", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  return null;
}
export const RESULTADOS = ["autorizado", "autorizado_correccion", "no_autorizado"];
const GRAVEDADES = ["critico", "mayor", "menor"];
const GPS_ESTADOS = ["ok", "denegado", "sin_posicion", "no_disponible"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 5 * 60 * 1000;
const OFFSET_AR_MS = 3 * 3600 * 1000; // Argentina UTC-3 fijo (sin horario de verano)
const MAX_TAREAS = 20;

const m2oId = (v) => (Array.isArray(v) ? v[0] : v || null);
const texto = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const binario = (v) => (typeof v === "string" && v.startsWith("data:") ? v.slice(v.indexOf(",") + 1) : v);
const esDia = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z"));

/** ISO con zona o "AAAA-MM-DD HH:MM:SS" (UTC) → ms; NaN si no se entiende. */
export function instante(v) {
  if (typeof v !== "string" || !v) return NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) return Date.parse(v.replace(" ", "T") + "Z");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) return NaN; // sin zona no se acepta
  return Date.parse(v);
}
export const aOdoo = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
/** Fecha de hoy en Argentina (AAAA-MM-DD). */
export const hoyAr = (ahora = Date.now()) => new Date(ahora - OFFSET_AR_MS).toISOString().slice(0, 10);
/** Día de la semana de Odoo (0 = lunes … 6 = domingo) de una fecha AAAA-MM-DD. */
export const diaOdoo = (fecha) => (new Date(fecha + "T12:00:00Z").getUTCDay() + 6) % 7;
/** Inicio del turno: fecha + hora decimal de Argentina → ms UTC. */
export const inicioTurno = (fecha, hora) => Date.parse(fecha + "T00:00:00Z") + Math.round(Number(hora) * 3600000) + OFFSET_AR_MS;
export const horaTexto = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** Huella para «idéntico al anterior»: respuestas por código, N/A, actividades y dotación. */
export function huella({ lineas, actividades, dotacion }) {
  const l = [...lineas].map((x) => `${x.x_item_codigo}:${x.x_respuesta}:${texto(x.x_justificacion_na).toLowerCase()}`).sort().join("|");
  return `${l}#${texto(actividades).toLowerCase().replace(/\s+/g, " ")}#${Number(dotacion)}`;
}

/**
 * Validación pura (sin Odoo). cuerpo = {formulario:"F08", idempotency_key, odoo:{model:"x_hys_ats", method:"create", vals}}
 * ctx = {turno, items: [plantilla del sector], personas: Set de ids | null (sin filtro), minJustif, ahora, cargador}
 * → {errores, vals}
 */
export function validarAts(cuerpo, ctx) {
  const errores = [];
  const mal = (campo, mensaje) => errores.push({ campo, mensaje });
  if (!cuerpo || typeof cuerpo !== "object") return { errores: [{ campo: "cuerpo", mensaje: "Cuerpo inválido" }], vals: null };
  if (cuerpo.formulario !== "F08") mal("formulario", "Se espera F08");
  if (cuerpo.odoo?.model !== "x_hys_ats" || cuerpo.odoo?.method !== "create") mal("odoo", "Se espera {model: 'x_hys_ats', method: 'create', vals}");
  if (!UUID.test(cuerpo.idempotency_key || "")) mal("idempotency_key", "Clave de envío inválida");
  const v = cuerpo.odoo?.vals;
  if (!v || typeof v !== "object") { mal("odoo.vals", "Faltan los valores"); return { errores, vals: null }; }
  const { turno, items, personas, empresas = null, minJustif = 10, ahora = Date.now() } = ctx;

  // 1-2 · sector, turno y fecha
  if (!SECTORES[v.x_sector]) mal("x_sector", "Sector inválido (Depósito, Logística u Obra)");
  if (!turno) mal("x_turno_id", "El turno no existe o está archivado: recargá la app");
  else if (turno.x_sector !== v.x_sector) mal("x_turno_id", "Ese turno es de otro sector");
  if (!esDia(v.x_fecha)) mal("x_fecha", "Fecha del turno inválida");
  else {
    if (v.x_fecha > hoyAr(ahora + 86400000)) mal("x_fecha", "La fecha del turno no puede ser más de un día adelante");
    const dias = String(turno?.x_dias || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (turno && dias.length && !dias.includes(diaOdoo(v.x_fecha))) mal("x_fecha", `El turno «${turno.x_name}» no trabaja ese día`);
  }
  const control = instante(v.x_fecha_hora_control);
  if (!Number.isFinite(control)) mal("x_fecha_hora_control", "Falta la fecha y hora de carga (con zona)");
  else if (control > ahora + 10 * 60000) mal("x_fecha_hora_control", "La hora del celular está adelantada: revisá la fecha y hora del teléfono");
  if (!texto(v.x_actividades)) mal("x_actividades", "Contá las actividades del turno");

  // Empresa del encabezado del PDF (opcional: vacía → la del encargado en Odoo)
  const emp = v.x_empresa_id;
  if (emp !== undefined && emp !== null && emp !== false && (!Number.isInteger(emp) || !empresas || !empresas.has(emp))) mal("x_empresa_id", "Empresa inválida: elegí Coop. El Sol o Cormet (recargá la app)");

  // OF (project.project): obligatoria solo en ATS de obra
  const otId = v.x_ot_id;
  if (v.x_sector === "obra") {
    if (!Number.isInteger(otId) || otId <= 0) mal("x_ot_id", "El ATS de obra necesita la OF (proyecto) de la sesión");
  }

  // 10 · personas
  for (const [k, n] of [["x_encargado_id", "el encargado"], ["x_autoriza_id", "quién autoriza"]]) {
    if (!Number.isInteger(v[k]) || v[k] <= 0) mal(k, `Elegí ${n}`);
    else if (personas && !personas.has(v[k])) mal(k, `${n[0].toUpperCase() + n.slice(1)} no figura entre las personas del sector: recargá la app`);
  }

  // 3-6 · controles: exactamente los de la plantilla activa del sector, por código
  const porCodigo = new Map((items || []).map((it) => [it.x_codigo, it]));
  const lista = Array.isArray(v.x_linea_ids) ? v.x_linea_ids : [];
  const vistos = new Set(); const lineas = [];
  lista.forEach((c, i) => {
    const l = Array.isArray(c) && c[0] === 0 && c[1] === 0 && c[2] && typeof c[2] === "object" ? c[2] : null;
    if (!l) return mal(`x_linea_ids[${i}]`, "Control inválido (se espera [0, 0, {...}])");
    const it = porCodigo.get(l.x_item_codigo);
    if (!it) return mal(`x_linea_ids[${i}]`, `El control «${l.x_item_codigo || "?"}» no es de este sector: recargá la app`);
    if (vistos.has(it.x_codigo)) return mal(`x_linea_ids[${i}]`, `Control repetido: ${it.x_codigo}`);
    vistos.add(it.x_codigo);
    const corto = it.x_name.length > 50 ? it.x_name.slice(0, 50) + "…" : it.x_name;
    const r = l.x_respuesta;
    if (!["si", "no", "na"].includes(r)) return mal(`x_linea_ids[${i}]`, `Falta responder «${corto}»`);
    const lv = { x_item_codigo: it.x_codigo, x_name: it.x_name, x_secuencia: it.x_secuencia, x_critico: !!it.x_critico, x_respuesta: r };
    if (r === "na") {
      if (it.x_admite_na === false) mal(`x_linea_ids[${i}]`, `«${corto}» es un control crítico (★): no admite N/A`);
      if (texto(l.x_justificacion_na).length < minJustif) mal(`x_linea_ids[${i}]`, `Justificá el N/A en «${corto}» (mínimo ${minJustif} caracteres)`);
      lv.x_justificacion_na = texto(l.x_justificacion_na);
    }
    if (r === "no") {
      if (!GRAVEDADES.includes(l.x_criticidad)) mal(`x_linea_ids[${i}]`, `Elegí la gravedad en «${corto}»`);
      if (!l.x_foto) mal(`x_linea_ids[${i}]`, `La foto es obligatoria en «${corto}»`);
      lv.x_criticidad = l.x_criticidad; lv.x_foto = binario(l.x_foto);
      if (texto(l.x_medida_correctiva)) lv.x_medida_correctiva = texto(l.x_medida_correctiva, 250);
    }
    if (texto(l.x_comentario)) lv.x_comentario = texto(l.x_comentario);
    lineas.push(lv);
  });
  const faltan = [...porCodigo.keys()].filter((k) => !vistos.has(k));
  if (items?.length && faltan.length) mal("x_linea_ids", `Faltan controles: ${faltan.join(", ")}`);

  // 6 · resultado
  const critNo = lineas.some((l) => l.x_critico && l.x_respuesta === "no");
  if (!RESULTADOS.includes(v.x_resultado)) mal("x_resultado", "Elegí el resultado");
  if (critNo && v.x_resultado === "autorizado") mal("x_resultado", "Hay un punto crítico (★) en No: el turno no puede quedar Autorizado sin corregir");
  if (v.x_resultado === "autorizado_correccion" && !texto(v.x_correccion)) mal("x_correccion", "Contá qué se corrigió y quién lo verificó");

  // 7 · tareas fuera de rutina
  if (!["si", "no"].includes(v.x_fuera_rutina)) mal("x_fuera_rutina", "Indicá si hay tareas fuera de rutina");
  const tareas = (Array.isArray(v.x_tarea_ids) ? v.x_tarea_ids : []).map((c) => (Array.isArray(c) ? c[2] : null)).filter((t) => t && texto(t.x_paso));
  if (tareas.length > MAX_TAREAS) mal("x_tarea_ids", `Máximo ${MAX_TAREAS} tareas`);
  if (v.x_fuera_rutina === "si" && !tareas.length) mal("x_tarea_ids", "Cargá al menos una tarea fuera de rutina");

  // 8 · dotación y charla
  if (!Number.isInteger(Number(v.x_dotacion)) || Number(v.x_dotacion) < 1 || Number(v.x_dotacion) > 500) mal("x_dotacion", "La dotación tiene que ser 1 o más");
  if (v.x_charla_previa !== true) mal("x_charla_previa", "Confirmá la charla previa con toda la dotación");

  // 9 · firmas
  if (!v.x_firma_encargado) mal("x_firma_encargado", "Falta la firma del encargado");
  if (!v.x_firma_autoriza && v.x_autorizacion_remota !== true) mal("x_firma_autoriza", "Falta la firma de quien autoriza (o marcá que autorizó a distancia)");

  const g = GPS_ESTADOS.includes(v.x_gps_estado) ? v.x_gps_estado : "no_disponible";
  const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : false);
  const gpsFecha = instante(v.x_gps_fecha);
  const vals = {
    x_sector: v.x_sector, x_turno_id: turno?.id, x_fecha: v.x_fecha, x_actividades: texto(v.x_actividades),
    x_encargado_id: v.x_encargado_id, x_autoriza_id: v.x_autoriza_id, x_autorizacion_remota: v.x_autorizacion_remota === true,
    x_fuera_rutina: v.x_fuera_rutina, x_dotacion: Number(v.x_dotacion), x_charla_previa: true, x_resultado: v.x_resultado,
    x_correccion: texto(v.x_correccion) || false, x_observaciones: texto(v.x_observaciones) || false,
    x_firma_encargado: binario(v.x_firma_encargado), x_firma_autoriza: v.x_firma_autoriza ? binario(v.x_firma_autoriza) : false,
    x_gps_lat: num(v.x_gps_lat), x_gps_lon: num(v.x_gps_lon), x_gps_precision_m: num(v.x_gps_precision_m),
    x_gps_fecha: Number.isFinite(gpsFecha) ? aOdoo(gpsFecha) : false, x_gps_estado: g,
    x_linea_ids: lineas.map((l) => [0, 0, l]),
    x_tarea_ids: tareas.slice(0, MAX_TAREAS).map((t, i) => [0, 0, { x_secuencia: (i + 1) * 10, x_paso: texto(t.x_paso, 250),
      x_riesgo: texto(t.x_riesgo, 250) || false, x_control: texto(t.x_control, 250) || false, x_responsable: texto(t.x_responsable, 250) || false }]),
    x_cant_no: lineas.filter((l) => l.x_respuesta === "no").length, x_critico_en_no: critNo
  };
  if (Number.isFinite(control)) vals.x_fecha_hora_control = aOdoo(control);
  if (turno && esDia(v.x_fecha)) {
    const ini = inicioTurno(v.x_fecha, turno.x_hora_inicio);
    vals.x_inicio_turno = aOdoo(ini);
    if (Number.isFinite(control)) vals.x_antes_de_turno = control <= ini;
  }
  if (Number.isInteger(emp) && empresas?.has(emp)) vals.x_empresa_id = emp;
  if (v.x_sector === "obra" && Number.isInteger(otId) && otId > 0) vals.x_ot_id = otId;
  if (turno?.x_codigo_ats) vals.x_codigo_ats = turno.x_codigo_ats;
  if (Number.isInteger(v.x_ats_anterior_id) && v.x_ats_anterior_id > 0) vals.x_ats_anterior_id = v.x_ats_anterior_id;
  return { errores, vals };
}

/** ¿Puede este usuario de carga mandar un ATS de este sector? */
export function puedeCargar(insp, sector) {
  if (!insp) return false;
  if (insp.x_rol === "encargado") return insp.x_sector === sector;
  return true; // inspector HyS (x_rol vacío = inspector, registros anteriores)
}

export function crearAts(cliente, { catalogos, departamentos = leerDepartamentos(), ahora = () => Date.now(), accionPdf = leerAccionPdf(), empresasIds = leerEmpresas(), flagObra = leerFlagAtsObra() } = {}) {
  let cat = null, catHasta = 0, catEnCurso = null;
  let obraOkCache = null; // null = aún no consultado
  const porClave = new Map(), enCurso = new Map();
  let cola = Promise.resolve();
  const enSerie = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };
  const ej = (...a) => cliente().ejecutar(...a);

  /** ¿Odoo ya tiene sector obra + x_ot_id? (o HYS_ATS_OBRA fuerza). */
  async function obraHabilitada() {
    if (flagObra === true) return true;
    if (flagObra === false) return false;
    if (obraOkCache !== null) return obraOkCache;
    try {
      const fg = await ej("x_hys_ats", "fields_get", [["x_sector", "x_ot_id"]], { attributes: ["selection", "type"] });
      const sel = (fg?.x_sector?.selection || []).map((p) => p[0]);
      obraOkCache = sel.includes("obra") && !!fg?.x_ot_id;
    } catch (e) {
      console.log("ats: no se pudo detectar soporte de obra", e instanceof ErrorOdoo ? e.message : e?.name);
      obraOkCache = false;
    }
    return obraOkCache;
  }

  async function leerCatalogoOdoo() {
    const [turnos, items, cfg] = await Promise.all([
      ej("x_hys_turno", "search_read", [[["x_active", "=", true]]], { fields: ["id", "x_name", "x_codigo", "x_sector", "x_hora_inicio", "x_dias", "x_encargado_id", "x_autoriza_id", "x_codigo_ats", "x_secuencia"], order: "x_sector, x_secuencia, id" }),
      ej("x_hys_item_plantilla", "search_read", [[["x_formulario", "in", ["F08_DEP", "F08_LOG", "F08_OBRA"]], ["x_active", "=", true]]], { fields: ["id", "x_codigo", "x_name", "x_formulario", "x_bloque", "x_critico", "x_secuencia", "x_admite_na", "x_version"], order: "x_formulario, x_secuencia, id" }),
      ej("x_hys_config", "search_read", [[]], { fields: ["x_ats_min_justif", "x_ats_horas_tardia"], limit: 1 })]);
    // Empresas: si la cuenta no puede leer alguna, se ofrece igual con su id (Odoo valida al guardar).
    const comp = empresasIds.length ? await ej("res.company", "search_read", [[["id", "in", empresasIds]]], { fields: ["id", "name"] })
      .catch((e) => { console.log("ats: no se pudieron leer las empresas", e instanceof ErrorOdoo ? e.message : e?.name); return []; }) : [];
    const empresas = empresasIds.map((id) => ({ id, nombre: comp.find((c) => c.id === id)?.name || `Empresa ${id}` }));
    const personas = {};
    for (const s of Object.keys(SECTORES)) {
      const deps = departamentos?.[s];
      const extra = turnos.filter((t) => t.x_sector === s).flatMap((t) => [m2oId(t.x_encargado_id), m2oId(t.x_autoriza_id)]).filter(Boolean);
      const filtro = Array.isArray(deps) && deps.length;
      const dom = !filtro ? [["active", "=", true]]
        : extra.length ? ["|", ["id", "in", extra], "&", ["active", "=", true], ["department_id", "child_of", deps]]
          : [["active", "=", true], ["department_id", "child_of", deps]];
      const regs = await ej("hr.employee", "search_read", [dom], { fields: ["id", "name", "job_title", "company_id"], order: "name" });
      personas[s] = regs.map((e) => ({ id: e.id, nombre: e.name, puesto: e.job_title || null, empresa_id: m2oId(e.company_id) }));
      // Encargado / autoriza por defecto del turno que la cuenta de servicio no puede leer en hr.employee
      // (reglas de acceso de RR. HH.): se agregan con el nombre que trae el turno, para poder elegirlos.
      for (const t of turnos.filter((x) => x.x_sector === s)) {
        for (const [m2o, puesto] of [[t.x_encargado_id, "Encargado del turno"], [t.x_autoriza_id, "Autoriza el turno"]]) {
          const id = m2oId(m2o);
          if (id && !personas[s].some((p) => p.id === id)) personas[s].push({ id, nombre: Array.isArray(m2o) ? String(m2o[1] || id) : String(id), puesto, empresa_id: null });
        }
      }
    }
    return { turnos, items, personas, empresas, minJustif: cfg[0]?.x_ats_min_justif || 10, horasTardia: cfg[0]?.x_ats_horas_tardia || 24, filtrado: !!departamentos };
  }
  async function catalogoInterno() {
    if (cat && ahora() < catHasta) return cat;
    catEnCurso ??= leerCatalogoOdoo().then((c) => { cat = c; catHasta = ahora() + CACHE_MS; return c; }).finally(() => { catEnCurso = null; });
    return catEnCurso;
  }

  /** Formato para el celular. Solo incluye «obra» si Odoo/flag lo habilita. */
  async function catalogo() {
    const c = await catalogoInterno();
    const obraOk = await obraHabilitada();
    const sectoresActivos = Object.entries(SECTORES).filter(([codigo]) => codigo !== "obra" || obraOk);
    const it = (f) => c.items.filter((x) => x.x_formulario === f).map((x) => ({ codigo: x.x_codigo, nombre: x.x_name, bloque: x.x_bloque, critico: !!x.x_critico,
      admite_na: x.x_admite_na !== false, secuencia: x.x_secuencia, version: x.x_version || null }));
    const controles = { F08_DEP: it("F08_DEP"), F08_LOG: it("F08_LOG") };
    if (obraOk) controles.F08_OBRA = it("F08_OBRA");
    return {
      sectores: sectoresActivos.map(([codigo, s]) => ({ codigo, nombre: s.nombre, plantilla: s.plantilla })),
      ats_obra_habilitado: obraOk,
      turnos: c.turnos.filter((t) => t.x_sector !== "obra" || obraOk).map((t) => ({ id: t.id, codigo: t.x_codigo, nombre: t.x_name, sector: t.x_sector, inicio: horaTexto(t.x_hora_inicio),
        dias: String(t.x_dias || "").split(",").map((d) => Number(d.trim())).filter((d) => d >= 0 && d <= 6),
        encargado_id: m2oId(t.x_encargado_id), autoriza_id: m2oId(t.x_autoriza_id), codigo_ats: t.x_codigo_ats || null })),
      controles,
      personas: c.personas, min_justificacion_na: c.minJustif,
      empresas: c.empresas.map((e) => ({ id: e.id, nombre: e.nombre, corto: nombreCorto(e.nombre) }))
    };
  }

  async function delDia(sector, fecha) {
    if (!SECTORES[sector] || !esDia(fecha)) throw new ErrorEntrada(400, "?sector=deposito|logistica|obra&fecha=AAAA-MM-DD");
    const r = await ej("x_hys_ats", "search_read", [[["x_sector", "=", sector], ["x_fecha", "=", fecha], ["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_turno_id", "x_resultado"], order: "id" });
    return r.map((a) => ({ id: a.id, name: a.x_name || null, turno_id: m2oId(a.x_turno_id), resultado: a.x_resultado }));
  }

  async function leerInspector(id) {
    return (await ej("x_hys_inspector", "search_read", [[["id", "=", id], ["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa", "x_rol", "x_sector"], limit: 1 }))[0] || null;
  }
  const leer = async (id) => (await ej("x_hys_ats", "search_read", [[["id", "=", id]]],
    { fields: ["id", "x_name", "x_resultado", "x_antes_de_turno", "x_identico_anterior", "x_carga_tardia"], limit: 1, context: { active_test: false } }))[0] || { id };
  const respuesta = (r, extra = {}) => ({ odoo_model: "x_hys_ats", odoo_id: r.id, id: r.id, name: r.x_name || null, resultado: r.x_resultado || null,
    antes_de_turno: !!r.x_antes_de_turno, identico_anterior: !!r.x_identico_anterior, carga_tardia: !!r.x_carga_tardia, ...extra });

  async function recibir(cuerpo, { sesion = null } = {}) {
    const idCargador = sesion?.inspector_id;
    if (!Number.isInteger(idCargador)) throw new ErrorEntrada(401, "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.");
    const clave = cuerpo?.idempotency_key;
    if (UUID.test(clave || "") && porClave.has(clave)) return { estado: 200, cuerpo: respuesta(await leer(porClave.get(clave)), { repetido: true }) };
    if (UUID.test(clave || "") && enCurso.has(clave)) return enCurso.get(clave);
    const p = (async () => {
      const c = await catalogoInterno();
      const v = cuerpo?.odoo?.vals || {};
      if (v.x_sector === "obra" && !(await obraHabilitada())) {
        throw new ErrorEntrada(503, "El ATS de obra todavía no está habilitado en Odoo (falta el sector «obra» y el campo x_ot_id). Avisá a HyS.",
          { codigo: "ats_obra_no_habilitado" });
      }
      const turno = c.turnos.find((t) => t.id === v.x_turno_id) || null;
      const items = c.items.filter((x) => x.x_formulario === SECTORES[v.x_sector]?.plantilla);
      const personas = c.filtrado ? new Set((c.personas[v.x_sector] || []).map((x) => x.id)) : null;
      const { errores, vals } = validarAts(cuerpo, { turno, items, personas, empresas: new Set(c.empresas.map((e) => e.id)), minJustif: c.minJustif, ahora: ahora() });
      if (errores.length) throw new ErrorEntrada(422, errores.map((e) => e.mensaje).join(" · "), { errores });
      const cargador = await leerInspector(idCargador);
      if (!cargador) throw new ErrorEntrada(422, "Quien carga ya no figura como activo en Odoo (HyS > Inspectores). Avisá a HyS.");
      if (!puedeCargar(cargador, vals.x_sector)) throw new ErrorEntrada(403, `Tu usuario es encargado de otro sector: no podés cargar el ATS de ${SECTORES[vals.x_sector].nombre}.`);

      return enSerie(async () => {
        const ya = (await ej("x_hys_ats", "search_read", [[["x_idempotency_key", "=", clave]]], { fields: ["id"], limit: 1, context: { active_test: false } }))[0];
        if (ya) { porClave.set(clave, ya.id); return { estado: 200, cuerpo: respuesta(await leer(ya.id), { repetido: true }) }; }
        // D-09 · uno válido por sector, fecha y turno; tras «No autorizado» se permite uno nuevo que lo reemplaza.
        const delTurno = await ej("x_hys_ats", "search_read", [[["x_sector", "=", vals.x_sector], ["x_fecha", "=", vals.x_fecha], ["x_turno_id", "=", vals.x_turno_id], ["x_active", "=", true]]],
          { fields: ["id", "x_name", "x_resultado"], order: "id desc" });
        const valido = delTurno.find((a) => a.x_resultado !== "no_autorizado");
        if (valido) throw new ErrorEntrada(409, `Ya hay un ATS para este turno (${valido.x_name || `id ${valido.id}`}). Si hay que corregirlo, avisá a HyS.`,
          { codigo: "ats_existente", ats: { id: valido.id, name: valido.x_name || null, resultado: valido.x_resultado } });
        if (delTurno.length) vals.x_ats_anterior_id = delTurno[0].id;
        else delete vals.x_ats_anterior_id;
        // D-12 · idéntico al último ATS del sector
        const ant = (await ej("x_hys_ats", "search_read", [[["x_sector", "=", vals.x_sector], ["x_active", "=", true]]],
          { fields: ["id", "x_actividades", "x_dotacion", "x_linea_ids"], order: "x_fecha desc, id desc", limit: 1 }))[0];
        if (ant?.x_linea_ids?.length) {
          const la = await ej("x_hys_ats_linea", "search_read", [[["x_ats_id", "=", ant.id]]], { fields: ["x_item_codigo", "x_respuesta", "x_justificacion_na"] });
          vals.x_identico_anterior = huella({ lineas: la, actividades: ant.x_actividades, dotacion: ant.x_dotacion }) ===
            huella({ lineas: vals.x_linea_ids.map((x) => x[2]), actividades: vals.x_actividades, dotacion: vals.x_dotacion });
        } else vals.x_identico_anterior = false;
        const recibido = ahora();
        vals.x_fecha_recepcion = aOdoo(recibido);
        vals.x_carga_tardia = recibido - instante(vals.x_fecha_hora_control) > c.horasTardia * 3600000;
        const txt = [textoInspector(cargador), cargador.x_rol === "encargado" ? `Encargado ${SECTORES[cargador.x_sector]?.nombre || ""}`.trim() : "Inspector HyS", "hys-carga"].join(" · ").slice(0, 250);
        Object.assign(vals, { x_idempotency_key: clave, x_origen: "formulario", x_active: true, x_cargado_por: txt, x_inspector_hys_id: cargador.id });
        const r = await ej("x_hys_ats", "create", [[vals]]);
        const id = Array.isArray(r) ? r[0] : r;
        porClave.set(clave, id);
        await ej("x_hys_ats", "message_post", [[id]], { body: `Cargado desde la app hys-carga por ${txt}.` })
          .catch((e) => console.log("ats: no se pudo dejar la nota", e instanceof ErrorOdoo ? e.message : e?.name));
        return { estado: 201, cuerpo: respuesta(await leer(id)) };
      });
    })().finally(() => enCurso.delete(clave));
    if (UUID.test(clave || "")) enCurso.set(clave, p);
    return p;
  }

  /** PDF imprimible del ATS (reporte QWeb de Odoo). Mismo permiso que cargar: encargado solo su sector, inspector HyS cualquiera.
   *  Odoo no abre sesión web con API key, así que /report/pdf no sirve: se ejecuta por RPC la acción de servidor
   *  «HyS · PDF del ATS (backend)» (ODOO_ATS_PDF_ACCION_ID), que devuelve el PDF en base64. */
  async function pdf(id, { sesion = null } = {}) {
    const idCargador = sesion?.inspector_id;
    if (!Number.isInteger(idCargador)) throw new ErrorEntrada(401, "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.");
    if (!Number.isInteger(id) || id <= 0) throw new ErrorEntrada(400, "Número de ATS inválido");
    if (!accionPdf) throw new ErrorEntrada(503, "La descarga del PDF todavía no está habilitada. Avisá a HyS.");
    const a = (await ej("x_hys_ats", "search_read", [[["id", "=", id]]], { fields: ["id", "x_name", "x_sector"], limit: 1, context: { active_test: false } }))[0];
    if (!a) throw new ErrorEntrada(404, "No se encontró ese ATS");
    const cargador = await leerInspector(idCargador);
    if (!cargador) throw new ErrorEntrada(403, "Tu usuario ya no figura como activo en Odoo (HyS > Inspectores). Avisá a HyS.");
    if (!puedeCargar(cargador, a.x_sector)) throw new ErrorEntrada(403, "Tu usuario es encargado de otro sector: no podés ver el PDF de este ATS.");
    const r = await ej("ir.actions.server", "run", [[accionPdf]], { context: { active_model: "x_hys_ats", active_id: id, active_ids: [id] } });
    const buf = typeof r?.hys_pdf_b64 === "string" ? Buffer.from(r.hys_pdf_b64, "base64") : null;
    if (!buf || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorOdoo("Odoo no devolvió un PDF");
    const nombre = `${String(a.x_name || `ATS-${id}`).replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
    return { pdf: buf, nombre };
  }

  return { catalogo, delDia, recibir, pdf, obraHabilitada, olvidar: () => { cat = null; obraOkCache = null; } };
}

/** ODOO_ATS_PDF_ACCION_ID = id de la acción de servidor «HyS · PDF del ATS (backend)» en Odoo. Sin ella, el PDF responde 503. */
export function leerAccionPdf(env = process.env) {
  const n = Number(env.ODOO_ATS_PDF_ACCION_ID);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ODOO_ATS_EMPRESAS_IDS = ids de res.company elegibles en el ATS (x_empresa_id), separados por coma. Por defecto 1,3. */
export function leerEmpresas(env = process.env) {
  const ids = String(env.ODOO_ATS_EMPRESAS_IDS ?? "1,3").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}
/** Nombre corto para el botón del celular. */
export function nombreCorto(nombre) {
  const n = String(nombre || "");
  if (/el\s+sol/i.test(n)) return "Coop. El Sol";
  if (/cormet/i.test(n)) return "Cormet";
  return n.length > 22 ? n.slice(0, 21) + "…" : n;
}

/** ATS_DEPARTAMENTOS = JSON {"deposito":[ids de hr.department],"logistica":[…]} para acotar las personas de cada sector. */
export function leerDepartamentos(env = process.env) {
  if (!env.ATS_DEPARTAMENTOS) return null;
  try { const j = JSON.parse(env.ATS_DEPARTAMENTOS); return j && typeof j === "object" ? j : null; }
  catch (e) { console.warn("ATS_DEPARTAMENTOS no es un JSON válido; se ignora"); return null; }
}
