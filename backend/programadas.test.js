import test from "node:test";
import assert from "node:assert/strict";
import { fechaArt, mismoDiaArt, diaArtDe, elegirProgramada, etiquetaSectorVisita, SECTORES_VISITA } from "./programadas.js";

test("fechaArt / mismoDiaArt: 23:59 de Argentina es el día local, no el UTC del día siguiente", () => {
  assert.equal(fechaArt("2026-11-13 02:59:00"), "2026-11-12");
  assert.equal(fechaArt("2026-11-12 12:00:00"), "2026-11-12");
  assert.equal(fechaArt("2026-11-13 03:00:00"), "2026-11-13");
  assert.equal(mismoDiaArt("2026-11-12 21:00:00", "2026-11-13 02:59:00"), true);
  assert.equal(mismoDiaArt("2026-11-12 21:00:00", "2026-11-13 03:00:00"), false);
  const d = diaArtDe("2026-11-12 12:00:00");
  assert.equal(d.dia, "2026-11-12");
  assert.equal(d.inicio, "2026-11-12 03:00:00");
  assert.equal(d.fin, "2026-11-13 02:59:59");
});

test("SECTORES_VISITA incluye los del plan y los pares del cronograma", () => {
  const keys = SECTORES_VISITA.map(([k]) => k);
  for (const k of ["carpinteria", "estructura", "conformado", "corte_laser", "deposito", "logistica",
    "carpinteria_estructura", "conformado_corte_laser", "deposito_logistica", "obra"]) {
    assert.ok(keys.includes(k), k);
  }
  assert.equal(etiquetaSectorVisita("deposito_logistica"), "Depósito central / Logística y mantenimiento");
});

const p = (id, extra) => ({ id, x_estado: "programada", x_formulario: "F02", x_ot_id: 4146, x_fecha_vencimiento: "2026-11-13 02:59:00", ...extra });

test("elegirProgramada F02: misma OT y mismo día; si no hay, null", () => {
  const regs = [
    p(1, { x_ot_id: 4146 }),
    p(2, { x_ot_id: 4184 }),
    p(3, { x_ot_id: 4146, x_estado: "realizada" }),
    p(4, { x_ot_id: 4146, x_fecha_vencimiento: "2026-11-18 02:59:00" }),
  ];
  const ev = elegirProgramada(regs, { formulario: "F02", otId: 4146, fechaControl: "2026-11-12 18:00:00" });
  assert.equal(ev.id, 1);
  assert.equal(elegirProgramada(regs, { formulario: "F02", otId: 459, fechaControl: "2026-11-12 18:00:00" }), null);
});

test("elegirProgramada: si hay varias el mismo día, la de vencimiento más cercano", () => {
  const regs = [
    p(8, { x_fecha_vencimiento: "2026-11-12 21:00:00" }),
    p(9, { x_fecha_vencimiento: "2026-11-13 02:59:00" }),
  ];
  // Control a las 18:00 UTC del 12 (= 15:00 ART): más cerca de 21:00 UTC que de 02:59 del 13.
  assert.equal(elegirProgramada(regs, { formulario: "F02", otId: 4146, fechaControl: "2026-11-12 18:00:00" }).id, 8);
});

test("elegirProgramada: programada_id gana si sigue abierta y es compatible", () => {
  const regs = [p(1), p(9, { x_fecha_vencimiento: "2026-11-12 21:00:00" })];
  assert.equal(elegirProgramada(regs, { formulario: "F02", otId: 4146, fechaControl: "2026-11-12 18:00:00", programadaId: 1 }).id, 1);
  // Incompatible (otra OT): se ignora el pedido y se busca la del día.
  const mala = elegirProgramada(regs, { formulario: "F02", otId: 4184, fechaControl: "2026-11-12 18:00:00", programadaId: 1 });
  assert.equal(mala, null);
});

test("elegirProgramada F03: el sector no cierra la semanal oficial, ni al revés", () => {
  const semanal = { id: 24, x_estado: "programada", x_formulario: "F03", x_tipo_programa: "recorrida_semanal",
    x_sector_visita: false, x_fecha_vencimiento: "2026-11-14 02:59:00" }; // viernes 13/11 23:59 ART
  const sector = { id: 80, x_estado: "programada", x_formulario: "F03", x_sector_visita: "carpinteria_estructura",
    x_fecha_vencimiento: "2026-11-17 02:59:00" }; // lunes 16/11 23:59 ART
  const lunes = "2026-11-16 12:00:00";
  assert.equal(elegirProgramada([semanal, sector], { formulario: "F03", sectorVisita: "carpinteria_estructura", fechaControl: lunes }).id, 80);
  assert.equal(elegirProgramada([semanal, sector], { formulario: "F03", sectorVisita: null, fechaControl: lunes }), null);
  // La semanal vence el viernes 13: un envío el viernes sin sector la cierra.
  assert.equal(elegirProgramada([semanal, sector], { formulario: "F03", sectorVisita: null, fechaControl: "2026-11-13 18:00:00" }).id, 24);
  assert.equal(elegirProgramada([semanal, sector], { formulario: "F03", sectorVisita: "deposito_logistica", fechaControl: "2026-11-13 18:00:00" }), null);
});
