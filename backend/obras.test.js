import test from "node:test";
import assert from "node:assert/strict";
import { numeroOt, esExcluida, armarObras } from "./obras.js";

test("numeroOt", () => {
  for (const [n, ot] of [["OT 9101 - X", "9101"], ["0T-9102-X", "9102"], ["OT.9103 X", "9103"], ["ot9104", "9104"],
    ["Galpón OT-9105", "9105"], ["OT: 9106", "9106"], ["VARIOS", null], ["BOTELLA 9107", null], ["OT 123456", null]])
    assert.equal(numeroOt(n), ot, n);
});
test("excluye VARIOS", () => { assert.ok(esExcluida(" varios ")); assert.ok(!esExcluida("VARIOS OT 9101")); });
test("armarObras ordena por OT, sin OT al final", () => {
  const r = armarObras([
    { id: 3, name: "OT 9120 - B", partner_id: [1, "Cliente A"], user_id: false },
    { id: 1, name: "Sin número", partner_id: false, user_id: [2, "Dir"] },
    { id: 2, name: "0T 9101 - A", partner_id: false, user_id: false },
    { id: 4, name: "VARIOS", partner_id: false, user_id: false }]);
  assert.deepEqual(r.map((o) => o.id), [2, 3, 1]);
  assert.deepEqual(r[1], { id: 3, name: "OT 9120 - B", ot: "9120", partner: "Cliente A", director: null });
});
