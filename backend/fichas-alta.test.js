import test from "node:test";
import assert from "node:assert/strict";
import { crearAltaFichas, validarFicha, etapaPermitida } from "./fichas-alta.js";

// Odoo simulado (datos de EJEMPLO, repo público).
const S = (...v) => ({ type: "selection", selection: v.map((x) => [x, x]) });
const CAMPOS = {
  x_hys_ficha: { x_name: { readonly: true }, x_active: { type: "boolean" }, x_activa: { type: "boolean" }, x_ot_id: {}, x_cliente_id: {}, x_director_obra_id: {},
    x_estado: S("borrador", "aprobada"), x_fecha_aprobacion: {}, x_aprobo_id: {}, x_firma: { type: "binary" }, x_distancia_km: {},
    x_tipo_predio: S("terreno_cliente", "planta_terceros", "via_publica"), x_riesgo_ids: {}, x_epp_controles: {}, x_doc_cliente: {}, x_centro_salud: {},
    x_clase_riesgo: S("A", "B", "C"), x_gps_lat: {}, x_gps_lon: {}, x_gps_precision_m: {}, x_gps_fecha: { type: "datetime" }, x_gps_estado: S("ok", "denegado"),
    x_hito_ids: {}, message_ids: {} },
  x_hys_ficha_hito: { x_name: {}, x_ficha_id: {}, x_ot_id: {}, x_secuencia: {}, x_riesgo_hys: S("critico", "medio"), x_riesgo_ids: {},
    x_inicio_previsto: { type: "date" }, x_inicio_real: {}, x_situacion: {}, x_notas: {} }
};
const RIESGOS = [{ id: 1, x_codigo: "altura", x_name: "Altura", x_gravedad: "critico", x_secuencia: 10, x_active: true },
  { id: 7, x_codigo: "hormigon", x_name: "Hormigón", x_gravedad: "medio", x_secuencia: 70, x_active: true },
  { id: 8, x_codigo: "viejo", x_name: "Archivado", x_gravedad: "medio", x_secuencia: 80, x_active: false }];
const OBRAS = [{ id: 501, name: "OT 9501 - Obra Ejemplo", stage_id: [3, "NO INICIADAS"], partner_id: [901, "Cliente Ejemplo"], user_id: [201, "Director Ejemplo"], active: true },
  { id: 502, name: "OT 9502", stage_id: [4, "EN PROGRESO"], partner_id: false, user_id: false, active: true },
  { id: 503, name: "OT 9503", stage_id: [9, "TERMINADO"], partner_id: false, user_id: false, active: true }];
const K = "6f1c2a9e-1111-4222-8333-444455556666", K2 = "6f1c2a9e-1111-4222-8333-444455556677";

function armar({ fichas = [] } = {}) {
  const db = { x_hys_ficha: fichas.map((f) => ({ ...f })) }; const llamadas = [];
  const cumple = (r, [c, op, v]) => { const x = Array.isArray(r[c]) ? r[c][0] : r[c]; if (op === "=") return x === v; throw new Error(op); };
  const ejecutar = async (m, met, args = [], kw = {}) => {
    llamadas.push({ m, met, args, kw });
    if (met === "fields_get") return CAMPOS[m];
    if (met === "message_post") return 1;
    if (met === "create") { const id = 100 + db.x_hys_ficha.length; db.x_hys_ficha.push({ id, ...args[0][0], x_ot_id: [args[0][0].x_ot_id, "OT"], x_riesgo_ids: args[0][0].x_riesgo_ids[0][2],
      x_name: `FR-2026-${String(id).padStart(4, "0")}`, x_clase_riesgo: "A", x_active: true, create_uid: [7, "MIA"], create_date: new Date().toISOString().slice(0, 19).replace("T", " ") }); return [id]; }
    const base = { x_hys_riesgo: RIESGOS, project_project: OBRAS, "project.project": OBRAS, x_hys_ficha: db.x_hys_ficha }[m] || [];
    const r = base.filter((x) => (args[0] || []).every((d) => cumple(x, d)));
    return kw.limit ? r.slice(0, kw.limit) : r;
  };
  const cliente = { ejecutar, uid: 7 };
  const mapa = new Map(RIESGOS.map((r) => [r.id, { id: r.id, codigo: r.x_codigo, gravedad: r.x_gravedad, activo: r.x_active }]));
  const catalogos = { leerRiesgos: async () => mapa, buscarInspector: async (id) => (id === 2 ? { id: 2, x_name: "Inspector Ejemplo", x_legajo: "0001" } : id === 3 ? { id: 3, x_name: "Encargado Ejemplo", x_legajo: "0004", x_rol: "encargado", x_sector: "logistica" } : null), olvidarFichas: () => {} };
  return { api: crearAltaFichas(() => cliente, catalogos), db, llamadas };
}
const cuerpo = (extra = {}, clave = K) => ({ formulario: "F01", idempotency_key: clave, odoo: { model: "x_hys_ficha", method: "create", vals: {
  x_ot_id: 501, x_distancia_km: "35", x_tipo_predio: "terreno_cliente", x_riesgo_ids: [[6, 0, [1, 7]]], x_centro_salud: " Hospital Ejemplo ",
  x_epp_controles: "Arnés", x_estado: "aprobada", x_firma: "data:image/png;base64,AAAA", x_name: "FR-INVENTADO", x_inventado: 1, x_gps_estado: "denegado",
  x_hito_ids: [[0, 0, { x_name: "Montaje", x_inicio_previsto: "2026-11-02", x_riesgo_ids: [[6, 0, [1]]], x_situacion: "x" }], [0, 0, { x_name: "Hormigonado", x_riesgo_ids: [[6, 0, [7]]] }]],
  ...extra } } });
