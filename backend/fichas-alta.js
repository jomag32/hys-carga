// POST /api/v1/fichas → create de x_hys_ficha (F01 · Ficha de Riesgos de Obra) + x_hys_ficha_hito en Odoo con MIA.
// Decisiones de Jorge (18/10/2026 22:12):
//   · Siempre en estado BORRADOR: la app nunca aprueba (la aprobación queda en Odoo para HyS, grupos 216/218).
//   · Una sola Ficha activa por OT: si la OT ya tiene una → 409 con el número de la existente.
//   · Obras NO INICIADAS, EN PROGRESO o PAUSADO (la Ficha se carga al crear la OT, antes de empezar).
//   · Solo se escriben campos que existen de verdad en Odoo (fields_get en vivo); lo demás se descarta.
//   · Clase de riesgo y número FR (secuencia de Odoo) los ponen las automatizaciones de Odoo; se devuelven leídos.
// x_hys_ficha no tiene campo de clave de envío: la idempotencia es (1) memoria del proceso clave → id y
// (2) si la OT ya tiene una Ficha creada por esta misma cuenta de servicio en las últimas 48 h con la
// MISMA OT, distancia y riesgos, se toma como el mismo envío repetido (200) en vez de 409.
import { ErrorOdoo } from "./odoo.js";
import { ErrorEntrada } from "./inspecciones.js";
import { textoInspector } from "./catalogos.js";

const CAMPOS_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPETIDO_MS = 48 * 3600 * 1000;
// Etapas de proyecto permitidas para cargar Ficha (comparación sin mayúsculas ni acentos, por comienzo).
export const ETAPAS_FICHA = ["NO INICIAD", "EN PROGRESO", "PAUSAD"];

// Campos que el celular NO fija aunque existan (los pone Odoo, HyS o el servidor).
export const PROTEGIDOS_FICHA = new Set(["id", "x_name", "x_estado", "x_fecha_aprobacion", "x_aprobo_id", "x_firma",
  "x_clase_riesgo", "x_clase_motivo", "x_clase_calculada_el", "x_frecuencia_dias", "x_modalidad", "x_faltan_hitos",
  "x_aviso_ugeop", "x_aviso", "x_hitos_criticos", "x_active", "x_activa", "x_inspeccion_ids", "x_cliente_id",
  "x_director_obra_id", "x_ot_fecha_creacion", "x_hito_ids", "x_cargado_por"]);
export const PROTEGIDOS_HITO = new Set(["id", "x_ficha_id", "x_ot_id", "x_inicio_real", "x_alcanzado", "x_fecha_fin", "x_situacion", "x_riesgo_hys"]);

export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export const etapaPermitida = (nombre) => ETAPAS_FICHA.some((e) => normalizar(nombre).startsWith(e));
const m2oId = (v) => (Array.isArray(v) ? v[0] : v || null);
const sel = (campo) => (campo?.selection || []).map(([v]) => v);
const idsDe = (cmd) => (Array.isArray(cmd) && Array.isArray(cmd[0]) && cmd[0][0] === 6 ? cmd[0][2] : Array.isArray(cmd) && cmd.every(Number.isInteger) ? cmd : null);
const esFechaDia = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Valor del celular → formato del campo de Odoo (fecha/fecha-hora, binario sin «data:»). */
function adaptar(campo, v) {
  if (campo.type === "binary" && typeof v === "string" && v.startsWith("data:")) return v.slice(v.indexOf(",") + 1);
  if (campo.type === "datetime" && esFechaDia(v)) return `${v} 11:00:00`; // 08:00 de Argentina
  if (campo.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2} /.test(v)) return v.slice(0, 10);
  return v;
}

/**
 * Reglas + filtro por campos reales. cuerpo = {formulario:"F01", idempotency_key, odoo:{model:"x_hys_ficha", method:"create", vals}}
 * campos = {ficha: fields_get, hito: fields_get}; riesgosActivos = Set de ids.
 * → {errores, vals, hitos: [vals de hito], descartados}
 */
