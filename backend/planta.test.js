import test from "node:test";
import assert from "node:assert/strict";
import { crearInspecciones } from "./inspecciones.js";
import { crearPlanta, periodoDe, ITEMS_RESPALDO, SECTORES_FABRICA } from "./planta.js";

// Odoo simulado (sin red). Solo nombres de ejemplo.
const S = (...v) => ({ type: "selection", selection: v.map((x) => [x, x]) });
const CAMPOS = {
  x_hys_inspeccion: { x_name: {}, x_formulario: S("F02", "F03", "F04"), x_ambito: S("obra", "fabrica", "oficina"), x_lugar: S("fabrica", "oficina"),
    x_tipo_programa: S("periodica", "hito_critico", "apertura", "recorrida_semanal", "check_mensual", "fuera_programa"),
    x_estado: S("programada", "realizada", "cancelada"), x_origen: S("formulario"), x_gps_estado: S("ok", "denegado"), x_modalidad: S("presencial", "remota"),
    x_ot_id: {}, x_hito_id: {}, x_ficha_hito_id: {}, x_ficha_id: {}, x_inspector_hys_id: {}, x_inspector_texto: {}, x_tc_nombre: {}, x_tc_firma: { type: "binary" },
    x_tc_observaciones: {}, x_firma_inspector: { type: "binary" }, x_fecha_hora_control: {}, x_fecha_vencimiento: {}, x_fecha_recepcion: {},
    x_idempotency_key: {}, x_cargado_por: {}, x_linea_ids: {}, x_cant_no: {}, x_validador_id: {}, x_validacion_estado: S("no_aplica", "pendiente", "validada", "objetada"),
    x_presencial_obligatoria: {} },
  x_hys_inspeccion_linea: { x_name: {}, x_bloque: {}, x_item_codigo: {}, x_secuencia: {}, x_respuesta: S("si", "no", "na"), x_criticidad: S("critico", "mayor", "menor"),
    x_foto: { type: "binary" }, x_comentario: {}, x_sector: S(...SECTORES_FABRICA.map(([k]) => k)), x_obs_tc: {}, x_inspeccion_id: {} },
  x_hys_config: { x_name: {}, x_jefe_produccion_id: {}, x_validador_fabrica_id: {}, x_coo_id: {}, x_f03_dia_vence: {}, x_f04_dia_vence: {} }
};
const CONFIG = { id: 1, x_jefe_produccion_id: [31, "Jefe de Producción Ejemplo"], x_validador_fabrica_id: [32, "Dirección de Fábrica Ejemplo"],
  x_coo_id: [33, "COO Ejemplo"], x_f03_dia_vence: "vie", x_f04_dia_vence: 7 };

