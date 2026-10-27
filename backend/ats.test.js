import test from "node:test";
import assert from "node:assert/strict";
import { crearAts, validarAts, inicioTurno, diaOdoo, hoyAr, puedeCargar, huella, instante, leerEmpresas, nombreCorto, leerFlagAtsObra, SECTORES } from "./ats.js";

// Odoo simulado (datos de EJEMPLO, repo público).
const AHORA = Date.parse("2026-10-20T06:50:00-03:00"); // martes, 06:50 de Argentina
const TURNOS = [
  { id: 1, x_name: "Jornada", x_codigo: "jornada", x_sector: "deposito", x_hora_inicio: 7, x_dias: "0,1,2,3,4", x_encargado_id: [17, "Encargado Ejemplo"], x_autoriza_id: [18, "Gerencia Ejemplo"], x_codigo_ats: "ATS-DEP-001", x_secuencia: 10 },
  { id: 2, x_name: "Jornada", x_codigo: "jornada", x_sector: "logistica", x_hora_inicio: 7, x_dias: "0,1,2,3,4", x_encargado_id: false, x_autoriza_id: false, x_codigo_ats: "ATS-LOG-MANT-001", x_secuencia: 10 },
  { id: 3, x_name: "Jornada", x_codigo: "jornada", x_sector: "obra", x_hora_inicio: 7, x_dias: "0,1,2,3,4", x_encargado_id: [17, "Encargado Ejemplo"], x_autoriza_id: [18, "Gerencia Ejemplo"], x_codigo_ats: "ATS-OBRA-001", x_secuencia: 10 }];
const ITEMS = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x_codigo: `F08D-${String(i + 1).padStart(2, "0")}`, x_name: `Control depósito ${i + 1}`, x_formulario: "F08_DEP",
    x_bloque: "Chequeo", x_critico: [4, 5, 6, 7, 9].includes(i + 1), x_secuencia: (i + 1) * 10, x_admite_na: ![4, 5, 6, 7, 9].includes(i + 1), x_version: "v1" })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: i + 11, x_codigo: `F08L-${String(i + 1).padStart(2, "0")}`, x_name: `Control logística ${i + 1}`, x_formulario: "F08_LOG",
    x_bloque: "Chequeo", x_critico: [6, 7, 8].includes(i + 1), x_secuencia: (i + 1) * 10, x_admite_na: ![6, 7].includes(i + 1), x_version: "v1" })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: i + 21, x_codigo: `F08O-${String(i + 1).padStart(2, "0")}`, x_name: `Control obra ${i + 1}`, x_formulario: "F08_OBRA",
    x_bloque: "Chequeo · BORRADOR", x_critico: [2, 3, 4, 5, 6, 10].includes(i + 1), x_secuencia: (i + 1) * 10, x_admite_na: ![2, 3, 4, 5, 6, 10].includes(i + 1), x_version: "BORRADOR" }))];
const EMPLEADOS = [{ id: 17, name: "Encargado Ejemplo", job_title: "Encargado", company_id: [3, "CORMET EJEMPLO"] }, { id: 16, name: "Otra Persona Ejemplo", job_title: "Operario", company_id: [1, "COOP. EL SOL EJEMPLO"] }];
const EMPRESAS = [{ id: 1, name: "COOP. EL SOL EJEMPLO" }, { id: 3, name: "CORMET EJEMPLO" }, { id: 2, name: "OTRA EMPRESA" }]; // 18 no se puede leer (regla de RR. HH.)
const INSPECTORES = [{ id: 2, x_name: "Inspector Ejemplo", x_legajo: "0001", x_rol: "inspector", x_active: true },
  { id: 3, x_name: "Encargado Logística Ejemplo", x_legajo: "0003", x_rol: "encargado", x_sector: "logistica", x_active: true },
  { id: 4, x_name: "Encargado Depósito Ejemplo", x_legajo: "0004", x_rol: "encargado", x_sector: "deposito", x_active: true }];
const K = (n) => `6f1c2a9e-1111-4222-8333-${String(n).padStart(12, "0")}`;
const FOTO = "data:image/jpeg;base64,AAAA";