export function validarFicha(cuerpo, campos, riesgosActivos) {
  const errores = [], descartados = new Set();
  const mal = (campo, mensaje) => errores.push({ campo, mensaje });
  if (!cuerpo || typeof cuerpo !== "object") return { errores: [{ campo: "cuerpo", mensaje: "Cuerpo inválido" }], vals: null, hitos: [], descartados: [] };
  if (cuerpo.formulario !== "F01") mal("formulario", "Se espera F01");
  if (cuerpo.odoo?.model !== "x_hys_ficha" || cuerpo.odoo?.method !== "create") mal("odoo", "Se espera {model: 'x_hys_ficha', method: 'create', vals}");
  if (!UUID.test(cuerpo.idempotency_key || "")) mal("idempotency_key", "Clave de envío inválida");
  const v = cuerpo.odoo?.vals;
  if (!v || typeof v !== "object") { mal("odoo.vals", "Faltan los valores"); return { errores, vals: null, hitos: [], descartados: [] }; }
  const cf = campos.ficha, ch = campos.hito;

  if (!Number.isInteger(v.x_ot_id) || v.x_ot_id <= 0) mal("x_ot_id", "Falta la obra (OT)");
  const dist = Number(v.x_distancia_km);
  if (v.x_distancia_km === undefined || v.x_distancia_km === null || v.x_distancia_km === "" || !Number.isFinite(dist) || dist < 0) mal("x_distancia_km", "Distancia inválida");
  if (cf.x_tipo_predio && !sel(cf.x_tipo_predio).includes(v.x_tipo_predio)) mal("x_tipo_predio", "Tipo de predio inválido");
  if (!String(v.x_centro_salud ?? "").trim()) mal("x_centro_salud", "Falta el centro de salud");
  const riesgos = idsDe(v.x_riesgo_ids);
  if (!riesgos || !riesgos.length) mal("x_riesgo_ids", "Marcá al menos un riesgo");
  else if (riesgos.some((id) => !riesgosActivos.has(id))) mal("x_riesgo_ids", "Hay riesgos que no existen o están archivados en Odoo: recargá la app y volvé a marcarlos");

  const vals = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "x_hito_ids") continue;
    if (!cf[k] || cf[k].readonly || PROTEGIDOS_FICHA.has(k)) { descartados.add(k); continue; }
    if (x === undefined) continue;
    if (cf[k].type === "selection" && x !== false && !sel(cf[k]).includes(x)) { descartados.add(k); continue; } // valor que Odoo no acepta
    vals[k] = adaptar(cf[k], x);
  }
  if (vals.x_distancia_km !== undefined) vals.x_distancia_km = dist;
  if (riesgos && vals.x_riesgo_ids !== undefined) vals.x_riesgo_ids = [[6, 0, riesgos]];
  if (typeof vals.x_centro_salud === "string") vals.x_centro_salud = vals.x_centro_salud.trim();

  const hitos = [];
  const lista = Array.isArray(v.x_hito_ids) ? v.x_hito_ids : [];
  if (lista.length > 40) mal("x_hito_ids", "Demasiados hitos (máximo 40)");
  lista.slice(0, 40).forEach((c, i) => {
    const l = Array.isArray(c) && c[0] === 0 && c[1] === 0 && c[2] && typeof c[2] === "object" ? c[2] : null;
    if (!l) return mal(`x_hito_ids[${i}]`, "Hito inválido (se espera [0, 0, {...}])");
    if (!String(l.x_name ?? "").trim()) return mal(`x_hito_ids[${i}].x_name`, `Al hito ${i + 1} le falta el nombre`);
    if (l.x_inicio_previsto && !esFechaDia(String(l.x_inicio_previsto).slice(0, 10))) mal(`x_hito_ids[${i}].x_inicio_previsto`, `Fecha inválida en el hito ${i + 1}`);
    const rh = l.x_riesgo_ids === undefined ? [] : idsDe(l.x_riesgo_ids);
    if (rh === null || rh.some((id) => !riesgosActivos.has(id))) mal(`x_hito_ids[${i}].x_riesgo_ids`, `Riesgos inválidos en el hito ${i + 1}`);
    const hv = {};
    for (const [k, x] of Object.entries(l)) {
      if (!ch[k] || ch[k].readonly || PROTEGIDOS_HITO.has(k)) { descartados.add(`x_hito_ids[].${k}`); continue; }
      if (x === undefined || x === null || x === "") continue;
      if (ch[k].type === "selection" && !sel(ch[k]).includes(x)) { descartados.add(`x_hito_ids[].${k}`); continue; }
      hv[k] = adaptar(ch[k], x);
    }
    hv.x_name = String(l.x_name).trim().slice(0, 200);
    if (hv.x_riesgo_ids !== undefined) hv.x_riesgo_ids = [[6, 0, rh || []]];
    if (ch.x_secuencia && !ch.x_secuencia.readonly && hv.x_secuencia === undefined) hv.x_secuencia = (i + 1) * 10;
    hitos.push({ vals: hv, riesgos: rh || [] });
  });
  return { errores, vals, hitos, descartados: [...descartados] };
}

