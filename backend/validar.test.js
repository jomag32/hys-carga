import test from "node:test";
import assert from "node:assert/strict";
import { validarYFiltrar } from "./validar.js";
import { textoInspector } from "./catalogos.js";

const S = (...v) => ({ type: "selection", selection: v.map((x) => [x, x]) });
const C = {
  inspeccion: { x_formulario: S("F02"), x_ambito: S("obra", "fabrica"), x_tipo_programa: S("periodica", "hito_critico"), x_estado: S("realizada"),
    x_origen: S("formulario"), x_gps_estado: S("ok", "denegado"), x_ot_id: {}, x_hito_id: {}, x_inspector_id: {}, x_inspector_hys_id: {}, x_inspector_texto: {}, x_tc_nombre: {}, x_tc_firma: { type: "binary" },
    x_fecha_hora_control: {}, x_gps_fecha: {}, x_gps_lat: {}, x_gps_lon: {}, x_idempotency_key: {}, x_cargado_por: {}, x_linea_ids: {},
    x_cant_no: { readonly: true }, x_validacion_estado: S("no_aplica") },
  linea: { x_name: {}, x_bloque: {}, x_respuesta: S("si", "no", "na"), x_criticidad: S("critico"), x_foto: { type: "binary" }, x_inspeccion_id: {} }
};
const K = "6f1c2a9e-1111-4222-8333-444455556666";
const base = () => ({ formulario: "F02", idempotency_key: K, odoo: { model: "x_hys_inspeccion", method: "create", vals: {
  x_formulario: "F02", x_ambito: "obra", x_tipo_programa: "periodica", x_estado: "realizada", x_origen: "formulario", x_ot_id: 6, x_hito_id: false,
  x_inspector_hys_id: 9, x_tc_nombre: "Capataz", x_tc_firma: "data:image/png;base64,AAAA", x_fecha_hora_control: "2026-10-18 12:00:00",
  x_gps_estado: "denegado", x_idempotency_key: K, x_cargado_por: "EJ-003 · Usuario Ejemplo 3 · HyS · OT 4081",
  x_inventado: 1, x_cant_no: 3, x_validacion_estado: "validada",
  x_linea_ids: [[0, 0, { x_name: "Ítem", x_bloque: "General", x_respuesta: "si", x_raro: 1 }], [0, 0, { x_name: "Ítem 2", x_bloque: "General", x_respuesta: "no", x_criticidad: "critico", x_foto: "BBBB" }]] } } });

test("payload válido: filtra campos inexistentes, de solo lectura y protegidos", () => {
  const r = validarYFiltrar(base(), C);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.descartados.sort(), ["x_cant_no", "x_inventado", "x_linea_ids[].x_raro", "x_validacion_estado"]);
  assert.equal(r.vals.x_tc_firma, "AAAA");
  assert.equal(r.vals.x_linea_ids.length, 2);
});
test("«No» sin gravedad ni foto, sin inspector y clave distinta → errores", () => {
  const b = base(); const v = b.odoo.vals;
  delete v.x_linea_ids[1][2].x_foto; delete v.x_linea_ids[1][2].x_criticidad; delete v.x_inspector_hys_id;
  const r = validarYFiltrar(b, C, { claveCabecera: "otra" });
  const campos = r.errores.map((e) => e.campo);
  for (const c of ["x_linea_ids[1].x_criticidad", "x_linea_ids[1].x_foto", "x_inspector_hys_id", "Idempotency-Key"]) assert.ok(campos.includes(c), c);
});
test("hito crítico exige hito", () => {
  const b = base(); b.odoo.vals.x_tipo_programa = "hito_critico";
  assert.ok(validarYFiltrar(b, C).errores.some((e) => e.campo === "x_ficha_hito_id"));
  b.odoo.vals.x_ficha_hito_id = 7; assert.ok(!validarYFiltrar(b, C).errores.some((e) => e.campo === "x_ficha_hito_id"));
});
test("texto del inspector", () => {
  assert.equal(textoInspector({ x_name: "Ana Pérez", x_legajo: "123", x_tipo: "interno" }), "Legajo 123 · Ana Pérez");
  assert.equal(textoInspector({ x_name: "Juan Gómez", x_legajo: false, x_tipo: "externo", x_empresa: "Consultora SRL" }), "Juan Gómez · externo · Consultora SRL");
});
test("payload viejo con x_inspector_id (empleado) → pide recargar", () => {
  const b = base(); b.odoo.vals.x_inspector_id = 9; delete b.odoo.vals.x_inspector_hys_id;
  assert.ok(validarYFiltrar(b, C).errores.some((e) => /desactualizada/.test(e.mensaje)));
});