function armar({ previos = [], ahora = AHORA, flagObra = false, odooTieneObra = false } = {}) {
  const db = { x_hys_ats: previos.map((a) => ({ ...a })), x_hys_ats_linea: [] };
  const llamadas = [];
  const val = (r, c) => (Array.isArray(r[c]) ? r[c][0] : r[c]);
  const cumple = (r, d) => {
    const [c, op, v] = d;
    if (op === "=") return val(r, c) === v;
    if (op === "in") return v.includes(val(r, c));
    throw new Error(op);
  };
  const ejecutar = async (m, met, args = [], kw = {}) => {
    llamadas.push({ m, met, args, kw });
    if (met === "message_post") return true;
    if (met === "fields_get") {
      const sel = odooTieneObra
        ? [["deposito", "Depósito"], ["logistica", "Logística"], ["obra", "Obra"]]
        : [["deposito", "Depósito"], ["logistica", "Logística"]];
      const out = { x_sector: { selection: sel, type: "selection" } };
      if (odooTieneObra) out.x_ot_id = { type: "many2one" };
      return out;
    }
    if (met === "create") {
      const v = args[0][0]; const id = 100 + db.x_hys_ats.length;
      db.x_hys_ats.push({ ...v, id, x_name: `ATS-2026-${String(id).padStart(5, "0")}`, x_turno_id: [v.x_turno_id, "Jornada"], x_linea_ids: v.x_linea_ids.map((_, i) => id * 100 + i) });
      v.x_linea_ids.forEach((l, i) => db.x_hys_ats_linea.push({ id: id * 100 + i, x_ats_id: [id, "ATS"], ...l[2] }));
      return [id];
    }
    const base = { x_hys_turno: TURNOS, x_hys_item_plantilla: ITEMS, x_hys_config: [{ x_ats_min_justif: 10, x_ats_horas_tardia: 24 }], "hr.employee": EMPLEADOS.map((e) => ({ ...e, active: true })),
      "res.company": EMPRESAS, x_hys_inspector: INSPECTORES, x_hys_ats: db.x_hys_ats, x_hys_ats_linea: db.x_hys_ats_linea }[m] || [];
    const dom = (args[0] || []).filter((d) => Array.isArray(d) && !["x_active", "active"].includes(d[0]) && d[0] !== "x_formulario");
    let r = base.filter((x) => dom.every((d) => cumple(x, d)));
    if (m === "x_hys_ats" && kw.order?.startsWith("x_fecha desc")) r = [...r].sort((a, b) => String(b.x_fecha).localeCompare(String(a.x_fecha)) || b.id - a.id);
    if (m === "x_hys_ats" && kw.order === "id desc") r = [...r].sort((a, b) => b.id - a.id);
    return kw.limit ? r.slice(0, kw.limit) : r;
  };
  const api = crearAts(() => ({ ejecutar }), { departamentos: null, ahora: () => ahora, empresasIds: [1, 3], flagObra });
  return { api, db, llamadas };
}

function cuerpo(cambios = {}, { sector = "deposito", clave = K(1), lineas } = {}) {
  const plantilla = { deposito: "F08_DEP", logistica: "F08_LOG", obra: "F08_OBRA" }[sector];
  const turnoId = { deposito: 1, logistica: 2, obra: 3 }[sector];
  const items = ITEMS.filter((x) => x.x_formulario === plantilla);
  const vals = {
    x_sector: sector, x_turno_id: turnoId, x_fecha: "2026-10-20", x_fecha_hora_control: "2026-10-20T09:50:00.000Z",
    x_actividades: "Descarga de chapas de ejemplo", x_encargado_id: 17, x_autoriza_id: 18, x_fuera_rutina: "no", x_tarea_ids: [],
    x_dotacion: 4, x_charla_previa: true, x_resultado: "autorizado", x_firma_encargado: FOTO, x_firma_autoriza: FOTO,
    x_gps_estado: "denegado", x_gps_lat: false, x_gps_lon: false,
    x_linea_ids: lineas || items.map((it) => [0, 0, { x_item_codigo: it.x_codigo, x_respuesta: "si" }]), ...cambios
  };
  return { formulario: "F08", idempotency_key: clave, odoo: { model: "x_hys_ats", method: "create", vals } };
}
const SES = { inspector_id: 2, legajo: "1" };
const lineasCon = (cod, extra, sector = "deposito") => cuerpo({}, { sector }).odoo.vals.x_linea_ids.map(([a, b, l]) => [a, b, l.x_item_codigo === cod ? { ...l, ...extra } : l]);
const err = (p, estado, re) => assert.rejects(p, (e) => e.estado === estado && (!re || re.test(e.message)));