export function crearAltaFichas(cliente, catalogos) {
  let campos = null, camposHasta = 0;
  const porClave = new Map(); // clave de envío → {id, name} (repetidos dentro del mismo proceso)
  const enCurso = new Map();
  let cola = Promise.resolve();
  const enSerie = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };

  async function leerCampos() {
    if (campos && Date.now() < camposHasta) return campos;
    const attrs = { attributes: ["type", "readonly", "required", "selection", "relation"] };
    const [ficha, hito] = await Promise.all([
      cliente().ejecutar("x_hys_ficha", "fields_get", [], attrs),
      cliente().ejecutar("x_hys_ficha_hito", "fields_get", [], attrs)]);
    campos = { ficha, hito };
    camposHasta = Date.now() + CAMPOS_MS;
    return campos;
  }

  const fichaActiva = async (ot, cf) => (await cliente().ejecutar("x_hys_ficha", "search_read",
    [[["x_ot_id", "=", ot], ...(cf.x_active ? [["x_active", "=", true]] : [])]],
    { fields: ["id", "x_name", "x_estado", "x_distancia_km", "x_riesgo_ids", "create_uid", "create_date"], order: "id desc", limit: 1 }))[0] || null;

  const leerCreada = async (id) => (await cliente().ejecutar("x_hys_ficha", "search_read", [[["id", "=", id]]],
    { fields: ["id", "x_name", "x_estado", "x_clase_riesgo"], limit: 1 }))[0] || { id };

  const respuesta = (r, extra = {}) => ({ odoo_model: "x_hys_ficha", odoo_id: r.id, id: r.id, name: r.x_name || null,
    estado: r.x_estado || "borrador", clase: r.x_clase_riesgo || null, ...extra });

  /** ¿La ficha existente es este mismo envío repetido? (misma cuenta de servicio, reciente, mismos datos) */
  function esMismoEnvio(f, vals) {
    const uid = cliente().uid;
    if (!uid || m2oId(f.create_uid) !== uid) return false;
    const creada = Date.parse(String(f.create_date || "").replace(" ", "T") + "Z");
    if (!Number.isFinite(creada) || Date.now() - creada > REPETIDO_MS) return false;
    const a = [...(f.x_riesgo_ids || [])].sort((x, y) => x - y).join(","), b = [...(idsDe(vals.x_riesgo_ids) || [])].sort((x, y) => x - y).join(",");
    return a === b && Number(f.x_distancia_km) === Number(vals.x_distancia_km);
  }

  async function recibir(cuerpo, { sesion = null, soloValidar = false } = {}) {
    const idCargador = sesion?.inspector_id;
    if (!Number.isInteger(idCargador)) throw new ErrorEntrada(401, "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.");
    const [c, mapa] = await Promise.all([leerCampos(), catalogos.leerRiesgos()]);
    const activos = new Set([...mapa.values()].filter((r) => r.activo !== false).map((r) => r.id));
    const { errores, vals, hitos, descartados } = validarFicha(cuerpo, c, activos);
    if (errores.length) throw new ErrorEntrada(422, errores.map((e) => e.mensaje).join(" · "), { errores, descartados });
    const clave = cuerpo.idempotency_key;
    if (porClave.has(clave)) return { estado: 200, cuerpo: respuesta(await leerCreada(porClave.get(clave)), { repetido: true, descartados }) };
    if (!soloValidar && enCurso.has(clave)) return enCurso.get(clave);

    const p = (async () => {
      const cargador = await catalogos.buscarInspector(idCargador);
      if (!cargador) throw new ErrorEntrada(422, "Quien carga ya no figura como inspector activo en Odoo (HyS > Inspectores). Avisá a HyS.");

      // Obra: existe, activa y en etapa permitida. Cliente y director salen de la OT (no del celular).
      const ot = (await cliente().ejecutar("project.project", "search_read", [[["id", "=", vals.x_ot_id ?? cuerpo.odoo.vals.x_ot_id]]],
        { fields: ["id", "name", "stage_id", "partner_id", "user_id", "active"], limit: 1 }))[0];
      if (!ot || ot.active === false) throw new ErrorEntrada(422, "La obra (OT) no existe o está archivada en Odoo.");
      const etapa = Array.isArray(ot.stage_id) ? ot.stage_id[1] : "";
      if (!etapaPermitida(etapa)) throw new ErrorEntrada(422, `La obra está en etapa «${etapa || "sin etapa"}»: la Ficha se carga en obras NO INICIADAS, EN PROGRESO o PAUSADO.`);
      vals.x_ot_id = ot.id;
      const cf = c.ficha;
      const pon = (k, x) => { if (cf[k] && !cf[k].readonly && x !== undefined && x !== null && x !== false) vals[k] = x; };
      if (sel(cf.x_estado).includes("borrador")) vals.x_estado = "borrador"; // nunca aprobada desde la app
      pon("x_cliente_id", m2oId(ot.partner_id));
      pon("x_director_obra_id", m2oId(ot.user_id));
      if (cf.x_activa?.type === "boolean") pon("x_activa", true);
      const texto = [textoInspector(cargador), "Inspector HyS", "hys-carga"].join(" · ").slice(0, 250);
      pon("x_cargado_por", texto); // solo si algún día existe el campo
      // Hitos: OT, riesgo HyS (crítico/medio) según la gravedad de sus riesgos, si Odoo deja escribirlo.
      const ch = c.hito;
      const lineas = hitos.map(({ vals: hv, riesgos }) => {
        if (ch.x_ot_id && !ch.x_ot_id.readonly) hv.x_ot_id = ot.id;
        const grav = riesgos.map((id) => mapa.get(id)?.gravedad);
        const rh = grav.includes("critico") ? "critico" : grav.includes("medio") ? "medio" : null;
        if (rh && ch.x_riesgo_hys && !ch.x_riesgo_hys.readonly && sel(ch.x_riesgo_hys).includes(rh)) hv.x_riesgo_hys = rh;
        return [0, 0, hv];
      });
      if (lineas.length && cf.x_hito_ids && !cf.x_hito_ids.readonly) vals.x_hito_ids = lineas;

      if (soloValidar) return { estado: 200, cuerpo: { simulado: true, vals, descartados } };

      return enSerie(async () => {
        const ya = await fichaActiva(ot.id, cf);
        if (ya) {
          if (esMismoEnvio(ya, vals)) { porClave.set(clave, ya.id); return { estado: 200, cuerpo: respuesta(ya, { repetido: true, descartados }) }; }
          throw new ErrorEntrada(409, `La OT ya tiene Ficha de Riesgos (${ya.x_name || `id ${ya.id}`}, ${ya.x_estado || "borrador"}). Una sola Ficha por OT: los cambios se hacen en Odoo.`,
            { codigo: "ficha_existente", ficha: { id: ya.id, name: ya.x_name || null, estado: ya.x_estado || null } });
        }
        const r = await cliente().ejecutar("x_hys_ficha", "create", [[vals]]);
        const id = Array.isArray(r) ? r[0] : r;
        porClave.set(clave, id);
        catalogos.olvidarFichas?.();
        // Constancia de quién la cargó en el historial (si el modelo tiene chatter). Si falla, la Ficha queda igual.
        if (cf.message_ids) {
          await cliente().ejecutar("x_hys_ficha", "message_post", [[id]], { body: `Cargada desde la app hys-carga por ${texto}. Estado: borrador (la aprueba HyS en Odoo).` })
            .catch((e) => console.log("fichas: no se pudo dejar la nota", e instanceof ErrorOdoo ? e.message : e?.name));
        }
        return { estado: 201, cuerpo: respuesta(await leerCreada(id), { descartados }) };
      });
    })().finally(() => enCurso.delete(clave));
    if (!soloValidar) enCurso.set(clave, p);
    return p;
  }

  return { recibir, leerCampos };
}
