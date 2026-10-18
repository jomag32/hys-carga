import test from "node:test";
import assert from "node:assert/strict";
import { crearInspecciones, numeroDe, formatoNumero } from "./inspecciones.js";

// Odoo simulado en memoria: x_hys_inspeccion con search_read (=, ilike), create, write y fields_get.
const S = (...v) => ({ type: "selection", selection: v.map((x) => [x, x]) });
const CAMPOS = {
  x_hys_inspeccion: { x_name: {}, x_formulario: S("F02"), x_ambito: S("obra", "fabrica"), x_tipo_programa: S("periodica", "hito_critico"),
    x_estado: S("realizada"), x_origen: S("formulario"), x_gps_estado: S("ok", "denegado"), x_ot_id: {}, x_hito_id: {}, x_inspector_hys_id: {},
    x_inspector_texto: {}, x_tc_nombre: {}, x_tc_firma: { type: "binary" }, x_fecha_hora_control: {}, x_idempotency_key: {}, x_cargado_por: {}, x_linea_ids: {} },
  x_hys_inspeccion_linea: { x_name: {}, x_bloque: {}, x_respuesta: S("si", "no", "na"), x_criticidad: S("critico"), x_foto: { type: "binary" }, x_inspeccion_id: {} }
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function odooFalso({ registros = [], demora = 5, alCrear = null } = {}) {
  const db = registros.map((r) => ({ ...r }));
  let sig = Math.max(0, ...db.map((r) => r.id)) + 1;
  const llamadas = [];
  const cumple = (r, [campo, op, val]) => {
    const v = r[campo];
    if (op === "=") return v === val;
    if (op === "ilike") return String(v ?? "").toLowerCase().includes(String(val).toLowerCase());
    throw new Error(`op no simulada ${op}`);
  };
  async function ejecutar(modelo, metodo, args = [], kwargs = {}) {
    llamadas.push({ modelo, metodo, args, kwargs });
    await espera(Math.random() * demora); // intercalado real entre envíos simultáneos
    if (metodo === "fields_get") return CAMPOS[modelo];
    if (modelo === "x_hys_inspector") return [{ id: 9, x_name: "Inspector Ejemplo", x_legajo: "1", x_tipo: "interno" }];
    if (metodo === "search_read") {
      const r = db.filter((x) => args[0].every((d) => cumple(x, d))).map((x) => ({ id: x.id, x_name: x.x_name, x_idempotency_key: x.x_idempotency_key }));
      return kwargs.limit ? r.slice(0, kwargs.limit) : r;
    }
    if (metodo === "create") {
      const reg = { id: sig++, ...args[0][0] };
      db.push(reg);
      if (alCrear) await alCrear(reg, db, () => sig++);
      return [reg.id];
    }
    if (metodo === "write") { for (const id of args[0]) Object.assign(db.find((x) => x.id === id), args[1]); return true; }
    throw new Error(`método no simulado ${metodo}`);
  }
  return { cliente: { ejecutar }, db, llamadas };
}

let n = 0;
const clave = () => `6f1c2a9e-1111-4222-8333-${String(++n).padStart(12, "0")}`;
const cuerpo = (k = clave(), fecha = "2026-10-18 12:00:00") => ({ formulario: "F02", idempotency_key: k, odoo: { model: "x_hys_inspeccion", method: "create", vals: {
  x_formulario: "F02", x_ambito: "obra", x_tipo_programa: "periodica", x_ot_id: 6, x_inspector_hys_id: 9, x_tc_nombre: "Capataz",
  x_tc_firma: "AAAA", x_fecha_hora_control: fecha, x_gps_estado: "denegado", x_idempotency_key: k, x_cargado_por: "EJ-001 · Usuario Ejemplo",
  x_linea_ids: [[0, 0, { x_name: "Ítem", x_bloque: "General", x_respuesta: "si" }]] } },
  contexto: { cargado_por_inspector_id: 10, lugar: "OT 9101" } });
// Inspectores activos de ejemplo: 9 (el elegido en el formulario) y 10 (quien carga). 11 = archivado.
const ACTIVOS = { 9: { id: 9, x_name: "Inspector Ejemplo", x_legajo: "1" }, 10: { id: 10, x_name: "Cargador Ejemplo", x_legajo: "2" } };
const catalogosFalsos = { buscarInspector: async (id) => ACTIVOS[id] || null };
const conSesion = (api, sesion = { inspector_id: 10 }) => ({ ...api, recibir: (c, o = {}) => api.recibir(c, { sesion, ...o }) });
const armar = (o) => { const f = odooFalso(o); return { ...f, api: conSesion(crearInspecciones(() => f.cliente, catalogosFalsos)) }; };
const nombres = (db) => db.map((r) => r.x_name).sort();

test("numeroDe / formatoNumero", () => {
  assert.equal(numeroDe("INS-2026-00012", "2026"), 12);
  assert.equal(numeroDe("PRUEBA - borrar (INS-2026-00001)", "2026"), 1);
  assert.equal(numeroDe("INS-2025-00012", "2026"), null);
  assert.equal(numeroDe("otra cosa", "2026"), null);
  assert.equal(formatoNumero("2026", 7), "INS-2026-00007");
  assert.equal(formatoNumero("2026", 123456), "INS-2026-123456");
});

test("vacío → INS-AAAA-00001; el siguiente es 00002", async () => {
  const { api } = armar();
  assert.equal((await api.recibir(cuerpo())).cuerpo.name, "INS-2026-00001");
  assert.equal((await api.recibir(cuerpo())).cuerpo.name, "INS-2026-00002");
});

test("máximo, no conteo: con huecos sigue después del mayor", async () => {
  const { api } = armar({ registros: [{ id: 1, x_name: "INS-2026-00003" }, { id: 2, x_name: "INS-2026-00010" }] });
  assert.equal((await api.recibir(cuerpo())).cuerpo.name, "INS-2026-00011");
});

test("cuenta los nombres de prueba con prefijo (causa del INS-2026-00001 duplicado)", async () => {
  const { api } = armar({ registros: [{ id: 2, x_name: "PRUEBA - borrar (INS-2026-00001)" }] });
  assert.equal((await api.recibir(cuerpo())).cuerpo.name, "INS-2026-00002");
});

test("comparación numérica: 100000 > 99999", async () => {
  const { api } = armar({ registros: [{ id: 1, x_name: "INS-2026-99999" }, { id: 2, x_name: "INS-2026-100000" }] });
  assert.equal((await api.recibir(cuerpo())).cuerpo.name, "INS-2026-100001");
});

test("por año del control: otro año empieza en 00001", async () => {
  const { api } = armar({ registros: [{ id: 1, x_name: "INS-2026-00040" }] });
  assert.equal((await api.recibir(cuerpo(clave(), "2027-01-02 09:00:00"))).cuerpo.name, "INS-2027-00001");
  assert.equal((await api.recibir(cuerpo(clave(), "2026-12-31 23:00:00"))).cuerpo.name, "INS-2026-00041");
});

test("20 envíos simultáneos con claves distintas → 20 números distintos y correlativos", async () => {
  const { api, db } = armar({ demora: 10 });
  const r = await Promise.all(Array.from({ length: 20 }, () => api.recibir(cuerpo())));
  assert.ok(r.every((x) => x.estado === 201));
  const esperados = Array.from({ length: 20 }, (_, i) => formatoNumero("2026", i + 1));
  assert.deepEqual(nombres(db), esperados);
  assert.deepEqual(r.map((x) => x.cuerpo.name).sort(), esperados);
});

test("misma clave enviada a la vez y después → un solo registro", async () => {
  const { api, db } = armar();
  const k = clave();
  const [a, b] = await Promise.all([api.recibir(cuerpo(k)), api.recibir(cuerpo(k))]);
  const c = await api.recibir(cuerpo(k));
  assert.equal(db.length, 1);
  assert.equal(a.cuerpo.id, b.cuerpo.id);
  assert.equal(c.estado, 200);
  assert.equal(c.cuerpo.repetido, true);
});

test("choque con un registro creado por fuera al mismo tiempo → se renumera el nuestro", async () => {
  // Otro proceso crea INS-2026-00001 (id menor) entre nuestra lectura del máximo y nuestro create.
  const f = armar({
    alCrear: async (reg, db, nuevoId) => {
      if (db.some((x) => x.externo)) return;
      const ext = { id: reg.id, x_name: reg.x_name, externo: true };
      reg.id = nuevoId();
      db.push(ext);
    }
  });
  const r = await f.api.recibir(cuerpo());
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.name, "INS-2026-00002");
  assert.deepEqual(nombres(f.db), ["INS-2026-00001", "INS-2026-00002"]);
  assert.ok(f.llamadas.some((l) => l.metodo === "write"));
});