test("utilidades de fecha (Argentina UTC-3)", () => {
  assert.equal(new Date(inicioTurno("2026-10-20", 7)).toISOString(), "2026-10-20T10:00:00.000Z");
  assert.equal(diaOdoo("2026-10-19"), 0); // lunes
  assert.equal(diaOdoo("2026-10-25"), 6); // domingo
  assert.equal(hoyAr(Date.parse("2026-10-21T02:00:00Z")), "2026-10-20");
  assert.ok(Number.isNaN(instante("2026-10-20T06:50:00"))); // sin zona: no
  assert.equal(instante("2026-10-20 09:50:00"), Date.parse("2026-10-20T09:50:00Z"));
});

test("ATS válido → 201, antes del turno, sin campos peligrosos del celular", async () => {
  const { api, db, llamadas } = armar();
  const r = await api.recibir(cuerpo({ x_name: "HACK", x_verificado_hys: true }), { sesion: SES });
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.name, "ATS-2026-00100");
  const a = db.x_hys_ats[0];
  assert.equal(a.x_antes_de_turno, true);
  assert.equal(a.x_inicio_turno, "2026-10-20 10:00:00");
  assert.equal(a.x_fecha_hora_control, "2026-10-20 09:50:00");
  assert.equal(a.x_codigo_ats, "ATS-DEP-001");
  assert.equal(a.x_origen, "formulario");
  assert.equal(a.x_inspector_hys_id, 2);
  assert.match(a.x_cargado_por, /Inspector HyS/);
  assert.equal(a.x_name, "ATS-2026-00100"); // lo pone Odoo (simulado), no el celular
  assert.equal(a.x_verificado_hys, undefined);
  assert.equal(a.x_linea_ids.length, 10);
  assert.equal(db.x_hys_ats_linea[0].x_name, "Control depósito 1"); // texto copiado de la plantilla
  assert.equal(a.x_firma_encargado, "AAAA");
  assert.equal(a.x_carga_tardia, false);
  assert.ok(llamadas.some((l) => l.met === "message_post"));
});

test("misma clave → 200 repetido sin duplicar", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo(), { sesion: SES });
  const r = await api.recibir(cuerpo(), { sesion: SES });
  assert.equal(r.estado, 200); assert.equal(r.cuerpo.repetido, true); assert.equal(db.x_hys_ats.length, 1);
  const otro = armar({ previos: [{ id: 50, x_name: "ATS-2026-00050", x_idempotency_key: K(1), x_sector: "deposito", x_fecha: "2026-10-20", x_turno_id: [1, "J"], x_resultado: "autorizado" }] });
  const r2 = await otro.api.recibir(cuerpo(), { sesion: SES }); // tras reinicio del proceso: lo encuentra en Odoo
  assert.equal(r2.estado, 200); assert.equal(otro.db.x_hys_ats.length, 1);
});

test("segundo ATS del mismo turno → 409; tras «No autorizado» se permite y lo reemplaza", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo(), { sesion: SES });
  await err(api.recibir(cuerpo({}, { clave: K(2) }), { sesion: SES }), 409, /Ya hay un ATS/);
  const b = armar({ previos: [{ id: 60, x_name: "ATS-2026-00060", x_sector: "deposito", x_fecha: "2026-10-20", x_turno_id: [1, "J"], x_resultado: "no_autorizado", x_idempotency_key: K(9) }] });
  const r = await b.api.recibir(cuerpo({}, { clave: K(3) }), { sesion: SES });
  assert.equal(r.estado, 201); assert.equal(b.db.x_hys_ats[1].x_ats_anterior_id, 60);
  assert.equal(db.x_hys_ats.length, 1);
});

