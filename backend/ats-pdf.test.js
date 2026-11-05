import test from "node:test";
import assert from "node:assert/strict";
import { crearAts, leerAccionPdf } from "./ats.js";

// Odoo simulado (datos de EJEMPLO, repo público).
const PDF = Buffer.from("%PDF-1.4\n% ejemplo\n");
const ATS = [{ id: 7, x_name: "ATS-2026-00007", x_sector: "deposito" }];
const INSP = [{ id: 2, x_name: "Inspector Ejemplo", x_rol: "inspector" },
  { id: 3, x_name: "Encargado Logística Ejemplo", x_rol: "encargado", x_sector: "logistica" },
  { id: 4, x_name: "Encargado Depósito Ejemplo", x_rol: "encargado", x_sector: "deposito" }];

function armar({ accionPdf = 565, respuesta = { hys_pdf_b64: PDF.toString("base64"), nombre: "x.pdf" }, falla = null } = {}) {
  const llamadas = [];
  const ejecutar = async (m, met, args = [], kw = {}) => {
    llamadas.push({ m, met, args, kw });
    if (m === "ir.actions.server" && met === "run") { if (falla) throw falla; return respuesta; }
    const id = args[0]?.[0]?.[2];
    if (m === "x_hys_ats") return ATS.filter((a) => a.id === id);
    if (m === "x_hys_inspector") return INSP.filter((a) => a.id === id);
    return [];
  };
  return { api: crearAts(() => ({ ejecutar }), { departamentos: null, accionPdf }), llamadas };
}

test("inspector HyS → PDF del ATS por la acción de servidor", async () => {
  const { api, llamadas } = armar();
  const r = await api.pdf(7, { sesion: { inspector_id: 2 } });
  assert.equal(r.nombre, "ATS-2026-00007.pdf");
  assert.ok(r.pdf.equals(PDF));
  const run = llamadas.find((l) => l.met === "run");
  assert.deepEqual(run.args, [[565]]);
  assert.deepEqual(run.kw.context, { active_model: "x_hys_ats", active_id: 7, active_ids: [7] });
});

test("encargado de su sector → OK; de otro sector → 403 sin pedir el PDF", async () => {
  assert.ok((await armar().api.pdf(7, { sesion: { inspector_id: 4 } })).pdf.length > 0);
  const { api, llamadas } = armar();
  await assert.rejects(api.pdf(7, { sesion: { inspector_id: 3 } }), (e) => e.estado === 403);
  assert.ok(!llamadas.some((l) => l.met === "run"));
});

test("sin sesión 401 · id inválido 400 · inexistente 404 · inspector inactivo 403", async () => {
  const { api } = armar();
  await assert.rejects(api.pdf(7, {}), (e) => e.estado === 401);
  await assert.rejects(api.pdf(0, { sesion: { inspector_id: 2 } }), (e) => e.estado === 400);
  await assert.rejects(api.pdf(99, { sesion: { inspector_id: 2 } }), (e) => e.estado === 404);
  await assert.rejects(api.pdf(7, { sesion: { inspector_id: 50 } }), (e) => e.estado === 403);
});

test("sin ODOO_ATS_PDF_ACCION_ID → 503", async () => {
  await assert.rejects(armar({ accionPdf: null }).api.pdf(7, { sesion: { inspector_id: 2 } }), (e) => e.estado === 503);
  assert.equal(leerAccionPdf({}), null);
  assert.equal(leerAccionPdf({ ODOO_ATS_PDF_ACCION_ID: "565" }), 565);
  assert.equal(leerAccionPdf({ ODOO_ATS_PDF_ACCION_ID: "abc" }), null);
});

test("Odoo devuelve algo que no es PDF → ErrorOdoo (502); error de Odoo se propaga", async () => {
  await assert.rejects(armar({ respuesta: { hys_pdf_b64: Buffer.from("<html>").toString("base64") } }).api.pdf(7, { sesion: { inspector_id: 2 } }), (e) => e.name === "Error" && /PDF/.test(e.message));
  await assert.rejects(armar({ respuesta: false }).api.pdf(7, { sesion: { inspector_id: 2 } }), /PDF/);
  await assert.rejects(armar({ falla: new Error("AccessError") }).api.pdf(7, { sesion: { inspector_id: 2 } }), /AccessError/);
});