test("error de unicidad en create → reintenta con el siguiente número", async () => {
  const f = odooFalso({ registros: [] });
  let primera = true;
  const { ErrorOdoo } = await import("./odoo.js");
  const cliente = { ejecutar: async (m, met, args, kw) => {
    if (met === "create" && primera) { primera = false; f.db.push({ id: 50, x_name: args[0][0].x_name }); throw new ErrorOdoo("Odoo: error", { tipo: "psycopg2.errors.UniqueViolation", detalle: "duplicate key value violates unique constraint" }); }
    return f.cliente.ejecutar(m, met, args, kw);
  } };
  const api = conSesion(crearInspecciones(() => cliente, catalogosFalsos));
  const r = await api.recibir(cuerpo());
  assert.equal(r.cuerpo.name, "INS-2026-00002");
});

test("con prefijo de prueba: «PRUEBA - borrar (INS-…)» y numeración correlativa", async () => {
  process.env.INSPECCION_PREFIJO_PRUEBA = "PRUEBA - borrar";
  try {
    const { api } = armar({ registros: [{ id: 1, x_name: "INS-2026-00004" }] });
    assert.equal((await api.recibir(cuerpo())).cuerpo.name, "PRUEBA - borrar (INS-2026-00005)");
    assert.equal((await api.recibir(cuerpo())).cuerpo.name, "PRUEBA - borrar (INS-2026-00006)");
  } finally { delete process.env.INSPECCION_PREFIJO_PRUEBA; }
});