test("crítico ★ en «No»: no puede ser Autorizado; tras corrección pide texto; no autorizado pasa", async () => {
  const { api } = armar();
  const l = lineasCon("F08D-04", { x_respuesta: "no", x_criticidad: "critico", x_foto: FOTO, x_medida_correctiva: "Se cambió la eslinga" });
  await err(api.recibir(cuerpo({ x_linea_ids: l }, { clave: K(4) }), { sesion: SES }), 422, /punto crítico/);
  await err(api.recibir(cuerpo({ x_linea_ids: l, x_resultado: "autorizado_correccion" }, { clave: K(5) }), { sesion: SES }), 422, /qué se corrigió/);
  const r = await api.recibir(cuerpo({ x_linea_ids: l, x_resultado: "no_autorizado" }, { clave: K(6) }), { sesion: SES });
  assert.equal(r.estado, 201);
});

test("«No» sin foto o sin gravedad → 422", async () => {
  const { api } = armar();
  await err(api.recibir(cuerpo({ x_linea_ids: lineasCon("F08D-01", { x_respuesta: "no", x_criticidad: "menor" }) }), { sesion: SES }), 422, /foto/);
  await err(api.recibir(cuerpo({ x_linea_ids: lineasCon("F08D-01", { x_respuesta: "no", x_foto: FOTO }) }), { sesion: SES }), 422, /gravedad/);
});

test("N/A: justificación mínima y no admitido en ★ (salvo los que lo admiten)", async () => {
  const { api } = armar();
  await err(api.recibir(cuerpo({ x_linea_ids: lineasCon("F08D-01", { x_respuesta: "na", x_justificacion_na: "corto" }) }), { sesion: SES }), 422, /Justificá/);
  await err(api.recibir(cuerpo({ x_linea_ids: lineasCon("F08D-05", { x_respuesta: "na", x_justificacion_na: "No hay cilindros hoy en el sector" }) }), { sesion: SES }), 422, /no admite N\/A/);
  const r = await api.recibir(cuerpo({ x_linea_ids: lineasCon("F08L-08", { x_respuesta: "na", x_justificacion_na: "Sin tareas con energías peligrosas" }, "logistica") }, { sector: "logistica" }), { sesion: SES });
  assert.equal(r.estado, 201);
});

test("controles faltantes, ajenos o repetidos → 422", async () => {
  const { api } = armar();
  const base = cuerpo().odoo.vals.x_linea_ids;
  await err(api.recibir(cuerpo({ x_linea_ids: base.slice(1) }), { sesion: SES }), 422, /Faltan controles: F08D-01/);
  await err(api.recibir(cuerpo({ x_linea_ids: [...base, [0, 0, { x_item_codigo: "F08L-01", x_respuesta: "si" }]] }), { sesion: SES }), 422, /no es de este sector/);
  await err(api.recibir(cuerpo({ x_linea_ids: [...base, base[0]] }), { sesion: SES }), 422, /repetido/);
});

test("fuera de rutina sin tarea, dotación 0, sin charla, sin firmas → 422; autorización remota sin firma → 201", async () => {
  const { api } = armar();
  await err(api.recibir(cuerpo({ x_fuera_rutina: "si" }), { sesion: SES }), 422, /tarea fuera de rutina/);
  await err(api.recibir(cuerpo({ x_dotacion: 0 }), { sesion: SES }), 422, /dotación/);
  await err(api.recibir(cuerpo({ x_charla_previa: false }), { sesion: SES }), 422, /charla previa/);
  await err(api.recibir(cuerpo({ x_firma_encargado: false }), { sesion: SES }), 422, /firma del encargado/);
  await err(api.recibir(cuerpo({ x_firma_autoriza: false }), { sesion: SES }), 422, /quien autoriza/);
  const r = await api.recibir(cuerpo({ x_firma_autoriza: false, x_autorizacion_remota: true, x_fuera_rutina: "si",
    x_tarea_ids: [[0, 0, { x_paso: "Cambio de rodillo", x_riesgo: "Atrapamiento", x_control: "Bloqueo", x_responsable: "Encargado" }]] }), { sesion: SES });
  assert.equal(r.estado, 201);
});

test("turno de otro sector / día sin turno / fecha futura → 422", async () => {
  const { api } = armar();
  await err(api.recibir(cuerpo({ x_turno_id: 2 }), { sesion: SES }), 422, /otro sector/);
  await err(api.recibir(cuerpo({ x_fecha: "2026-10-18" }), { sesion: SES }), 422, /no trabaja ese día/);
  await err(api.recibir(cuerpo({ x_fecha: "2026-10-23" }), { sesion: SES }), 422, /más de un día/);
});

