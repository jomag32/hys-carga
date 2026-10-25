import test from "node:test";
import assert from "node:assert/strict";
import { validarEvento, armarEvento } from "./eventos.js";
import { validarVencimiento, armarVencimiento, semaforo, tocaAlerta } from "./vencimientos.js";

const AHORA = new Date("2026-10-25T15:00:00-03:00");
const base = { tipo: "baja", fecha_hora: "2026-10-25T10:00:00-03:00", ambito: "fabrica", sector: "pintura", que_paso: "Ejemplo",
  reportado_por: "Persona Ejemplo", lesion_parte: "manos", atencion: "Botiquín", dias_baja: 2, aviso_telefonico: true, aviso_hora: "2026-10-25T10:05:00-03:00" };

test("F05 válido", () => assert.deepEqual(validarEvento(base, AHORA), []));
test("F05 aviso telefónico obligatorio con lesión (con y sin baja)", () => {
  assert.ok(validarEvento({ ...base, aviso_telefonico: false }, AHORA).includes("aviso_telefonico"));
  assert.ok(validarEvento({ ...base, tipo: "sinbaja", aviso_telefonico: false }, AHORA).includes("aviso_telefonico"));
  assert.ok(validarEvento({ ...base, aviso_hora: "2026-10-25T09:00:00-03:00" }, AHORA).includes("aviso_hora"));
  assert.deepEqual(validarEvento({ tipo: "casi", fecha_hora: base.fecha_hora, ambito: "oficina", que_paso: "x", reportado_por: "y" }, AHORA), []);
});
test("F05 dónde = lista fija", () => {
  assert.ok(validarEvento({ ...base, sector: "patio" }, AHORA).includes("sector"));
  assert.ok(validarEvento({ ...base, ambito: "otro" }, AHORA).includes("ambito"));
  assert.ok(validarEvento({ ...base, ambito: "obra" }, AHORA).includes("ot_id"));
});
test("F05 fecha futura", () => assert.ok(validarEvento({ ...base, fecha_hora: "2026-10-26T10:00:00-03:00" }, AHORA).includes("fecha_hora_futura")));
test("F05 armado y plazo 24 h", () => {
  const v = armarEvento(base, { recepcion: AHORA });
  assert.equal(v.x_fecha_hora, "2026-10-25 13:00:00");
  assert.equal(v.x_cargado_en_plazo, true);
  assert.equal(v.x_aviso_telefonico, true);
  assert.equal(armarEvento(base, { recepcion: new Date("2026-10-27T10:00:00-03:00") }).x_cargado_en_plazo, false);
});
test("F06 validación", () => {
  const ok = { control_id: 3, estado: "vigente", fecha_servicio: "2026-10-01", fecha_vence: "2027-10-01", protocolo: "b64" };
  assert.deepEqual(validarVencimiento(ok, "2026-10-25"), []);
  assert.ok(validarVencimiento({ ...ok, protocolo: null }, "2026-10-25").includes("protocolo"));
  assert.ok(validarVencimiento({ ...ok, fecha_vence: "2026-10-20" }, "2026-10-25").includes("fecha_vence_pasada"));
  assert.deepEqual(validarVencimiento({ control_id: 3, estado: "sin_protocolo" }, "2026-10-25"), []);
  assert.equal(armarVencimiento(ok).control.x_fecha_vence, "2027-10-01");
});
test("F06 semáforo y alertas", () => {
  assert.equal(semaforo({ x_estado: "vigente", x_fecha_vence: "2026-11-10" }, "2026-10-25").color, "amarillo");
  assert.equal(semaforo({ x_estado: "vigente", x_fecha_vence: "2027-01-10" }, "2026-10-25").color, "verde");
  assert.equal(semaforo({ x_estado: "sin_protocolo" }, "2026-10-25").color, "rojo");
  assert.equal(tocaAlerta({ x_estado: "vigente", x_fecha_vence: "2026-11-24" }, "2026-10-25"), true);
  assert.equal(tocaAlerta({ x_estado: "vigente", x_fecha_vence: "2026-11-23" }, "2026-10-25"), false);
});
