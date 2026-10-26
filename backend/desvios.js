// Desvíos (x_hys_desvio): uno por cada «No» de F02/F03/F04 (x_hys_inspeccion_linea) y F08 (x_hys_ats_linea),
// y su cierre F07. Plazos del diseño §3.3 / §2.10: crítico +24 h · mayor +5 días hábiles (lun–vie, sin feriados,
// como la simulación) · menor +15 días corridos. Configurables con DESVIO_PLAZOS (JSON) por si HyS los cambia.
import { ErrorEntrada } from "./inspecciones.js";
import { textoInspector } from "./catalogos.js";
import { esRolHys } from "./vencimientos.js";
import { ErrorOdoo } from "./odoo.js";

export const PLAZOS_DEF = { critico: { horas: 24 }, mayor: { dias_habiles: 5 }, menor: { dias: 15 } };
export function leerPlazos(env = process.env) {
  try { return { ...PLAZOS_DEF, ...(env.DESVIO_PLAZOS ? JSON.parse(env.DESVIO_PLAZOS) : {}) }; } catch { return PLAZOS_DEF; }
}
export const ACCION_INMEDIATA = { critico: "Se detiene la tarea", mayor: "Se corrige o se restringe", menor: "Se registra y se programa" };
export const SOLO_HYS_DESVIOS = "Los desvíos los cierra HyS.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const aOdoo = (d) => new Date(d).toISOString().slice(0, 19).replace("T", " ");
export const deOdoo = (s) => new Date(String(s).replace(" ", "T") + "Z");
const ART = 3 * 3600e3;

/** Vencimiento (Date) según gravedad y fecha de detección (Date). Días hábiles: sábado y domingo de Argentina no cuentan. */
export function calcularVencimiento(criticidad, deteccion, plazos = PLAZOS_DEF) {
  const p = plazos[criticidad] || plazos.menor;
  let t = new Date(deteccion).getTime();
  if (p.horas) return new Date(t + p.horas * 3600e3);
  if (p.dias) return new Date(t + p.dias * 864e5);
  let n = p.dias_habiles || 0;
  while (n > 0) { t += 864e5; const wd = new Date(t - ART).getUTCDay(); if (wd !== 0 && wd !== 6) n--; }
  return new Date(t);
}

/** Estados que todavía se pueden cerrar con F07. */
export const PENDIENTES = ["abierto", "en_curso", "vencido"];
const AMBITO_ATS = { deposito: "deposito", logistica: "logistica" };
/** Vals de un desvío a partir de la ficha (inspección o ATS) y una línea con «No». Puro (testeable). */
export function armarDesvio({ tipo, ficha, linea, plazos = PLAZOS_DEF }) {
  const ats = tipo === "ats";
  const det = ficha.x_fecha_hora_control ? deOdoo(ficha.x_fecha_hora_control) : new Date();
  const crit = ["critico", "mayor", "menor"].includes(linea.x_criticidad) ? linea.x_criticidad : "menor";
  const desc = [linea.x_item_codigo && `[${linea.x_item_codigo}]`, linea.x_name || "Ítem en «No»"].filter(Boolean).join(" ") +
    (linea.x_comentario ? ` — ${linea.x_comentario}` : "");
  const v = {
    x_name: "/", x_estado: "abierto", x_criticidad: crit, x_descripcion: desc.slice(0, 250),
    x_accion_inmediata: ACCION_INMEDIATA[crit], x_fecha_deteccion: aOdoo(det),
    x_fecha_vencimiento: aOdoo(calcularVencimiento(crit, det, plazos)), x_vencido: false,
    x_idempotency_key: `${ats ? "ats" : "ins"}-linea-${linea.id}`
  };
  if (linea.x_foto) v.x_foto_deteccion = linea.x_foto;
  if (linea.x_item_codigo) v.x_item_codigo = String(linea.x_item_codigo).slice(0, 64);
  if (ats) Object.assign(v, { x_origen_formulario: "F08", x_ats_id: ficha.id, x_ats_linea_id: linea.id, x_ambito: AMBITO_ATS[ficha.x_sector] || "deposito" });
  else {
    Object.assign(v, { x_origen_formulario: ficha.x_formulario || "F02", x_inspeccion_id: ficha.id, x_linea_id: linea.id, x_ambito: ficha.x_ambito || "obra" });
    if (ficha.x_ot_id) v.x_ot_id = Array.isArray(ficha.x_ot_id) ? ficha.x_ot_id[0] : ficha.x_ot_id;
    if (linea.x_sector) v.x_sector = linea.x_sector;
  }
  const resp = linea.x_responsable_id;
  if (resp) v.x_responsable_id = Array.isArray(resp) ? resp[0] : resp;
  return v;
}