test("encargado de otro sector → 403; encargado de su sector → 201; sin sesión → 401", async () => {
  const { api } = armar();
  await err(api.recibir(cuerpo(), { sesion: { inspector_id: 3, legajo: "3" } }), 403, /otro sector/);
  const r = await api.recibir(cuerpo({}, { clave: K(7) }), { sesion: { inspector_id: 4, legajo: "4" } });
  assert.equal(r.estado, 201);
  await err(api.recibir(cuerpo({}, { clave: K(8) }), { sesion: null }), 401);
  assert.equal(puedeCargar({ x_rol: false }, "deposito"), true);
});

test("cargado después del inicio → antes_de_turno falso; más de 24 h después → carga tardía", async () => {
  const { api, db } = armar({ ahora: Date.parse("2026-10-20T10:30:00Z") });
  await api.recibir(cuerpo({ x_fecha_hora_control: "2026-10-20T10:20:00Z" }), { sesion: SES });
  assert.equal(db.x_hys_ats[0].x_antes_de_turno, false);
  const b = armar();
  await b.api.recibir(cuerpo({ x_fecha: "2026-10-19", x_fecha_hora_control: "2026-10-19T06:00:00Z" }), { sesion: SES });
  assert.equal(b.db.x_hys_ats[0].x_carga_tardia, true);
});

test("idéntico al anterior del sector", async () => {
  const { api, db } = armar();
  await api.recibir(cuerpo({ x_fecha: "2026-10-19", x_fecha_hora_control: "2026-10-19T09:50:00Z" }), { sesion: SES });
  await api.recibir(cuerpo({}, { clave: K(11) }), { sesion: SES });
  assert.equal(db.x_hys_ats[1].x_identico_anterior, true);
  await api.recibir(cuerpo({ x_fecha: "2026-10-21", x_dotacion: 5 }, { clave: K(12) }), { sesion: SES }).catch(() => {});
  assert.equal(huella({ lineas: [{ x_item_codigo: "A", x_respuesta: "si" }], actividades: " Hola  mundo", dotacion: 2 }),
    huella({ lineas: [{ x_item_codigo: "A", x_respuesta: "si" }], actividades: "hola mundo", dotacion: 2 }));
});

test("catálogo: turnos con hora, controles por sector, personas", async () => {
  const { api } = armar();
  const c = await api.catalogo();
  assert.equal(c.turnos[0].inicio, "07:00");
  assert.deepEqual(c.turnos[0].dias, [0, 1, 2, 3, 4]);
  assert.equal(c.controles.F08_DEP.length, 10);
  assert.equal(c.controles.F08_DEP[3].critico, true);
  assert.equal(c.controles.F08_DEP[3].admite_na, false);
  assert.equal(c.personas.deposito.length, 3);
  assert.ok(c.personas.deposito.some((p) => p.id === 18)); // autoriza por defecto del turno, aunque no se lea en hr.employee
  assert.equal(c.min_justificacion_na, 10);
  const d = await api.delDia("deposito", "2026-10-20");
  assert.deepEqual(d, []);
  await assert.rejects(api.delDia("x", "2026-10-20"), (e) => e.estado === 400);
});

test("validarAts puro: cuerpo inválido", () => {
  const { errores } = validarAts({ formulario: "F02" }, { turno: null, items: [] });
  assert.ok(errores.length >= 2);
});

test("empresa del encabezado: catálogo con opciones; válida se guarda, ajena → 422, sin empresa → se acepta (vale la del encargado)", async () => {
  const { api, db } = armar();
  const c = await api.catalogo();
  assert.deepEqual(c.empresas, [{ id: 1, nombre: "COOP. EL SOL EJEMPLO", corto: "Coop. El Sol" }, { id: 3, nombre: "CORMET EJEMPLO", corto: "Cormet" }]);
  assert.equal(c.personas.deposito.find((p) => p.id === 17).empresa_id, 3);
  assert.equal(c.personas.deposito.find((p) => p.id === 18).empresa_id, null);
  await err(api.recibir(cuerpo({ x_empresa_id: 2 }), { sesion: SES }), 422, /Empresa inválida/);
  await err(api.recibir(cuerpo({ x_empresa_id: "3" }), { sesion: SES }), 422, /Empresa inválida/);
  const r = await api.recibir(cuerpo({ x_empresa_id: 3 }), { sesion: SES });
  assert.equal(r.estado, 201);
  assert.equal(db.x_hys_ats[0].x_empresa_id, 3);
  const b = armar();
  await b.api.recibir(cuerpo(), { sesion: SES });
  assert.equal("x_empresa_id" in b.db.x_hys_ats[0], false);
});