function odooFalso({ registros = [], items = null, config = CONFIG, camposConfig = CAMPOS.x_hys_config, sectores = null, camposLinea = null } = {}) {
  const db = registros.map((r) => ({ ...r }));
  let sig = Math.max(0, ...db.map((r) => r.id)) + 1;
  const llamadas = [];
  const cumple = (r, [c, op, val]) => {
    const v = r[c];
    if (op === "=") return v === val;
    if (op === "ilike") return String(v ?? "").toLowerCase().includes(String(val).toLowerCase());
    if (op === ">=") return v >= val;
    if (op === "<=") return v <= val;
    if (op === "in") return val.includes(v);
    throw new Error(`op ${op}`);
  };
  async function ejecutar(modelo, metodo, args = [], kwargs = {}) {
    llamadas.push({ modelo, metodo, args, kwargs });
    if (metodo === "fields_get") return modelo === "x_hys_config" ? camposConfig : modelo === "x_hys_inspeccion_linea" && camposLinea ? camposLinea : CAMPOS[modelo];
    if (modelo === "x_hys_sector_resp") { if (!sectores) throw new Error("Object x_hys_sector_resp doesn't exist"); return sectores; }
    if (modelo === "x_hys_config") return [config];
    if (modelo === "x_hys_item_plantilla") {
      if (items === "falla") throw new Error("sin red");
      const f = args[0].find((d) => d[0] === "x_formulario")[2];
      return (items?.[f] || []).map((x, i) => ({ id: i + 1, x_codigo: x.codigo, x_name: x.nombre, x_bloque: x.bloque, x_secuencia: x.secuencia, x_admite_na: true }));
    }
    if (metodo === "search_read") {
      const r = db.filter((x) => args[0].every((d) => cumple(x, d)));
      return kwargs.limit ? r.slice(0, kwargs.limit) : r;
    }
    if (metodo === "create") { const reg = { id: sig++, ...args[0][0] }; db.push(reg); return [reg.id]; }
    if (metodo === "write") { for (const id of args[0]) Object.assign(db.find((x) => x.id === id), args[1]); return true; }
    throw new Error(`método ${metodo}`);
  }
  return { cliente: { ejecutar }, db, llamadas };
}
const ACTIVOS = { 9: { id: 9, x_name: "Inspector Ejemplo", x_legajo: "1" }, 10: { id: 10, x_name: "Cargador Ejemplo", x_legajo: "2" },
  12: { id: 12, x_name: "Encargado Ejemplo", x_legajo: "4", x_rol: "encargado", x_sector: "deposito" } };
const catalogosFalsos = { buscarInspector: async (id) => ACTIVOS[id] || null, fichaDeOt: async () => { throw new Error("F03 no lee fichas"); } };
const armar = (o = {}, sesion = { inspector_id: 10 }) => {
  const f = odooFalso(o);
  const api = crearInspecciones(() => f.cliente, catalogosFalsos);
  return { ...f, api, recibir: (c, x = {}) => api.recibir(c, { sesion, ...x }) };
};

let n = 0;
const clave = () => `7a2b3c4d-1111-4222-8333-${String(++n).padStart(12, "0")}`;
const lineas = (plantilla = "F03", mod = {}) => ITEMS_RESPALDO[plantilla].map((x) => [0, 0, { x_name: x.nombre, x_bloque: x.bloque, x_item_codigo: x.codigo,
  x_respuesta: "si", ...(mod[x.codigo] || {}) }]);
// 2026-10-21 (miércoles) 12:00 UTC = 09:00 hora de Argentina.
function f03({ k = clave(), fecha = "2026-10-21 12:00:00", tipo = "recorrida_semanal", mod = {}, extra = {} } = {}) {
  return { formulario: "F03", idempotency_key: k, odoo: { model: "x_hys_inspeccion", method: "create", vals: {
    x_formulario: "F03", x_ambito: "fabrica", x_lugar: "fabrica", x_tipo_programa: tipo, x_inspector_hys_id: 9, x_firma_inspector: "data:image/png;base64,FFFF",
    x_tc_nombre: "Reemplazo Ejemplo", x_tc_firma: "AAAA", x_fecha_hora_control: fecha, x_gps_estado: "denegado", x_idempotency_key: k, x_cargado_por: "x",
    x_linea_ids: lineas("F03", mod), ...extra } }, contexto: { lugar: "Fábrica" } };
}
function f04({ lugar = "fabrica", k = clave(), fecha = "2026-10-05 12:00:00" } = {}) {
  return { formulario: "F04", idempotency_key: k, odoo: { model: "x_hys_inspeccion", method: "create", vals: {
    x_formulario: "F04", x_ambito: lugar, x_lugar: lugar, x_tipo_programa: "check_mensual", x_inspector_hys_id: 9, x_firma_inspector: "FFFF",
    x_tc_nombre: "Responsable Ejemplo", x_tc_firma: "AAAA", x_fecha_hora_control: fecha, x_gps_estado: "denegado", x_idempotency_key: k, x_cargado_por: "x",
    x_linea_ids: lineas(lugar === "oficina" ? "F04_OFI" : "F04_FAB") } } };
}
const NO = { x_respuesta: "no", x_criticidad: "mayor", x_foto: "BBBB", x_sector: "pintura" };

