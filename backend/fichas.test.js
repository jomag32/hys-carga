import test from "node:test";
import assert from "node:assert/strict";
import { crearCatalogos } from "./catalogos.js";
import { crearInspecciones } from "./inspecciones.js";

// Odoo simulado (datos de EJEMPLO, repo público): riesgos, 2 fichas activas + 1 archivada, hitos.
const RIESGOS = [
  { id: 1, x_codigo: "altura", x_name: "Trabajo en altura", x_gravedad: "critico", x_secuencia: 10 },
  { id: 7, x_codigo: "hormigon", x_name: "Hormigón / bomba", x_gravedad: "medio", x_secuencia: 70 },
  { id: 4, x_codigo: "excavacion", x_name: "Excavación", x_gravedad: "critico", x_secuencia: 40 }];
const FICHAS = [
  { id: 10, x_name: "FR-2026-0001", x_active: true, x_estado: "aprobada", x_ot_id: [101, "OT 9101 - Obra Ejemplo"], x_clase_riesgo: "B", x_clase_motivo: "Riesgo medio: Fundaciones",
    x_clase_calculada_el: "2026-10-18 12:00:00", x_frecuencia_dias: 14, x_modalidad: "alterna", x_distancia_km: 120, x_faltan_hitos: false, x_aviso_ugeop: true,
    x_aviso: "Revisar con UGEOP: Excavación sin hito", x_riesgo_ids: [7, 1, 4], x_fecha_aprobacion: "2026-10-18 13:00:00" },
  { id: 11, x_name: "FR-2026-0002", x_active: true, x_estado: "borrador", x_ot_id: [102, "OT 9102"], x_clase_riesgo: "A",
    x_clase_motivo: "Todavía no tiene Ficha de Riesgos aprobada: se trata como A hasta que HyS la apruebe", x_frecuencia_dias: 7, x_modalidad: "presencial",
    x_distancia_km: 10, x_faltan_hitos: true, x_aviso_ugeop: false, x_aviso: false, x_riesgo_ids: [1] },
  { id: 9, x_name: "FR-2026-0000", x_active: false, x_estado: "aprobada", x_ot_id: [101, "OT 9101"], x_clase_riesgo: "C", x_riesgo_ids: [] }];
const HITOS = [
  { id: 50, x_ficha_id: [10, "FR-2026-0001"], x_name: "Fundaciones", x_riesgo_hys: "medio", x_riesgo_ids: [7], x_inicio_previsto: "2026-10-20", x_inicio_real: false, x_alcanzado: false, x_situacion: "proximo", x_secuencia: 20 },
  { id: 51, x_ficha_id: [10, "FR-2026-0001"], x_name: "Esqueleto / Montaje", x_riesgo_hys: "critico", x_riesgo_ids: [1], x_inicio_previsto: "2026-11-02", x_inicio_real: false, x_alcanzado: false, x_situacion: "futuro", x_secuencia: 30 },
  { id: 60, x_ficha_id: [11, "FR-2026-0002"], x_name: "Excavaciones", x_riesgo_hys: "critico", x_riesgo_ids: [4], x_inicio_previsto: false, x_inicio_real: false, x_alcanzado: false, x_situacion: "sin_fecha", x_secuencia: 10 }];

const S = (...v) => ({ type: "selection", selection: v.map((x) => [x, x]) });
const CAMPOS = {
  x_hys_inspeccion: { x_name: {}, x_formulario: S("F02"), x_ambito: S("obra", "fabrica"), x_tipo_programa: S("periodica", "hito_critico"), x_estado: S("realizada"),
    x_origen: S("formulario"), x_gps_estado: S("denegado"), x_ot_id: {}, x_hito_id: {}, x_ficha_id: {}, x_ficha_hito_id: {}, x_clase_al_inspeccionar: S("A", "B", "C"),
    x_clase_motivo: {}, x_inspector_hys_id: {}, x_inspector_texto: {}, x_tc_nombre: {}, x_tc_firma: { type: "binary" }, x_firma_inspector: { type: "binary" },
    x_fecha_hora_control: {}, x_idempotency_key: {}, x_cargado_por: {}, x_linea_ids: {} },
  x_hys_inspeccion_linea: { x_name: {}, x_bloque: {}, x_respuesta: S("si", "no", "na"), x_inspeccion_id: {} }
};