const SES = { inspector_id: 2 };

test("crea en BORRADOR aunque pidan aprobada; descarta lo que no existe o está protegido; cliente y director de la OT", async () => {
  const { api, db, llamadas } = armar();
  const r = await api.recibir(cuerpo(), { sesion: SES });
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.name, "FR-2026-0100");
  assert.equal(r.cuerpo.estado, "borrador");
  const v = llamadas.find((l) => l.met === "create").args[0][0];
  assert.equal(v.x_estado, "borrador");
  assert.equal(v.x_firma, undefined); assert.equal(v.x_name, undefined); assert.equal(v.x_inventado, undefined);
  assert.equal(v.x_distancia_km, 35); assert.equal(v.x_centro_salud, "Hospital Ejemplo");
  assert.equal(v.x_cliente_id, 901); assert.equal(v.x_director_obra_id, 201); assert.equal(v.x_activa, true);
  assert.deepEqual(v.x_riesgo_ids, [[6, 0, [1, 7]]]);
  assert.equal(v.x_hito_ids.length, 2);
  assert.deepEqual(v.x_hito_ids[0][2], { x_name: "Montaje", x_inicio_previsto: "2026-11-02", x_riesgo_ids: [[6, 0, [1]]], x_secuencia: 10, x_ot_id: 501, x_riesgo_hys: "critico" });
  assert.equal(v.x_hito_ids[1][2].x_riesgo_hys, "medio");
  assert.ok(r.cuerpo.descartados.includes("x_firma") && r.cuerpo.descartados.includes("x_hito_ids[].x_situacion"));
  assert.ok(llamadas.some((l) => l.met === "message_post" && /Legajo 0001 · Inspector Ejemplo/.test(l.kw.body)));
  assert.equal(db.x_hys_ficha.length, 1);
});

test("mismo envío repetido (misma clave) → 200, no duplica", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo(), { sesion: SES });
  const r = await api.recibir(cuerpo(), { sesion: SES });
  assert.equal(r.estado, 200); assert.equal(r.cuerpo.repetido, true); assert.equal(db.x_hys_ficha.length, 1);
});

test("dos envíos simultáneos con la misma clave → uno solo", async () => {
  const { api, db } = armar();
  const [a, b] = await Promise.all([api.recibir(cuerpo(), { sesion: SES }), api.recibir(cuerpo(), { sesion: SES })]);
  assert.equal(a.cuerpo.id, b.cuerpo.id); assert.equal(db.x_hys_ficha.length, 1);
});

test("reintento tras reinicio (clave olvidada) con los mismos datos → 200 repetido; datos distintos → 409", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo(), { sesion: SES });
  // Proceso nuevo, mismo Odoo:
  const nuevo = armar({ fichas: db.x_hys_ficha });
  const r = await nuevo.api.recibir(cuerpo({}, K2), { sesion: SES });
  assert.equal(r.estado, 200); assert.equal(r.cuerpo.repetido, true);
  await assert.rejects(() => nuevo.api.recibir(cuerpo({ x_distancia_km: 99 }, "6f1c2a9e-1111-4222-8333-444455556688"), { sesion: SES }),
    (e) => e.estado === 409 && /ya tiene Ficha de Riesgos \(FR-2026-0100/.test(e.message) && e.extra.ficha.id === 100);
});