test("período semanal: vence viernes 23:59 hora local (= sábado 02:59 UTC); configurable", () => {
  assert.deepEqual(periodoDe("2026-10-21 12:00:00"), { inicio: "2026-10-19 03:00:00", fin: "2026-10-26 02:59:59", vence: "2026-10-24 02:59:00" });
  assert.equal(periodoDe("2026-10-21 12:00:00", { diaVence: "mie" }).vence, "2026-10-22 02:59:00");
  // Domingo 23:30 local (lunes 02:30 UTC) sigue siendo la semana anterior.
  assert.equal(periodoDe("2026-10-26 02:30:00").inicio, "2026-10-19 03:00:00");
  // Lunes 00:30 local ya es la semana nueva.
  assert.equal(periodoDe("2026-10-26 03:30:00").inicio, "2026-10-26 03:00:00");
  assert.equal(periodoDe("2026-10-05 12:00:00", { periodo: "mes", diaMes: 7 }).vence, "2026-10-08 02:59:00");
  assert.equal(periodoDe("2026-02-10 12:00:00", { periodo: "mes", diaMes: 31 }).vence, "2026-03-01 02:59:00");
});

test("F03 válida (sin programada): crea INS, vence viernes, validador = Dirección de Fábrica, pendiente, presencial; sin obra", async () => {
  const { recibir, db } = armar();
  const c = f03({ extra: { x_ot_id: 6, x_ficha_hito_id: 3 } });
  const r = await recibir(c);
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.name, "INS-2026-00001");
  const reg = db[0];
  assert.equal(reg.x_fecha_vencimiento, "2026-10-24 02:59:00");
  assert.equal(reg.x_validador_id, 32);
  assert.equal(reg.x_validacion_estado, "pendiente");
  assert.equal(reg.x_modalidad, "presencial");
  assert.equal(reg.x_tipo_programa, "recorrida_semanal");
  assert.equal(reg.x_tc_nombre, "Reemplazo Ejemplo"); // TC editable: firma un reemplazo
  assert.equal(reg.x_firma_inspector, "FFFF");
  assert.equal(reg.x_ot_id, undefined); assert.equal(reg.x_ficha_hito_id, undefined); assert.equal(reg.x_ficha_id, undefined);
  assert.equal(reg.x_linea_ids.length, 18);
});

test("«No» queda en la línea con sector, gravedad y foto; sin x_desvio_ids", async () => {
  const { recibir, db } = armar();
  const c = f03({ mod: { "F03-04": NO, "F03-12": { ...NO, x_sector: "recepcion_deposito", x_criticidad: "critico" } }, extra: { x_desvio_ids: [[0, 0, {}]] } });
  const r = await recibir(c);
  assert.ok(r.cuerpo.descartados.includes("x_desvio_ids"));
  const nos = db[0].x_linea_ids.map(([, , l]) => l).filter((l) => l.x_respuesta === "no");
  assert.deepEqual(nos.map((l) => [l.x_item_codigo, l.x_sector, l.x_criticidad, l.x_foto]),
    [["F03-04", "pintura", "mayor", "BBBB"], ["F03-12", "recepcion_deposito", "critico", "BBBB"]]);
  assert.equal(db[0].x_cant_no, 2);
});

test("«No» sin sector o sin foto → 422", async () => {
  const { recibir, db } = armar();
  await assert.rejects(recibir(f03({ mod: { "F03-01": { ...NO, x_sector: undefined } } })), (e) => e.estado === 422 && /sector/.test(e.message));
  await assert.rejects(recibir(f03({ mod: { "F03-01": { ...NO, x_foto: undefined } } })), (e) => e.estado === 422 && /foto/.test(e.message));
  await assert.rejects(recibir(f03({ mod: { "F03-01": { ...NO, x_sector: "deposito" } } })), (e) => e.estado === 422);
  assert.equal(db.length, 0);
});

