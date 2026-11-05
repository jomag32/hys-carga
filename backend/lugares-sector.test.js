import test from "node:test";
import assert from "node:assert/strict";
import { opcionesLugarPara, opcionesDesdeCatalogo, lugarSector, sectorDeSesion, lugarCorto, normalizarCodigoSector, OPCIONES_LUGAR } from "../componentes/lugares.js";

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

test("normalizarCodigoSector: espacios → guión bajo", () => {
  assert.equal(normalizarCodigoSector("corte laser"), "corte_laser");
  assert.equal(normalizarCodigoSector("corte_laser"), "corte_laser");
  assert.equal(normalizarCodigoSector("  SEC_6 "), "sec_6");
  assert.equal(normalizarCodigoSector(null), null);
});

test("encargado con sector de tabla sin catálogo: sintetiza la única opción (no paso 3 vacío)", () => {
  const ops = opcionesLugarPara({ rol_hys: "encargado", sector: "corte_laser", sector_nombre: "Corte Laser" });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].sector, "corte_laser");
  assert.equal(ops[0].name, "Corte Laser");
  assert.deepEqual(opcionesLugarPara({ rol_hys: "encargado", sector: null }), []);
  // código con espacio se normaliza al sintetizar
  assert.equal(opcionesLugarPara({ rol_hys: "encargado", sector: "corte laser", sector_nombre: "Corte Laser" })[0].sector, "corte_laser");
});

test("encargado Estructura (sec_6) sin catálogo ATS: igual sintetiza", () => {
  const ops = opcionesLugarPara({ rol_hys: "encargado", sector: "sec_6", sector_nombre: "Estructura" });
  assert.deepEqual(ops.map((o) => [o.sector, o.name]), [["sec_6", "Estructura"]]);
});

test("catálogo con código espaciado se normaliza a clave estable", () => {
  const ops = opcionesLugarPara({ rol_hys: "inspector" }, [["corte laser", "Corte Laser"], ["obra", "Obra"]]);
  assert.ok(ops.some((o) => o.clave === "corte_laser" && o.name === "Corte Laser"));
});
