import test from "node:test";
import assert from "node:assert/strict";
import { crearIngreso, leerClaves, normalizarClave, SIN_CLAVE } from "./ingreso.js";
import { crearInspecciones } from "./inspecciones.js";

// Inspectores de EJEMPLO (repo público): 2 = legajo 0001, 3 = legajo 0002, 5 = activo sin contraseña, 4 = archivado.
const INSP = { 2: { id: 2, x_name: "Inspector Ejemplo Uno", x_legajo: "0001" }, 3: { id: 3, x_name: "Inspector Ejemplo Dos", x_legajo: "0002" },
  5: { id: 5, x_name: "Inspector Ejemplo Sin Clave", x_legajo: "0005" } };
const catalogos = { buscarInspector: async (id) => INSP[id] || null, fichaDeOt: async () => null };
// Contraseñas de EJEMPLO (las reales viven solo en Render); la primera con «ñ» compuesta (NFC).
const ENV = { HYS_PWD_0001: "pe\u00f1a-uno", HYS_PWD_0002: "dos-ejemplo" };
const nuevo = (env = ENV, extra = {}) => crearIngreso({ catalogos, claves: () => leerClaves(env), secreto: "secreto-de-prueba", ...extra });
const rechaza = (p, estado, re) => assert.rejects(p, (e) => e.estado === estado && (!re || re.test(e.message)));

test("cada inspector entra solo con SU contraseña", async () => {
  const g = nuevo();
  const a = await g.ingresar({ inspector_id: 2, clave: "peña-uno" });
  assert.equal(a.inspector.id, 2); assert.ok(a.token);
  const b = await g.ingresar({ inspector_id: 3, clave: "dos-ejemplo" });
  assert.equal(b.inspector.id, 3);
  assert.deepEqual(g.verificar(a.token), { inspector_id: 2, legajo: "1" });
  assert.deepEqual(g.verificar(b.token), { inspector_id: 3, legajo: "2" });
});

test("cruzadas fallan: 0001 con la de 0002 y viceversa; vacía falla", async () => {
  const g = nuevo();
  await rechaza(g.ingresar({ inspector_id: 2, clave: "dos-ejemplo" }), 401, /incorrecta/);
  await rechaza(g.ingresar({ inspector_id: 3, clave: "peña-uno" }), 401, /incorrecta/);
  await rechaza(g.ingresar({ inspector_id: 2, clave: "" }), 401);
  await rechaza(g.ingresar({ inspector_id: 3, clave: "   " }), 401);
  await rechaza(g.ingresar({ inspector_id: 2 }), 401);
  await rechaza(g.ingresar({ inspector_id: 2, clave: "PEÑA-UNO" }), 401); // distingue mayúsculas
});

test("ñ: compuesta (NFC) o descompuesta (NFD, n + ◌̃) y espacios en las puntas → entra", async () => {
  const g = nuevo();
  const nfd = "pe\u006e\u0303a-uno";
  assert.notEqual(nfd, "pe\u00f1a-uno");
  assert.equal(normalizarClave(nfd), "pe\u00f1a-uno");
  assert.ok((await g.ingresar({ inspector_id: 2, clave: nfd })).token);
  assert.ok((await g.ingresar({ inspector_id: 2, clave: " peña-uno " })).token);
  // y también si la variable de entorno quedó en NFD
  const g2 = nuevo({ HYS_PWD_0001: nfd });
  assert.ok((await g2.ingresar({ inspector_id: 2, clave: "pe\u00f1a-uno" })).token);
});

test("sin contraseña configurada / archivado / sin legajo → no entra, con mensaje claro", async () => {
  const g = nuevo();
  await rechaza(g.ingresar({ inspector_id: 5, clave: "loquesea" }), 403, new RegExp(SIN_CLAVE));
  assert.equal(SIN_CLAVE, "Este inspector no tiene contraseña configurada, consultá a HyS");
  await rechaza(g.ingresar({ inspector_id: 4, clave: "x" }), 403, /no está activo/);
  await rechaza(nuevo({}).ingresar({ inspector_id: 2, clave: "peña-uno" }), 403, new RegExp(SIN_CLAVE));
});

test("HYS_LOGIN_PASSWORDS (JSON) también sirve; HYS_PWD_<legajo> gana; legajo 1 = 0001", async () => {
  const g = nuevo({ HYS_LOGIN_PASSWORDS: JSON.stringify({ "1": "uno", "0002": "dos" }), HYS_PWD_0002: "dos-bis" });
  assert.ok(await g.ingresar({ inspector_id: 2, clave: "uno" }));
  await rechaza(g.ingresar({ inspector_id: 3, clave: "dos" }), 401);
  assert.ok(await g.ingresar({ inspector_id: 3, clave: "dos-bis" }));
  assert.equal(leerClaves({ HYS_LOGIN_PASSWORDS: "{roto" }).size, 0);
});