function odoo() {
  const creados = [], llamadas = [];
  const cumple = (r, [c, op, v]) => (op === "=" ? (Array.isArray(r[c]) ? r[c][0] : r[c]) === v : op === "in" ? v.includes(Array.isArray(r[c]) ? r[c][0] : r[c])
    : op === "ilike" ? String(r[c] ?? "").includes(v) : (() => { throw new Error(op); })());
  const ejecutar = async (m, met, args = [], kw = {}) => {
    llamadas.push({ m, met, args, kw });
    if (!["fields_get", "search_read", "create", "write"].includes(met)) throw new Error("no simulado " + met);
    if (met === "fields_get") return CAMPOS[m];
    if (met === "create") { creados.push({ id: creados.length + 1, ...args[0][0] }); return [creados.length]; }
    if (met === "write") return true;
    const base = { x_hys_riesgo: RIESGOS, x_hys_ficha: FICHAS, x_hys_ficha_hito: HITOS, x_hys_inspeccion: creados }[m] || [];
    let r = base.filter((x) => (args[0] || []).every((d) => cumple(x, d)));
    if (m === "x_hys_ficha" && kw.order === "id desc") r = [...r].sort((a, b) => b.id - a.id);
    return r;
  };
  return { cliente: { ejecutar }, creados, llamadas };
}
const armar = () => {
  const o = odoo();
  const cat = crearCatalogos(() => o.cliente);
  cat.buscarInspector = async (id) => (id === 2 ? { id: 2, x_name: "Inspector Ejemplo", x_legajo: "0001" } : null);
  return { ...o, cat, api: crearInspecciones(() => o.cliente, cat) };
};

test("GET fichas: activas, una por OT, riesgos con código y hitos ordenados", async () => {
  const { cat } = armar();
  const l = await cat.leerFichas();
  assert.deepEqual(l.map((f) => f.id), [11, 10]); // la archivada (9) no
  const f = l.find((x) => x.ot === 101);
  assert.equal(f.nombre, "FR-2026-0001"); assert.equal(f.estado, "aprobada"); assert.equal(f.aprobada, true);
  assert.equal(f.clase, "B"); assert.equal(f.motivo, "Riesgo medio: Fundaciones");
  assert.deepEqual(f.riesgos.map((r) => r.codigo), ["altura", "excavacion", "hormigon"]); // por secuencia del catálogo
  assert.equal(f.aviso_ugeop, true); assert.equal(f.faltan_hitos, false); assert.equal(f.modalidad, "alterna"); assert.equal(f.frecuencia_dias, 14);
  assert.deepEqual(f.hitos.map((h) => [h.id, h.critico, h.riesgos]), [[50, false, ["hormigon"]], [51, true, ["altura"]]]);
  assert.equal(f.hitos[0].inicio_real, null);
  const b = await cat.fichaDeOt(102);
  assert.equal(b.estado, "borrador"); assert.equal(b.faltan_hitos, true); assert.equal(b.aviso, null);
  assert.equal(await cat.fichaDeOt(999), null);
  assert.deepEqual((await cat.leerHitos(101)).map((h) => h.id), [50, 51]);
  assert.deepEqual(await cat.leerHitos(999), []);
});

let n = 0;
const cuerpo = ({ ot = 101, tipo = "periodica", extra = {} } = {}) => {
  const k = `6f1c2a9e-1111-4222-8333-${String(++n).padStart(12, "0")}`;
  return { formulario: "F02", idempotency_key: k, contexto: { lugar: "OT 9101", clase_al_inspeccionar: "C", clase_motivo: "inventado" },
    odoo: { model: "x_hys_inspeccion", method: "create", vals: { x_formulario: "F02", x_ambito: "obra", x_tipo_programa: tipo, x_ot_id: ot,
      x_inspector_hys_id: 2, x_tc_nombre: "Capataz", x_tc_firma: "AAAA", x_fecha_hora_control: "2026-10-19 12:00:00", x_gps_estado: "denegado",
      x_idempotency_key: k, x_cargado_por: "x", x_linea_ids: [[0, 0, { x_name: "Ítem", x_bloque: "General", x_respuesta: "si" }]], ...extra } } };
};
const SES = { sesion: { inspector_id: 2 } };

