import test from "node:test";
import assert from "node:assert/strict";

// Globals mínimos para importar módulos del frontend en Node (igual que ats-vista.test.js).
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator = { onLine: true };
globalThis.window = globalThis;
globalThis.location = { search: "?obras=ejemplo", hostname: "x", hash: "" };

test("lugares: Obra pide OF; sector/planta no; encargado solo su sector", async () => {
  const L = await import("../componentes/lugares.js");
  assert.equal(L.esObraReal({ id: 4146, name: "OT 4146" }), true);
  assert.equal(L.esObraReal({ id: "planta", name: "Planta" }), false);
  assert.equal(L.esObraReal(L.lugarSector("deposito")), false);
  assert.equal(L.sectorDeSesion(L.lugarSector("logistica")), "logistica");
  assert.equal(L.sectorDeSesion({ id: 4146, tipo: "obra" }), null);
  assert.equal(L.lugarCorto(L.lugarSector("deposito")), "Depósito Central");
  assert.equal(L.lugarCorto({ id: 10, ot: "4146", tipo: "obra" }), "OT 4146");
  assert.equal(L.lugarCorto(L.lugarPlanta()), "Planta");
  const insp = L.opcionesLugarPara({ rol_hys: "inspector" });
  assert.ok(insp.some((o) => o.clave === "obra"));
  assert.ok(insp.some((o) => o.clave === "deposito"));
  const enc = L.opcionesLugarPara({ rol_hys: "encargado", sector: "deposito" });
  assert.deepEqual(enc.map((o) => o.clave), ["deposito"]);
  assert.equal(L.lugarObra({ id: "planta", name: "x" }), null);
  assert.equal(L.lugarObra({ id: 5, name: "OT 5 - X" }).tipo, "obra");
  assert.equal(L.SECTORES_ATS.obra.nombre, "Obra");
});

test("GPS: precisión > umbral marca impreciso sin cambiar estado Odoo", async () => {
  const ca = await import("../componentes/campos-auto.js");
  assert.equal(ca.GPS_PRECISION_IMPRECISA_M, 100);
  const marcar = (precision) => {
    const impreciso = Number.isFinite(precision) && precision > ca.GPS_PRECISION_IMPRECISA_M;
    return { estado: "ok", precision, impreciso };
  };
  assert.equal(marcar(12).impreciso, false);
  assert.equal(marcar(100).impreciso, false);
  assert.equal(marcar(101).impreciso, true);
  assert.equal(marcar(50000).impreciso, true);
  assert.match(ca.textoGps({ estado: "ok", precision: 50000, impreciso: true }), /imprecisa/i);
  assert.match(ca.textoGps({ estado: "ok", precision: 12, impreciso: false }), /tomada/i);
  assert.match(ca.textoGps({ estado: "denegado" }), /permiso/i);
  // camposControl sigue mandando estado "ok" (valor válido en Odoo) + precision_m grande.
  const vals = ca.camposControl({
    idempotency_key: "6f1c2a9e-1111-4222-8333-000000000099",
    fecha_hora_control: "2026-10-27T12:00:00.000Z",
    gps: { lat: -27.36, lon: -55.89, precision: 50000, fecha: "2026-10-27T12:00:00.000Z", estado: "ok", impreciso: true }
  });
  assert.equal(vals.x_gps_estado, "ok");
  assert.equal(vals.x_gps_precision_m, 50000);
});