test("token: alterado, vencido o con contraseña cambiada → no vale", async () => {
  let t0 = Date.now();
  let env = { ...ENV };
  const g = crearIngreso({ catalogos, claves: () => leerClaves(env), secreto: "s", ahora: () => t0 });
  const { token } = await g.ingresar({ inspector_id: 2, clave: "peña-uno" });
  assert.ok(g.verificar(token));
  const [datos, firma] = token.split(".");
  const otro = Buffer.from(JSON.stringify({ i: 3, l: "1", e: t0 + 1e9 })).toString("base64url");
  assert.equal(g.verificar(`${otro}.${firma}`), null);           // se hace pasar por otro
  assert.equal(g.verificar(`${datos}.x${firma.slice(1)}`), null); // firma tocada
  assert.equal(g.verificar(""), null);
  env = { ...ENV, HYS_PWD_0001: "nueva" };
  assert.equal(g.verificar(token), null);                         // cambió la contraseña
  env = { ...ENV };
  t0 += 61 * 24 * 3600 * 1000;
  assert.equal(g.verificar(token), null);                         // venció (60 días)
});

test("8 fallos seguidos → bloqueo de 15 min para ese inspector (no para el otro)", async () => {
  let t0 = Date.now();
  const g = nuevo(ENV, { ahora: () => t0 });
  for (let i = 0; i < 8; i++) await rechaza(g.ingresar({ inspector_id: 2, clave: "mal" }), 401);
  await rechaza(g.ingresar({ inspector_id: 2, clave: "peña-uno" }), 429);
  assert.ok(await g.ingresar({ inspector_id: 3, clave: "dos-ejemplo" }));
  t0 += 16 * 60 * 1000;
  assert.ok(await g.ingresar({ inspector_id: 2, clave: "peña-uno" }));
});

test("de punta a punta: el inspector que ingresó queda en «cargado por»", async () => {
  const g = nuevo();
  const db = [];
  const cliente = { ejecutar: async (m, met, args) => {
    if (met === "fields_get") return m === "x_hys_inspeccion"
      ? Object.fromEntries(["x_name", "x_formulario", "x_ambito", "x_tipo_programa", "x_estado", "x_origen", "x_gps_estado", "x_ot_id", "x_hito_id", "x_inspector_hys_id",
        "x_inspector_texto", "x_tc_nombre", "x_tc_firma", "x_fecha_hora_control", "x_idempotency_key", "x_cargado_por", "x_linea_ids"].map((k) => [k,
        { x_formulario: { selection: [["F02", "F02"]] }, x_ambito: { selection: [["obra", "o"]] }, x_tipo_programa: { selection: [["periodica", "p"]] },
          x_estado: { selection: [["realizada", "r"]] }, x_origen: { selection: [["formulario", "f"]] }, x_gps_estado: { selection: [["denegado", "d"]] }, x_tc_firma: { type: "binary" } }[k] || {}]))
      : { x_name: {}, x_bloque: {}, x_respuesta: { selection: [["si", "s"], ["no", "n"], ["na", "na"]] }, x_inspeccion_id: {} };
    if (met === "search_read") return db.filter((r) => args[0].every(([c, op, v]) => op === "=" ? r[c] === v : String(r[c]).includes(v)));
    if (met === "create") { db.push({ id: db.length + 1, ...args[0][0] }); return [db.length]; }
    if (met === "write") return true;
  } };
  const api = crearInspecciones(() => cliente, catalogos);
  const K = "6f1c2a9e-1111-4222-8333-999999999999";
  const cuerpo = { formulario: "F02", idempotency_key: K, contexto: { lugar: "OT 9101" }, odoo: { model: "x_hys_inspeccion", method: "create", vals: {
    x_formulario: "F02", x_ambito: "obra", x_tipo_programa: "periodica", x_ot_id: 6, x_inspector_hys_id: 2, x_tc_nombre: "Capataz", x_tc_firma: "AAAA",
    x_fecha_hora_control: "2026-10-19 12:00:00", x_gps_estado: "denegado", x_idempotency_key: K, x_cargado_por: "lo que mande el celular",
    x_linea_ids: [[0, 0, { x_name: "Ítem", x_bloque: "General", x_respuesta: "si" }]] } } };
  const { token } = await g.ingresar({ inspector_id: 3, clave: "dos-ejemplo" });
  await api.recibir(cuerpo, { sesion: g.verificar(token) });
  assert.equal(db[0].x_cargado_por, "Legajo 0002 · Inspector Ejemplo Dos · Inspector HyS · OT 9101");
});

test("encargado de sector activo con HYS_PWD_<legajo> entra; sin la variable, no", async () => {
  const cat = { buscarInspector: async (id) => (id === 7 ? { id: 7, x_name: "Encargado Ejemplo", x_legajo: "0004", x_rol: "encargado", x_sector: "deposito" } : null) };
  const g = crearIngreso({ catalogos: cat, claves: () => leerClaves({ HYS_PWD_0004: "clave-ejemplo" }), secreto: "s" });
  const r = await g.ingresar({ inspector_id: 7, clave: "clave-ejemplo" });
  assert.deepEqual(g.verificar(r.token), { inspector_id: 7, legajo: "4" });
  const sin = crearIngreso({ catalogos: cat, claves: () => leerClaves({}), secreto: "s" });
  await rechaza(sin.ingresar({ inspector_id: 7, clave: "x" }), 403);
});
