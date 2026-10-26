import test from "node:test";
import assert from "node:assert/strict";
import { calcularVencimiento, armarDesvio, crearDesvios, esPrueba, leerPlazos } from "./desvios.js";

const D = new Date("2026-10-23T15:00:00-03:00"); // viernes
test("plazos por gravedad (diseño §3.3)", () => {
  assert.equal(calcularVencimiento("critico", D).toISOString(), "2026-10-24T18:00:00.000Z");
  assert.equal(calcularVencimiento("menor", D).toISOString(), "2026-11-07T18:00:00.000Z");
  assert.equal(calcularVencimiento("mayor", D).toISOString(), "2026-10-28T18:00:00.000Z"); // vie + 5 corridos = mié
  assert.equal(calcularVencimiento("mayor", D, { mayor: { dias_habiles: 5 } }).toISOString(), "2026-10-30T18:00:00.000Z"); // compatibilidad
  assert.equal(leerPlazos({ DESVIO_PLAZOS: '{"menor":{"dias":10}}' }).menor.dias, 10);
});
test("armado desde línea de inspección y ATS", () => {
  const v = armarDesvio({ tipo: "inspeccion", ficha: { id: 5, x_formulario: "F03", x_ambito: "fabrica", x_ot_id: false, x_fecha_hora_control: "2026-10-23 18:00:00" },
    linea: { id: 9, x_name: "Matafuegos", x_item_codigo: "F03-1", x_criticidad: "critico", x_foto: "b64", x_sector: "pintura", x_responsable_id: [7, "X"] } });
  assert.equal(v.x_origen_formulario, "F03"); assert.equal(v.x_linea_id, 9); assert.equal(v.x_idempotency_key, "ins-linea-9");
  assert.equal(v.x_fecha_vencimiento, "2026-10-24 18:00:00"); assert.equal(v.x_responsable_id, 7); assert.match(v.x_descripcion, /\[F03-1\]/);
  const a = armarDesvio({ tipo: "ats", ficha: { id: 3, x_sector: "logistica", x_fecha_hora_control: "2026-10-23 18:00:00" }, linea: { id: 4, x_name: "x", x_criticidad: "mayor" } });
  assert.equal(a.x_origen_formulario, "F08"); assert.equal(a.x_ambito, "logistica"); assert.equal(a.x_ats_id, 3);
});
test("pruebas no generan desvíos", () => { assert.ok(esPrueba("PRUEBA - borrar (INS-1)", {})); assert.ok(!esPrueba("INS-2026-00004", {})); });

function falso(datos) {
  const creados = [], escritos = [];
  const cli = () => ({ async ejecutar(mo, me, args) {
    if (me === "read") return [datos[mo]];
    if (mo === "x_hys_inspector") return [{ id: 1, x_name: "Ej", x_legajo: "1", x_rol: datos.rol || "inspector" }];
    if (mo === "x_hys_inspeccion_linea") return datos.lineas;
    if (mo === "x_hys_desvio" && me === "search_read") { const ks = args[0][0][2]; return datos.desvios.filter((d) => ks.includes(d.x_idempotency_key)); }
    if (me === "create") { creados.push(args[0][0]); datos.desvios.push(args[0][0]); return [100 + creados.length]; }
    if (me === "write") { escritos.push(args[1]); return true; }
  } });
  return { cli, creados, escritos };
}
test("generar es idempotente", async () => {
  const datos = { x_hys_inspeccion: { id: 5, x_name: "INS-2026-00009", x_formulario: "F02", x_ambito: "obra", x_ot_id: [2, "OT"], x_fecha_hora_control: "2026-10-23 18:00:00" },
    lineas: [{ id: 9, x_name: "a", x_criticidad: "menor" }, { id: 10, x_name: "b", x_criticidad: "mayor" }], desvios: [] };
  const f = falso(datos);
  const dv = crearDesvios(f.cli);
  assert.equal((await dv.generar("inspeccion", 5)).creados.length, 2);
  assert.equal((await dv.generar("inspeccion", 5)).creados.length, 0);
});
test("cierre: foto obligatoria, solo HyS, idempotente", async () => {
  const UU = "11111111-2222-4333-8444-555555555555";
  const datos = { desvios: [] };
  const mk = (d, rol) => () => ({ async ejecutar(mo, me) {
    if (mo === "x_hys_inspector") return [{ id: 1, x_name: "Ej", x_legajo: "1", x_rol: rol }];
    if (me === "search_read") return [d]; if (me === "write") { Object.assign(d, { x_estado: "cerrado", x_cierre_idempotency_key: UU }); return true; } } });
  const d = { id: 8, x_name: "D-00001", x_estado: "abierto", x_fecha_vencimiento: "2030-01-01 00:00:00" };
  const s = { sesion: { inspector_id: 1 } };
  await assert.rejects(crearDesvios(mk(d, "encargado")).cerrar(8, {}, s), (e) => e.estado === 403);
  const dv = crearDesvios(mk(d, "inspector"));
  await assert.rejects(dv.cerrar(8, { idempotency_key: UU, que_se_hizo: "x" }, s), (e) => e.estado === 422);
  const r = await dv.cerrar(8, { idempotency_key: UU, que_se_hizo: "Se colocó baranda", foto_cierre: "data:image/jpeg;base64,AAA" }, s);
  assert.equal(r.cuerpo.cerrado_en_plazo, true);
  assert.equal((await dv.cerrar(8, { idempotency_key: UU }, s)).cuerpo.repetido, true);
  void datos;
});
test("ATS enlaza la línea y guarda el código del ítem", () => {
  const a = armarDesvio({ tipo: "ats", ficha: { id: 3, x_sector: "deposito" }, linea: { id: 4, x_name: "x", x_item_codigo: "ATS-2", x_criticidad: "menor" } });
  assert.equal(a.x_ats_linea_id, 4); assert.equal(a.x_item_codigo, "ATS-2");
});
test("cierre de un desvío vencido o en curso, con firma opcional", async () => {
  const UU = "21111111-2222-4333-8444-555555555555";
  for (const est of ["vencido", "en_curso"]) {
    const d = { id: 9, x_name: "D-00002", x_estado: est, x_fecha_vencimiento: "2020-01-01 00:00:00" }; let w;
    const cli = () => ({ async ejecutar(mo, me, args) {
      if (mo === "x_hys_inspector") return [{ id: 1, x_name: "Ej", x_legajo: "1", x_rol: "inspector" }];
      if (me === "search_read") return [d]; if (me === "write") { w = args[1]; return true; } } });
    const r = await crearDesvios(cli).cerrar(9, { idempotency_key: UU, que_se_hizo: "ok", foto_cierre: "AAA", firma_cierre: "data:image/png;base64,FFF" }, { sesion: { inspector_id: 1 } });
    assert.equal(r.cuerpo.cerrado_en_plazo, false); assert.equal(w.x_firma_cierre, "FFF"); assert.equal(w.x_estado, "cerrado");
  }
  const c = { id: 9, x_name: "D-3", x_estado: "anulado" };
  const cli = () => ({ async ejecutar(mo) { if (mo === "x_hys_inspector") return [{ id: 1, x_name: "Ej", x_legajo: "1", x_rol: "inspector" }]; return [c]; } });
  await assert.rejects(crearDesvios(cli).cerrar(9, { idempotency_key: UU, que_se_hizo: "ok", foto_cierre: "A" }, { sesion: { inspector_id: 1 } }), (e) => e.estado === 409);
});