test("código faltante, repetido o ajeno → 422", async () => {
  const { recibir, db } = armar();
  const falta = f03(); falta.odoo.vals.x_linea_ids.pop();
  await assert.rejects(recibir(falta), (e) => e.estado === 422 && /Faltan ítems por responder: F03-18/.test(e.message));
  const rep = f03(); rep.odoo.vals.x_linea_ids[17][2].x_item_codigo = "F03-01";
  await assert.rejects(recibir(rep), (e) => e.estado === 422 && /repetido/.test(e.message));
  const ajeno = f03(); ajeno.odoo.vals.x_linea_ids[0][2].x_item_codigo = "F02-GEN-01";
  await assert.rejects(recibir(ajeno), (e) => e.estado === 422 && /no es de F03/.test(e.message));
  assert.equal(db.length, 0);
});

test("catálogo de Odoo manda sobre el respaldo (D-07)", async () => {
  const items = { F03: ITEMS_RESPALDO.F03.slice(0, 2) };
  const { recibir } = armar({ items });
  const c = f03(); c.odoo.vals.x_linea_ids = c.odoo.vals.x_linea_ids.slice(0, 2);
  assert.equal((await recibir(c)).estado, 201);
});

test("sin firma del inspector, lugar distinto de Fábrica o tipo de obra → 422", async () => {
  const { recibir } = armar();
  await assert.rejects(recibir(f03({ extra: { x_firma_inspector: undefined } })), (e) => e.estado === 422 && /firma del inspector/.test(e.message));
  await assert.rejects(recibir(f03({ extra: { x_lugar: "oficina", x_ambito: "oficina" } })), (e) => e.estado === 422);
  await assert.rejects(recibir(f03({ tipo: "periodica" })), (e) => e.estado === 422 && /Tipo inválido para F03/.test(e.message));
});

test("encargado de sector (F08) intenta F03 → 403", async () => {
  const { recibir, db } = armar({}, { inspector_id: 12 });
  await assert.rejects(recibir(f03()), (e) => e.estado === 403);
  assert.equal(db.length, 0);
});

test("idempotencia: misma clave → mismo INS, un solo registro", async () => {
  const { recibir, db } = armar();
  const c = f03();
  const [a, b] = await Promise.all([recibir(c), recibir(c)]);
  const d = await recibir(c);
  assert.equal(a.cuerpo.id, b.cuerpo.id); assert.equal(d.cuerpo.id, a.cuerpo.id); assert.equal(d.cuerpo.repetido, true);
  assert.equal(db.length, 1);
});

test("segunda recorrida en la semana → fuera_programa y la respuesta lo avisa", async () => {
  const { recibir, db } = armar();
  await recibir(f03());
  const r = await recibir(f03({ fecha: "2026-10-23 15:00:00" }));
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.fuera_programa, true);
  assert.match(r.cuerpo.aviso, /fuera de programa/);
  assert.equal(db[1].x_tipo_programa, "fuera_programa");
  assert.equal(db[1].x_fecha_vencimiento, "2026-10-23 15:00:00");
  // La semana siguiente vuelve a ser del programa.
  const r3 = await recibir(f03({ fecha: "2026-10-27 12:00:00" }));
  assert.equal(r3.cuerpo.fuera_programa, undefined);
  assert.equal(db[2].x_tipo_programa, "recorrida_semanal");
});

test("dos recorridas simultáneas en la misma semana → una del programa y otra fuera_programa", async () => {
  const { recibir, db } = armar();
  await Promise.all([recibir(f03()), recibir(f03())]);
  assert.deepEqual(db.map((r) => r.x_tipo_programa).sort(), ["fuera_programa", "recorrida_semanal"]);
});