/** ¿Es un envío de prueba? (prefijo local «PRUEBA - borrar»). Nunca genera desvíos, salvo DESVIOS_EN_PRUEBA=1 (pruebas del propio generador). */
export const esPrueba = (nombre, env = process.env) => env.DESVIOS_EN_PRUEBA !== "1" && /PRUEBA|EJEMPLO/i.test(nombre || "");

export function crearDesvios(cliente, { ahora = () => new Date(), plazos = leerPlazos() } = {}) {
  const ej = (...a) => cliente().ejecutar(...a);
  /** Crea los desvíos que falten para los «No» de una inspección (tipo "inspeccion") o un ATS (tipo "ats"). Idempotente por línea. */
  async function generar(tipo, id) {
    const ats = tipo === "ats";
    const mo = ats ? "x_hys_ats" : "x_hys_inspeccion", ml = ats ? "x_hys_ats_linea" : "x_hys_inspeccion_linea";
    const ficha = (await ej(mo, "read", [[id]], { fields: ["id", "x_name", "x_fecha_hora_control", ...(ats ? ["x_sector"] : ["x_formulario", "x_ambito", "x_ot_id"])] }))[0];
    if (!ficha || esPrueba(ficha.x_name)) return { creados: [], omitido: ficha ? "prueba" : "no_existe" };
    const campos = ["id", "x_name", "x_item_codigo", "x_criticidad", "x_foto", "x_comentario", ...(ats ? [] : ["x_sector", "x_responsable_id"])];
    const lineas = await ej(ml, "search_read", [[[ats ? "x_ats_id" : "x_inspeccion_id", "=", id], ["x_respuesta", "=", "no"]]], { fields: campos });
    if (!lineas.length) return { creados: [] };
    const claves = lineas.map((l) => `${ats ? "ats" : "ins"}-linea-${l.id}`);
    const ya = new Set((await ej("x_hys_desvio", "search_read", [[["x_idempotency_key", "in", claves]]], { fields: ["x_idempotency_key"] })).map((d) => d.x_idempotency_key));
    const creados = [];
    for (const l of lineas) {
      const v = armarDesvio({ tipo, ficha, linea: l, plazos });
      if (ya.has(v.x_idempotency_key)) continue;
      const r = await ej("x_hys_desvio", "create", [[v]]);
      creados.push(Array.isArray(r) ? r[0] : r);
    }
    return { creados };
  }
  /** Igual que generar, pero nunca rompe el envío de la ficha (se reintenta en el próximo reenvío). */
  const generarSeguro = (tipo, id) => generar(tipo, id).catch((e) => { console.log(`desvios: no se pudieron generar (${tipo} ${id})`, e instanceof ErrorOdoo ? e.message : e?.name); return { creados: [], error: true }; });

  async function autorizar(sesion) {
    if (!Number.isInteger(sesion?.inspector_id)) throw new ErrorEntrada(401, "Tu sesión venció: volvé a ingresar.");
    const u = (await ej("x_hys_inspector", "search_read", [[["id", "=", sesion.inspector_id], ["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa", "x_rol"], limit: 1 }))[0];
    if (!u || !esRolHys(u.x_rol)) throw new ErrorEntrada(403, SOLO_HYS_DESVIOS);
    return u;
  }
  const n2 = (x) => (Array.isArray(x) ? { id: x[0], nombre: x[1] } : null);
  async function listar() {
    const r = await ej("x_hys_desvio", "search_read", [[["x_estado", "in", PENDIENTES]]], { fields: ["id", "x_name", "x_estado", "x_descripcion", "x_criticidad",
      "x_origen_formulario", "x_ambito", "x_ot_id", "x_sector", "x_fecha_deteccion", "x_fecha_vencimiento", "x_responsable_id", "x_accion_inmediata"], order: "x_fecha_vencimiento, id" });
    const t = ahora().getTime();
    return { desvios: r.map((d) => ({ id: d.id, nombre: d.x_name, descripcion: d.x_descripcion || "", gravedad: d.x_criticidad, estado: d.x_estado, origen: d.x_origen_formulario,
      ambito: d.x_ambito, ot: n2(d.x_ot_id), sector: d.x_sector || null, detectado: d.x_fecha_deteccion || null, vence: d.x_fecha_vencimiento || null,
      vencido: d.x_estado === "vencido" || !!d.x_fecha_vencimiento && deOdoo(d.x_fecha_vencimiento).getTime() < t, responsable: n2(d.x_responsable_id), accion_inmediata: d.x_accion_inmediata || "" })) };
  }
  /** F07: cierre (write). Idempotente por x_cierre_idempotency_key. */
  async function cerrar(id, cuerpo, { sesion } = {}) {
    const u = await autorizar(sesion);
    const clave = cuerpo?.idempotency_key;
    if (!UUID.test(clave || "")) throw new ErrorEntrada(422, "Clave de envío inválida");
    const d = (await ej("x_hys_desvio", "search_read", [[["id", "=", id]]], { fields: ["id", "x_name", "x_estado", "x_fecha_vencimiento", "x_cierre_idempotency_key"], limit: 1 }))[0];
    if (!d) throw new ErrorEntrada(404, "Ese desvío no existe en Odoo");
    const resp = (extra = {}) => ({ odoo_model: "x_hys_desvio", odoo_id: d.id, id: d.id, name: d.x_name, ...extra });
    if (d.x_estado === "cerrado" && d.x_cierre_idempotency_key === clave) return { estado: 200, cuerpo: resp({ repetido: true }) };
    if (!PENDIENTES.includes(d.x_estado)) throw new ErrorEntrada(409, `El desvío ${d.x_name} ya no está pendiente (${d.x_estado}).`);
    const que = String(cuerpo?.que_se_hizo || "").trim();
    let foto = cuerpo?.foto_cierre;
    if (typeof foto === "string" && foto.startsWith("data:")) foto = foto.slice(foto.indexOf(",") + 1);
    const err = [];
    if (!que) err.push("que_se_hizo");
    if (!foto) err.push("foto_cierre");
    if (err.length) throw new ErrorEntrada(422, err.includes("foto_cierre") ? "Sin foto del arreglo, el desvío no está cerrado." : "Contá qué se hizo.", { errores: err });
    let firma = cuerpo?.firma_cierre;
    if (typeof firma === "string" && firma.startsWith("data:")) firma = firma.slice(firma.indexOf(",") + 1);
    const ctl = cuerpo?.control || {};
    let cierre = ctl.fecha_hora_control ? new Date(ctl.fecha_hora_control) : ahora();
    if (isNaN(cierre) || cierre > ahora()) cierre = ahora();
    const txt = [textoInspector(u), "Inspector HyS", "hys-carga"].join(" · ").slice(0, 250);
    const enPlazo = !d.x_fecha_vencimiento || cierre <= deOdoo(d.x_fecha_vencimiento);
    await ej("x_hys_desvio", "write", [[d.id], { x_estado: "cerrado", x_que_se_hizo: que.slice(0, 4000), x_foto_cierre: foto, x_fecha_cierre: aOdoo(cierre),
      x_cerrado_por: txt, x_cerrado_en_plazo: enPlazo, x_vencido: false, x_cierre_idempotency_key: clave, ...(firma ? { x_firma_cierre: firma } : {}) }]);
    return { estado: 200, cuerpo: resp({ cerrado_en_plazo: enPlazo }) };
  }
  return { generar, generarSeguro, listar, cerrar, autorizar };
}
