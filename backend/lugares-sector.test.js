import test from "node:test";
import assert from "node:assert/strict";
import { opcionesLugarPara, opcionesDesdeCatalogo, lugarSector, sectorDeSesion, lugarCorto, OPCIONES_LUGAR } from "../componentes/lugares.js";

const CAT = [["deposito", "Depósito Central"], ["logistica", "Logística y Mantenimiento"], ["obra", "Obra"], ["sec_12", "Corte láser"]];

test("sin catálogo: opciones fijas de antes", () => {
  assert.equal(opcionesDesdeCatalogo(null), null);
  assert.deepEqual(opcionesLugarPara({ rol_hys: "inspector" }), OPCIONES_LUGAR);
});

test("con catálogo de la tabla x_hys_sector: Obra primero, sectores (incluido el creado al vuelo) y Planta al final", () => {
  const ops = opcionesLugarPara({ rol_hys: "inspector" }, CAT);
  assert.deepEqual(ops.map((o) => o.clave), ["obra", "deposito", "logistica", "sec_12", "planta"]);
  assert.equal(ops.find((o) => o.clave === "sec_12").name, "Corte láser");
  assert.deepEqual(opcionesLugarPara({ rol_hys: "encargado", sector: "sec_12" }, CAT).map((o) => o.clave), ["sec_12"]);
});

test("lugar de un sector nuevo: sesión y encabezado", () => {
  const l = lugarSector("sec_12", "Corte láser");
  assert.equal(sectorDeSesion(l), "sec_12");
  assert.equal(lugarCorto(l), "Corte láser");
  assert.throws(() => lugarSector("sec_99"));
  assert.equal(sectorDeSesion(lugarSector("deposito")), "deposito");
});