test("completa la programada de la semana (no crea otra)", async () => {
  const prog = { id: 50, x_name: "F03 programada · semana 2026-10-19", x_formulario: "F03", x_tipo_programa: "recorrida_semanal", x_estado: "programada",
    x_ambito: "fabrica", x_lugar: "fabrica", x_fecha_vencimiento: "2026-10-24 02:59:00", x_validacion_estado: "no_aplica" };
  const { recibir, db } = armar({ registros: [prog] });
  const r = await recibir(f03());
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.id, 50);
  assert.equal(r.cuerpo.programada_completada, 50);
  assert.equal(db.length, 1);
  assert.equal(db[0].x_estado, "realizada");
  assert.equal(db[0].x_name, "INS-2026-00001");
  assert.equal(db[0].x_linea_ids.length, 18);
  assert.equal(db[0].x_validador_id, 32);
  // Reintento con la misma clave → el mismo registro.
  const r2 = await recibir({ ...f03(), idempotency_key: db[0].x_idempotency_key, odoo: { ...f03().odoo, vals: { ...f03().odoo.vals, x_idempotency_key: db[0].x_idempotency_key } } });
  assert.equal(r2.cuerpo.id, 50); assert.equal(r2.cuerpo.repetido, true);
});

test("programada de OTRA semana no se toca", async () => {
  const prog = { id: 50, x_name: "F03 programada", x_formulario: "F03", x_tipo_programa: "recorrida_semanal", x_estado: "programada", x_fecha_vencimiento: "2026-10-17 02:59:00" };
  const { recibir, db } = armar({ registros: [prog] });
  const r = await recibir(f03());
  assert.notEqual(r.cuerpo.id, 50);
  assert.equal(db.find((x) => x.id === 50).x_estado, "programada");
});

test("fuera_programa explícito: vence al hacerse y no completa la programada", async () => {
  const prog = { id: 50, x_name: "F03 programada", x_formulario: "F03", x_tipo_programa: "recorrida_semanal", x_estado: "programada", x_fecha_vencimiento: "2026-10-24 02:59:00" };
  const { recibir, db } = armar({ registros: [prog] });
  await recibir(f03({ tipo: "fuera_programa" }));
  assert.equal(db.find((x) => x.id === 50).x_estado, "programada");
  assert.equal(db[1].x_fecha_vencimiento, "2026-10-21 12:00:00");
});

test("día de vencimiento desde config (miércoles) y respaldo si el catálogo falla", async () => {
  const { recibir, db } = armar({ config: { ...CONFIG, x_f03_dia_vence: "mie" }, items: "falla" });
  await recibir(f03());
  assert.equal(db[0].x_fecha_vencimiento, "2026-10-22 02:59:00");
});

test("antes del paso 1 (config sin campos nuevos): viernes por defecto, sin validador, igual se guarda", async () => {
  const { recibir, db } = armar({ camposConfig: { x_name: {} } });
  await recibir(f03());
  assert.equal(db[0].x_fecha_vencimiento, "2026-10-24 02:59:00");
  assert.equal(db[0].x_validador_id, undefined);
});

test("F04 Fábrica y Oficina: ítems por lugar, vence el día 7, validador Fábrica / COO, uno por mes y lugar", async () => {
  const { recibir, db } = armar();
  await recibir(f04());
  await recibir(f04({ lugar: "oficina" }));
  assert.equal(db[0].x_fecha_vencimiento, "2026-10-08 02:59:00");
  assert.equal(db[0].x_validador_id, 32);
  assert.equal(db[1].x_validador_id, 33);
  assert.equal(db[1].x_linea_ids.length, 8);
  const r = await recibir(f04({ fecha: "2026-10-20 12:00:00" }));
  assert.equal(r.cuerpo.fuera_programa, true);
  const mal = f04(); mal.odoo.vals.x_linea_ids = lineas("F03");
  await assert.rejects(recibir(mal), (e) => e.estado === 422 && /no es de F04_FAB/.test(e.message));
});