test("leerEmpresas: por defecto 1,3; configurable", () => {
  assert.deepEqual(leerEmpresas({}), [1, 3]);
  assert.deepEqual(leerEmpresas({ ODOO_ATS_EMPRESAS_IDS: "1, 2,x,2" }), [1, 2]);
  assert.equal(nombreCorto("CORMET S.A."), "Cormet");
});

test("leerFlagAtsObra y SECTORES incluyen obra", () => {
  assert.equal(leerFlagAtsObra({}), null);
  assert.equal(leerFlagAtsObra({ HYS_ATS_OBRA: "1" }), true);
  assert.equal(leerFlagAtsObra({ HYS_ATS_OBRA: "0" }), false);
  assert.ok(SECTORES.obra);
  assert.equal(SECTORES.obra.plantilla, "F08_OBRA");
});

test("catálogo sin obra por defecto (Odoo de hoy); con flag/odoo sí", async () => {
  const a = armar({ flagObra: false });
  const c = await a.api.catalogo();
  assert.equal(c.ats_obra_habilitado, false);
  assert.ok(!c.sectores.some((s) => s.codigo === "obra"));
  assert.equal(c.controles.F08_OBRA, undefined);
  assert.ok(!c.turnos.some((t) => t.sector === "obra"));

  const b = armar({ flagObra: true });
  const c2 = await b.api.catalogo();
  assert.equal(c2.ats_obra_habilitado, true);
  assert.ok(c2.sectores.some((s) => s.codigo === "obra"));
  assert.equal(c2.controles.F08_OBRA.length, 10);
  assert.ok(c2.turnos.some((t) => t.sector === "obra" && t.codigo_ats === "ATS-OBRA-001"));

  const d = armar({ flagObra: null, odooTieneObra: true });
  const c3 = await d.api.catalogo();
  assert.equal(c3.ats_obra_habilitado, true);
});

test("POST obra sin flag → 503; con flag exige x_ot_id y lo guarda", async () => {
  const off = armar({ flagObra: false });
  await err(off.api.recibir(cuerpo({ x_ot_id: 4146 }, { sector: "obra" }), { sesion: SES }), 503, /ATS de obra/);

  const { api, db } = armar({ flagObra: true });
  await err(api.recibir(cuerpo({}, { sector: "obra" }), { sesion: SES }), 422, /OF/);
  const r = await api.recibir(cuerpo({ x_ot_id: 4146, x_actividades: "Montaje de estructura en obra ejemplo" }, { sector: "obra", clave: K(90) }), { sesion: SES });
  assert.equal(r.estado, 201);
  assert.equal(db.x_hys_ats[0].x_sector, "obra");
  assert.equal(db.x_hys_ats[0].x_ot_id, 4146);
  assert.equal(db.x_hys_ats[0].x_codigo_ats, "ATS-OBRA-001");
  assert.equal(db.x_hys_ats[0].x_linea_ids.length, 10);
});

test("validarAts: obra sin OF falla; planta ignora x_ot_id", () => {
  const items = ITEMS.filter((x) => x.x_formulario === "F08_OBRA");
  const turno = TURNOS.find((t) => t.id === 3);
  const base = cuerpo({ x_ot_id: 4146 }, { sector: "obra" });
  const ok = validarAts(base, { turno, items, personas: null, empresas: new Set([1, 3]), minJustif: 10, ahora: AHORA });
  assert.equal(ok.errores.length, 0);
  assert.equal(ok.vals.x_ot_id, 4146);
  const sin = cuerpo({}, { sector: "obra" });
  delete sin.odoo.vals.x_ot_id;
  const bad = validarAts(sin, { turno, items, personas: null, empresas: null, minJustif: 10, ahora: AHORA });
  assert.ok(bad.errores.some((e) => e.campo === "x_ot_id"));
});