test("POST: ficha, clase y motivo salen de Odoo (no del celular); lectura fresca de la ficha", async () => {
  const { api, creados, llamadas } = armar();
  const c = cuerpo({ extra: { x_ficha_id: 999, x_clase_al_inspeccionar: "C", x_clase_motivo: "inventado" } });
  const r = await api.recibir(c, SES);
  assert.equal(r.estado, 201);
  assert.equal(creados[0].x_ficha_id, 10);
  assert.equal(creados[0].x_clase_al_inspeccionar, "B");
  assert.equal(creados[0].x_clase_motivo, "Riesgo medio: Fundaciones");
  assert.ok(r.cuerpo.descartados.includes("x_ficha_id") && r.cuerpo.descartados.includes("x_clase_al_inspeccionar"));
  assert.ok(llamadas.some((l) => l.m === "x_hys_ficha" && l.args[0].some((d) => d[0] === "x_ot_id" && d[2] === 101)), "lee la ficha de esa OT al recibir");
});

test("POST: obra sin ficha → Clase A con motivo, sin x_ficha_id; ficha en borrador → su clase A y su motivo", async () => {
  const { api, creados } = armar();
  await api.recibir(cuerpo({ ot: 555 }), SES);
  assert.equal(creados[0].x_ficha_id, undefined);
  assert.equal(creados[0].x_clase_al_inspeccionar, "A");
  assert.equal(creados[0].x_clase_motivo, "Sin Ficha de Riesgos: se trata como Clase A");
  await api.recibir(cuerpo({ ot: 102 }), SES);
  assert.equal(creados[1].x_ficha_id, 11);
  assert.equal(creados[1].x_clase_al_inspeccionar, "A");
  assert.match(creados[1].x_clase_motivo, /Todavía no tiene Ficha/);
});

test("POST hito crítico: x_ficha_hito_id debe ser de la ficha de la OT y crítico", async () => {
  const { api, creados } = armar();
  await assert.rejects(api.recibir(cuerpo({ tipo: "hito_critico", extra: { x_ficha_hito_id: 60 } }), SES), (e) => e.estado === 422 && /no es de la Ficha/.test(e.message));
  await assert.rejects(api.recibir(cuerpo({ tipo: "hito_critico", extra: { x_ficha_hito_id: 50 } }), SES), (e) => e.estado === 422 && /no es de riesgo crítico/.test(e.message));
  await assert.rejects(api.recibir(cuerpo({ ot: 555, tipo: "hito_critico", extra: { x_ficha_hito_id: 51 } }), SES), (e) => e.estado === 422);
  await assert.rejects(api.recibir(cuerpo({ tipo: "hito_critico" }), SES), (e) => e.estado === 422 && /Falta el hito/.test(e.message));
  assert.equal(creados.length, 0);
  await api.recibir(cuerpo({ tipo: "hito_critico", extra: { x_ficha_hito_id: 51 } }), SES);
  assert.equal(creados[0].x_ficha_hito_id, 51); assert.equal(creados[0].x_ficha_id, 10);
});

test("compatibilidad: envío viejo en cola (hito_critico con x_hito_id de project.milestone, sin ficha) → se acepta y se completa la ficha", async () => {
  const { api, creados } = armar();
  const r = await api.recibir(cuerpo({ tipo: "hito_critico", extra: { x_hito_id: 777 } }), SES);
  assert.equal(r.estado, 201);
  assert.equal(creados[0].x_hito_id, 777); assert.equal(creados[0].x_ficha_id, 10); assert.equal(creados[0].x_clase_al_inspeccionar, "B");
});

test("periódica: no guarda hitos aunque vengan", async () => {
  const { api, creados } = armar();
  await api.recibir(cuerpo({ extra: { x_ficha_hito_id: 51, x_hito_id: 3 } }), SES);
  assert.equal(creados[0].x_ficha_hito_id, undefined); assert.equal(creados[0].x_hito_id, undefined);
});

test("nunca escribe en fichas, hitos ni riesgos (MIA solo lee F01)", async () => {
  const { api, llamadas } = armar();
  await api.recibir(cuerpo({ tipo: "hito_critico", extra: { x_ficha_hito_id: 51 } }), SES);
  assert.ok(llamadas.filter((l) => ["create", "write", "unlink"].includes(l.met)).every((l) => l.m === "x_hys_inspeccion"));
});