test("OT con Ficha de otra persona/otro momento → 409 con el número", async () => {
  const { api } = armar({ fichas: [{ id: 5, x_name: "FR-2026-0005", x_estado: "aprobada", x_ot_id: [501, "OT"], x_active: true, x_riesgo_ids: [1, 7], x_distancia_km: 35,
    create_uid: [2, "Admin"], create_date: "2026-10-01 10:00:00" }] });
  await assert.rejects(() => api.recibir(cuerpo(), { sesion: SES }), (e) => e.estado === 409 && e.extra.codigo === "ficha_existente" && /FR-2026-0005/.test(e.message));
});

test("etapas: NO INICIADAS y EN PROGRESO sí; TERMINADO no", async () => {
  assert.ok(etapaPermitida("NO INICIADAS")); assert.ok(etapaPermitida("No iniciada")); assert.ok(etapaPermitida("PAUSADO")); assert.ok(!etapaPermitida("TERMINADO"));
  const { api } = armar();
  assert.equal((await api.recibir(cuerpo({ x_ot_id: 502 }), { sesion: SES })).estado, 201);
  await assert.rejects(() => api.recibir(cuerpo({ x_ot_id: 503 }, K2), { sesion: SES }), (e) => e.estado === 422 && /TERMINADO/.test(e.message));
});

test("validación: sin sesión 401, riesgos archivados/inexistentes, centro de salud, predio, hito sin nombre", async () => {
  const { api } = armar();
  await assert.rejects(() => api.recibir(cuerpo(), {}), (e) => e.estado === 401);
  await assert.rejects(() => api.recibir(cuerpo(), { sesion: { inspector_id: 99 } }), (e) => e.estado === 422);
  const act = new Set([1, 7]);
  const c = { ficha: CAMPOS.x_hys_ficha, hito: CAMPOS.x_hys_ficha_hito };
  const err = (extra) => validarFicha(cuerpo(extra), c, act).errores.map((e) => e.campo);
  assert.deepEqual(err({}), []);
  assert.deepEqual(err({ x_riesgo_ids: [[6, 0, [8]]] }), ["x_riesgo_ids"]);
  assert.deepEqual(err({ x_riesgo_ids: [[6, 0, []]] }), ["x_riesgo_ids"]);
  assert.deepEqual(err({ x_centro_salud: "  " }), ["x_centro_salud"]);
  assert.deepEqual(err({ x_tipo_predio: "luna" }), ["x_tipo_predio"]);
  assert.deepEqual(err({ x_distancia_km: "" }), ["x_distancia_km"]);
  assert.deepEqual(err({ x_hito_ids: [[0, 0, { x_name: " " }]] }), ["x_hito_ids[0].x_name"]);
  assert.deepEqual(validarFicha({ ...cuerpo(), idempotency_key: "x" }, c, act).errores.map((e) => e.campo), ["idempotency_key"]);
});

test("un encargado de sector no carga Fichas F01 (403)", async () => {
  const { api, db } = armar();
  await assert.rejects(api.recibir(cuerpo({}, "6f1c2a9e-1111-4222-8333-0000000e0003"), { sesion: { inspector_id: 3 } }), (e) => e.estado === 403);
  assert.equal(db.x_hys_ficha.length, 0);
});

test("distancia a Posadas: obligatoria, 0–2000 km y se redondea a entero", () => {
  const campos = { ficha: { x_ot_id: {}, x_distancia_km: {}, x_centro_salud: {}, x_riesgo_ids: {} }, hito: {} };
  const riesgos = new Set([1]);
  const v = (km) => validarFicha({ formulario: "F01", idempotency_key: K, odoo: { model: "x_hys_ficha", method: "create", vals: {
    x_ot_id: 501, x_centro_salud: "H", x_riesgo_ids: [[6, 0, [1]]], ...(km === undefined ? {} : { x_distancia_km: km }) } } }, campos, riesgos);
  for (const km of [undefined, null, "", false]) assert.match(v(km).errores.find((e) => e.campo === "x_distancia_km")?.mensaje || "", /obligatoria/, String(km));
  for (const km of [-1, 2001, "abc"]) assert.match(v(km).errores.find((e) => e.campo === "x_distancia_km")?.mensaje || "", /inválida/, String(km));
  const ok = v("62.6"); assert.equal(ok.errores.length, 0); assert.equal(ok.vals.x_distancia_km, 63);
  assert.equal(v(0).errores.length, 0);
});
