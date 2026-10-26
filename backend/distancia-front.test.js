import test from "node:test"; import assert from "node:assert/strict";
globalThis.location = { search: "", hostname: "x" }; globalThis.document = { createElement: () => ({}) };
const { distanciaKm, errorDistancia, coordsPlanta } = await import("../componentes/distancia.js");
test("haversine", () => {
  assert.equal(distanciaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
  assert.ok(Math.abs(distanciaKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111.2) < 0.2);
  assert.ok(Math.abs(distanciaKm({ lat: -34.6037, lon: -58.3816 }, { lat: -31.4201, lon: -64.1888 }) - 646) < 5); // BA–Córdoba ~646 km
});
test("validación y planta sin configurar", () => {
  assert.match(errorDistancia(""), /obligatoria/); assert.match(errorDistancia(-2), /negativa/); assert.match(errorDistancia(2500), /2000/);
  assert.equal(errorDistancia(0), null); assert.equal(coordsPlanta(), null);
});