test("pide también archivados (active_test: false)", async () => {
  const { api, llamadas } = armar();
  await api.recibir(cuerpo());
  assert.ok(llamadas.some((l) => l.metodo === "search_read" && l.args[0][0][1] === "ilike" && l.kwargs.context?.active_test === false));
});

test("quien carga: x_cargado_por lo arma el servidor con el inspector activo", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo());
  assert.equal(db[0].x_cargado_por, "Legajo 2 · Cargador Ejemplo · Inspector HyS · OT 9101");
});

test("quien carga: sin sesión → 401; inspector de la sesión archivado → 422; no se crea nada", async () => {
  const f = odooFalso();
  const api = crearInspecciones(() => f.cliente, catalogosFalsos);
  await assert.rejects(api.recibir(cuerpo()), (e) => e.estado === 401 && /sesión/.test(e.message));
  await assert.rejects(api.recibir(cuerpo(), { sesion: { inspector_id: 11 } }), (e) => e.estado === 422 && /inspector activo/.test(e.message));
  assert.equal(f.db.length, 0);
});

test("quien carga sale de la sesión, no del cuerpo", async () => {
  const f = odooFalso();
  const api = crearInspecciones(() => f.cliente, catalogosFalsos);
  const c = cuerpo(); c.contexto.cargado_por_inspector_id = 9; // intento de cargar «como» otro
  await api.recibir(c, { sesion: { inspector_id: 10 } });
  assert.match(f.db[0].x_cargado_por, /^Legajo 2 · Cargador Ejemplo/);
});