test("F04 completa la programada del mes de SU lugar; la de otro lugar no se toca; el 2.º del mes → fuera_programa", async () => {
  const base = { x_formulario: "F04", x_tipo_programa: "check_mensual", x_estado: "programada", x_fecha_vencimiento: "2026-10-08 02:59:00", x_validacion_estado: "no_aplica" };
  const progOfi = { ...base, id: 60, x_name: "F04 programada · Oficina", x_ambito: "oficina", x_lugar: "oficina" };
  const progFab = { ...base, id: 61, x_name: "F04 programada · Fábrica", x_ambito: "fabrica", x_lugar: "fabrica" };
  const { recibir, db } = armar({ registros: [progOfi, progFab] });
  const r = await recibir(f04());
  assert.equal(r.cuerpo.programada_completada, 61);
  assert.equal(db.find((x) => x.id === 61).x_estado, "realizada");
  assert.equal(db.find((x) => x.id === 60).x_estado, "programada");
  assert.equal(db.find((x) => x.id === 61).x_validador_id, 32);
  const r2 = await recibir(f04({ fecha: "2026-10-15 12:00:00" }));
  assert.equal(r2.cuerpo.fuera_programa, true);
  assert.ok(r2.cuerpo.aviso);
  const r3 = await recibir(f04({ lugar: "oficina" }));
  assert.equal(r3.cuerpo.programada_completada, 60);
  assert.equal(db.find((x) => x.id === 60).x_validador_id, 33);
});

test("catálogo F03: ítems, sectores (Depósito Central), TC precargada editable y aviso de la semana", async () => {
  const f = odooFalso({ registros: [{ id: 1, x_formulario: "F03", x_tipo_programa: "recorrida_semanal", x_estado: "realizada", x_fecha_vencimiento: "2026-10-24 02:59:00" }] });
  const p = crearPlanta(() => f.cliente, { ahora: () => Date.parse("2026-10-22T15:00:00Z") });
  const c = await p.catalogo("F03");
  assert.equal(c.items.length, 18); assert.equal(c.fuente_items, "respaldo");
  assert.deepEqual(c.sectores.at(-1), ["recepcion_deposito", "Depósito Central"]);
  assert.deepEqual(c.toma_conocimiento, { nombre: "Jefe de Producción Ejemplo", editable: true, aviso: null });
  assert.equal(c.periodo.realizada, true); assert.match(c.periodo.aviso, /fuera de programa/);
  assert.equal(c.periodo.vence, "2026-10-24 02:59:00");
  assert.equal((await p.catalogo("F04", "oficina")).items.length, 8);
  assert.equal(await p.catalogo("F05"), null);
});

// ---- Roles vacíos (todavía sin usuarios) y responsables por sector
const VACIA = { id: 1, x_jefe_produccion_id: false, x_validador_fabrica_id: false, x_coo_id: false, x_f03_dia_vence: "vie", x_f04_dia_vence: 7 };

test("roles vacíos: catálogo sin TC precargada (texto libre) con aviso, sin validador con aviso", async () => {
  const f = odooFalso({ config: VACIA });
  const p = crearPlanta(() => f.cliente, { ahora: () => Date.parse("2026-10-21T12:00:00Z") });
  const c = await p.catalogo("F03");
  assert.equal(c.toma_conocimiento.nombre, null);
  assert.equal(c.toma_conocimiento.editable, true);
  assert.match(c.toma_conocimiento.aviso, /Jefe de Producción/);
  assert.equal(c.validador, null);
  assert.equal(c.avisos.length, 2);
  assert.deepEqual(c.responsables_sector.pintura, { toma_conocimiento: { nombre: null, fuente: null }, responsable: { id: null, nombre: null, fuente: null } });
});

