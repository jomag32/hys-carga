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

import { crearEventos } from "./eventos.js";
import { crearVencimientos } from "./vencimientos.js";
function falso() {
  const db = { x_hys_evento: [], x_hys_vencimiento_carga: [], x_hys_control_legal: [{ id: 5, x_name: "Control Ejemplo", x_estado: "sin_estado" }],
    x_hys_inspector: [{ id: 1, x_name: "Inspector Ejemplo", x_rol: "inspector", x_active: true }, { id: 2, x_name: "Encargado Ejemplo", x_rol: "encargado", x_active: true }],
    "hr.employee": [{ id: 9, name: "Empleado Ejemplo", active: true }] };
  const ok = (r, [c, op, v]) => (op === "=" ? r[c] === v : true);
  return { db, cli: () => ({ async ejecutar(mo, me, args = [], kw = {}) {
    const t = db[mo];
    if (me === "search_read") return t.filter((r) => (args[0] || []).every((d) => ok(r, d))).slice(0, kw.limit || 999);
    if (me === "read") return t.filter((r) => args[0].includes(r.id));
    if (me === "create") { const id = t.length + 1; t.push({ id, ...args[0][0], x_name: `N-${id}` }); return [id]; }
    if (me === "write") { for (const r of t) if (args[0].includes(r.id)) Object.assign(r, args[1]); return true; }
    throw new Error(me);
  } }) };
}
const K1 = "11111111-1111-4111-8111-111111111111";
test("POST eventos: crea, idempotente, 422 sin aviso", async () => {
  const { db, cli } = falso();
  const ev = crearEventos(cli, { ahora: () => AHORA });
  const r = await ev.recibir({ idempotency_key: K1, datos: base, control: { gps_estado: "denegado" } }, { sesion: { inspector_id: 2 } });
  assert.equal(r.estado, 201);
  assert.equal(db.x_hys_evento[0].x_aviso_telefonico, true);
  assert.match(db.x_hys_evento[0].x_cargado_por, /Encargado/);
  assert.equal((await ev.recibir({ idempotency_key: K1, datos: base }, { sesion: { inspector_id: 2 } })).estado, 200);
  await assert.rejects(ev.recibir({ idempotency_key: "21111111-1111-4111-8111-111111111111", datos: { ...base, aviso_telefonico: false } }, { sesion: { inspector_id: 1 } }), (e) => e.estado === 422);
  assert.equal((await ev.catalogo()).empleados[0].nombre, "Empleado Ejemplo");
});
test("vencimientos: listar para todos, cargar solo HyS y actualiza el control", async () => {
  const { db, cli } = falso();
  const v = crearVencimientos(cli, { ahora: () => AHORA });
  assert.equal((await v.listar()).controles[0].color, "rojo");
  const datos = { control_id: 5, estado: "vigente", fecha_servicio: "2026-10-01", fecha_vence: "2027-10-01", protocolo: "data:application/pdf;base64,QUJD", protocolo_nombre: "p.pdf" };
  await assert.rejects(v.recibir({ idempotency_key: K1, datos }, { sesion: { inspector_id: 2 } }), (e) => e.estado === 403);
  const r = await v.recibir({ idempotency_key: K1, datos }, { sesion: { inspector_id: 1 } });
  assert.equal(r.estado, 201);
  assert.equal(db.x_hys_vencimiento_carga[0].x_protocolo, "QUJD");
  assert.equal(db.x_hys_control_legal[0].x_estado, "vigente");
  assert.equal(db.x_hys_control_legal[0].x_ultima_carga_id, 1);
  assert.equal((await v.listar()).controles[0].color, "verde");
});