test("roles vacíos: la recorrida se guarda sin x_validador_id, pendiente, y la respuesta avisa (sin error)", async () => {
  const { recibir, db } = armar({ config: VACIA });
  const NO = { x_respuesta: "no", x_criticidad: "mayor", x_foto: "AAAA", x_sector: "pintura" };
  const r = await recibir(f03({ mod: { "F03-01": NO } }));
  assert.equal(r.estado, 201);
  const ins = db.find((x) => x.x_formulario === "F03");
  assert.equal(ins.x_validador_id, undefined);
  assert.equal(ins.x_validacion_estado, "pendiente");
  assert.equal(ins.x_tc_nombre, "Reemplazo Ejemplo");
  assert.equal(r.cuerpo.sin_validador, true);
  assert.match(r.cuerpo.aviso, /Dirección de Fábrica/);
  assert.deepEqual(r.cuerpo.responsables_sector, { pintura: null });
});

test("F04 Oficina sin COO: se guarda sin validador y avisa", async () => {
  const { recibir } = armar({ config: VACIA });
  const r = await recibir(f04({ lugar: "oficina" }));
  assert.equal(r.estado, 201);
  assert.match(r.cuerpo.aviso, /COO/);
});

test("responsables por sector: se usan si están; si no, Jefe de Producción; la línea lleva x_responsable_id si el campo existe", async () => {
  const sectores = [{ id: 1, x_sector: "pintura", x_tc_usuario_id: false, x_tc_nombre: "Encargado Pintura Ejemplo", x_responsable_id: [41, "Responsable Pintura Ejemplo"] },
    { id: 2, x_sector: "aluminio", x_tc_usuario_id: false, x_tc_nombre: false, x_responsable_id: false }];
  const f = odooFalso({ sectores });
  const p = crearPlanta(() => f.cliente, { ahora: () => Date.parse("2026-10-21T12:00:00Z") });
  const c = await p.catalogo("F03");
  assert.equal(c.responsables_sector.pintura.toma_conocimiento.nombre, "Encargado Pintura Ejemplo");
  assert.equal(c.responsables_sector.pintura.responsable.id, 41);
  assert.equal(c.responsables_sector.aluminio.responsable.fuente, "jefe_produccion");
  assert.equal(c.toma_conocimiento.nombre, "Jefe de Producción Ejemplo");

  const { recibir, db } = armar({ sectores, camposLinea: { ...CAMPOS.x_hys_inspeccion_linea, x_responsable_id: {} } });
  const NO = { x_respuesta: "no", x_criticidad: "mayor", x_foto: "AAAA" };
  const r = await recibir(f03({ mod: { "F03-01": { ...NO, x_sector: "pintura" }, "F03-02": { ...NO, x_sector: "aluminio" } } }));
  assert.equal(r.estado, 201);
  assert.deepEqual(r.cuerpo.responsables_sector, { pintura: "Responsable Pintura Ejemplo", aluminio: "Jefe de Producción Ejemplo" });
  assert.equal(r.cuerpo.sin_validador, undefined);
  const ls = db.filter((x) => x.x_respuesta === "no");
  const ins = db.find((x) => x.x_formulario === "F03");
  const lin = ls.length ? ls : ins.x_linea_ids.map(([, , l]) => l).filter((l) => l.x_respuesta === "no");
  assert.deepEqual(lin.map((l) => l.x_responsable_id).sort(), [31, 41]);
});

test("sin el campo x_responsable_id en la línea: no se manda (no rompe)", async () => {
  const sectores = [{ id: 1, x_sector: "pintura", x_tc_usuario_id: false, x_tc_nombre: false, x_responsable_id: [41, "Responsable Pintura Ejemplo"] }];
  const { recibir, db } = armar({ sectores });
  const r = await recibir(f03({ mod: { "F03-01": { x_respuesta: "no", x_criticidad: "mayor", x_foto: "AAAA", x_sector: "pintura" } } }));
  assert.equal(r.estado, 201);
  const ins = db.find((x) => x.x_formulario === "F03");
  assert.ok(ins.x_linea_ids.every(([, , l]) => l.x_responsable_id === undefined));
});
