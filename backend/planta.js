// F03 (Recorrida semanal de Fábrica) y F04 (Check mensual de instalaciones): rama «planta» del
// POST /api/v1/inspecciones y catálogo GET /api/v1/inspecciones/catalogo. Mismo modelo que F02
// (x_hys_inspeccion + x_hys_inspeccion_linea), sin OT, ficha ni hitos.
// Decisiones de Jorge (25/10/2026): vence viernes 23:59 configurable (x_hys_config.x_f03_dia_vence);
// 2.ª de la semana → fuera_programa (y se avisa); el «No» queda en la línea (x_hys_desvio con F07);
// toma de conocimiento precargada con el Jefe de Producción, editable; valida Dirección de Fábrica
// (x_validador_fabrica_id); la recorrida completa la «programada» de la semana que crea Odoo.
// Nombres reales: solo en Odoo; el repo (público) no tiene ninguno.

const CACHE_MS = 5 * 60 * 1000;
export const TZ_HORAS = -3; // Argentina, sin horario de verano

export const FORMULARIOS_PLANTA = ["F03", "F04"];
export const SECTORES_FABRICA = [
  ["corte_laser", "Corte Láser"], ["corte_plegado", "Corte y Plegado"], ["conformado", "Conformado"],
  ["estructura_soldadura", "Estructura y Soldadura"], ["carpinteria", "Carpintería Metálica"], ["pintura", "Pintura"],
  ["aluminio", "Aluminio"],
  // Decisión 6 (25/10/2026): «Recepción y Depósito» de F03 es el mismo lugar que «Depósito Central» de F08.
  // Se conserva la clave técnica (ya existe en Odoo) y se usa un solo nombre visible: «Depósito Central».
  ["recepcion_deposito", "Depósito Central"]];
export const DIAS = ["lun", "mar", "mie", "jue", "vie"];

/** Programa de cada formulario: tipo «del programa», período y plantilla de ítems. */
export function reglasDe(formulario, lugar) {
  if (formulario === "F03") return { tipo: "recorrida_semanal", periodo: "semana", plantilla: "F03", lugar: "fabrica", ambito: "fabrica" };
  if (formulario === "F04") {
    const l = lugar === "oficina" ? "oficina" : "fabrica";
    return { tipo: "check_mensual", periodo: "mes", plantilla: l === "oficina" ? "F04_OFI" : "F04_FAB", lugar: l, ambito: l };
  }
  return null;
}

// ---------------------------------------------------------------- fechas (UTC «AAAA-MM-DD HH:MM:SS» ↔ hora local)
const aDate = (s) => new Date(s.replace(" ", "T") + "Z");
const aTexto = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const localAUtc = (a, m, d, hh, mm, ss) => aTexto(new Date(Date.UTC(a, m, d, hh - TZ_HORAS, mm, ss)));

/**
 * Período de una fecha de control (UTC). Semana: lunes 00:00 a domingo 23:59:59 (hora local);
 * vence el día configurado (lun…vie) a las 23:59. Mes: del 1 al último día; vence el día N a las 23:59.
 * → {inicio, fin, vence} en UTC «AAAA-MM-DD HH:MM:SS».
 */
export function periodoDe(fechaUtc, { periodo = "semana", diaVence = "vie", diaMes = 7 } = {}) {
  const local = new Date(aDate(fechaUtc).getTime() + TZ_HORAS * 3600e3); // campos UTC = hora local
  const a = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  if (periodo === "mes") {
    const ult = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
    return { inicio: localAUtc(a, m, 1, 0, 0, 0), fin: localAUtc(a, m, ult, 23, 59, 59),
      vence: localAUtc(a, m, Math.min(Math.max(1, Number(diaMes) || 7), ult), 23, 59, 0) };
  }
  const lunes = d - ((local.getUTCDay() + 6) % 7);
  const dv = DIAS.includes(diaVence) ? DIAS.indexOf(diaVence) : 4; // desconocido → viernes
  return { inicio: localAUtc(a, m, lunes, 0, 0, 0), fin: localAUtc(a, m, lunes + 6, 23, 59, 59), vence: localAUtc(a, m, lunes + dv, 23, 59, 0) };
}

// ---------------------------------------------------------------- ítems de respaldo (si el catálogo de Odoo falla o está vacío)
// Mismos códigos y textos que Diseno-App-HyS-plantilla-items.csv (PR-HYS-001 v1). D-07: Odoo primero; esto es respaldo.
const B = { maq: "Máquinas (Láser, Plegado, Conformado)", sol: "Soldadura y gases", iza: "Izaje y puente grúa", aut: "Autoelevador",
  ing: "Ingreso de mercadería y carga/descarga", ord: "Orden, EPP y almacenamiento" };
const it = (codigo, bloque, nombre, i) => ({ codigo, bloque, nombre, secuencia: (i + 1) * 10, critico: false, admite_na: true });
export const ITEMS_RESPALDO = {
  F03: [[B.maq, "Láser: cabina, enclavamientos y extracción"], [B.maq, "Plegadora y guillotina: protección del punto de operación y pedal"],
    [B.maq, "Bloqueo y rotulado de equipos en mantenimiento"], [B.sol, "Extracción de humos funcionando en los puestos"],
    [B.sol, "Cilindros encadenados, oxígeno separado del combustible"], [B.sol, "Mamparas para proteger al resto del sector"],
    [B.iza, "Ganchos con traba, eslingas y cadenas sin daños"], [B.iza, "Carga máxima indicada y botonera en buen estado"],
    [B.iza, "Nadie trabaja bajo carga suspendida"], [B.aut, "Check preuso del operador hecho en el día"],
    [B.aut, "Operador habilitado; luces, bocina y alarma de retroceso"], [B.ing, "Zona de descarga demarcada y despejada de personas"],
    [B.ing, "Camión frenado y calzado antes de descargar"], [B.ing, "Estiba de chapas y perfiles estable, con separadores"],
    [B.ing, "Autoelevador o grúa operados solo por personal habilitado"], [B.ord, "EPP completo en uso en todos los sectores"],
    [B.ord, "Estanterías ancladas y sin sobrecarga"], [B.ord, "Residuos y recortes en su contenedor"]]
    .map(([b, n], i) => it(`F03-${String(i + 1).padStart(2, "0")}`, b, n, i)),
  F04_FAB: [["Extintores", "Carga y precinto vigentes, manómetro en verde"], ["Extintores", "Accesibles, señalizados y con tarjeta de control"],
    ["Emergencia", "Luces de emergencia: prueba de encendido"], ["Emergencia", "Salidas de emergencia libres, señalizadas y que abren hacia afuera"],
    ["Emergencia", "Punto de reunión señalizado"], ["Electricidad", "Disyuntores: prueba con el botón de test"],
    ["Electricidad", "Tableros cerrados, rotulados y sin partes vivas expuestas"], ["Primeros auxilios", "Botiquines completos y en fecha"],
    ["Inflamables y presión", "Depósito de pinturas y solventes ventilado, con contención de derrames"],
    ["Inflamables y presión", "Compresor: válvula de seguridad y purga del tanque"]]
    .map(([b, n], i) => it(`F04F-${String(i + 1).padStart(2, "0")}`, b, n, i)),
  F04_OFI: [["Extintores", "Carga y precinto vigentes, manómetro en verde"], ["Extintores", "Accesibles y señalizados"],
    ["Emergencia", "Luces de emergencia: prueba de encendido"], ["Emergencia", "Salidas libres y señalizadas"],
    ["Emergencia", "Plano de evacuación visible y actualizado"], ["Electricidad", "Disyuntor: prueba con el botón de test"],
    ["Electricidad", "Sin zapatillas en cadena ni cables por el piso"], ["Primeros auxilios", "Botiquín completo y en fecha"]]
    .map(([b, n], i) => it(`F04O-${String(i + 1).padStart(2, "0")}`, b, n, i))
};

// ---------------------------------------------------------------- lectura de Odoo (MIA, solo lectura)
export const AVISO_SIN_JEFE = "Todavía no hay Jefe de Producción elegido en Odoo: escribí a mano quién toma conocimiento.";
/** Aviso sin validador, según formulario: F03 «la recorrida», F04 «el check». */
export const avisoSinValidador = (lugar, formulario = "F03") => {
  const quien = lugar === "oficina" ? "Todavía no hay COO elegido en Odoo" : "Todavía no hay Dirección de Fábrica elegida en Odoo";
  const que = formulario === "F04" ? "el check se guarda" : "la recorrida se guarda";
  return `${quien}: ${que} sin validador (HyS lo asigna después).`;
};
const CAMPOS_CONFIG = ["x_jefe_produccion_id", "x_validador_fabrica_id", "x_coo_id", "x_f03_dia_vence", "x_f04_dia_vence"];
const m2o = (v) => (Array.isArray(v) ? { id: v[0], nombre: v[1] } : null);

export function crearPlanta(cliente, { ahora = () => Date.now() } = {}) {
  const ej = (...a) => cliente().ejecutar(...a);
  let cfg = { v: null, hasta: 0 };
  const items = new Map(); // plantilla → {lista, fuente, hasta}

  /** x_hys_config (un registro): solo los campos que existen (fields_get), así no falla antes del paso 1. */
  async function config() {
    if (cfg.v && ahora() < cfg.hasta) return cfg.v;
    let v = { jefe_produccion: null, validador_fabrica: null, coo: null, dia_vence: "vie", dia_mes: 7, sectores: {} };
    try {
      const fg = await ej("x_hys_config", "fields_get", [], { attributes: ["type"] });
      const campos = CAMPOS_CONFIG.filter((k) => fg[k]);
      if (campos.length) {
        const r = (await ej("x_hys_config", "search_read", [[]], { fields: campos, limit: 1, order: "id" }))[0] || {};
        v = { jefe_produccion: m2o(r.x_jefe_produccion_id), validador_fabrica: m2o(r.x_validador_fabrica_id), coo: m2o(r.x_coo_id),
          dia_vence: DIAS.includes(r.x_f03_dia_vence) ? r.x_f03_dia_vence : "vie", dia_mes: Number(r.x_f04_dia_vence) || 7, sectores: {} };
      }
    } catch { /* sin config: valores por defecto (viernes / día 7) */ }
    // Responsables por sector (x_hys_sector_resp, opcional y vacío al principio): si no existe o falla, se usa el Jefe de Producción.
    try {
      const regs = await ej("x_hys_sector_resp", "search_read", [[]], { fields: ["x_sector", "x_tc_usuario_id", "x_tc_nombre", "x_responsable_id"], order: "id" });
      for (const r of regs || []) {
        if (!r.x_sector) continue;
        const u = m2o(r.x_tc_usuario_id);
        v.sectores[r.x_sector] = { tc: u?.nombre || (r.x_tc_nombre || "").trim() || null, responsable: m2o(r.x_responsable_id) };
      }
    } catch { /* modelo todavía no creado: sin relaciones por sector */ }
    cfg = { v, hasta: ahora() + CACHE_MS };
    return v;
  }

  /** Ítems activos de la plantilla (Odoo); si no hay o falla, respaldo fijo. */
  async function leerItems(plantilla) {
    const c = items.get(plantilla);
    if (c && ahora() < c.hasta) return c;
    let lista = [], fuente = "odoo";
    try {
      const regs = await ej("x_hys_item_plantilla", "search_read", [[["x_formulario", "=", plantilla], ["x_active", "=", true]]],
        { fields: ["id", "x_codigo", "x_name", "x_bloque", "x_critico", "x_secuencia", "x_admite_na"], order: "x_secuencia, id" });
      lista = (regs || []).map((r) => ({ id: r.id, codigo: r.x_codigo, nombre: r.x_name, bloque: r.x_bloque, secuencia: r.x_secuencia ?? 0,
        critico: !!r.x_critico, admite_na: r.x_admite_na !== false }));
    } catch { lista = []; }
    if (!lista.length) { lista = ITEMS_RESPALDO[plantilla] || []; fuente = "respaldo"; }
    const v = { lista, fuente, hasta: ahora() + CACHE_MS };
    items.set(plantilla, v);
    return v;
  }

  /** Inspecciones del período (por x_fecha_vencimiento) del mismo programa. */
  async function delPeriodo(formulario, reglas, periodo) {
    const dom = [["x_formulario", "=", formulario], ["x_tipo_programa", "=", reglas.tipo],
      ["x_fecha_vencimiento", ">=", periodo.inicio], ["x_fecha_vencimiento", "<=", periodo.fin]];
    if (formulario === "F04") dom.push(["x_lugar", "=", reglas.lugar]);
    return ej("x_hys_inspeccion", "search_read", [dom], { fields: ["id", "x_name", "x_estado"], order: "id" });
  }

  /** GET /api/v1/inspecciones/catalogo?formulario=F03|F04[&lugar=fabrica|oficina] */
  async function catalogo(formulario, lugar = null) {
    const reglas = reglasDe(formulario, lugar);
    if (!reglas) return null;
    const [c, its] = await Promise.all([config(), leerItems(reglas.plantilla)]);
    const per = periodoDe(aTexto(new Date(ahora())), { periodo: reglas.periodo, diaVence: c.dia_vence, diaMes: c.dia_mes });
    let estado = { realizada: false, programada: false };
    try {
      const regs = await delPeriodo(formulario, reglas, per);
      estado = { realizada: regs.some((r) => r.x_estado === "realizada"), programada: regs.some((r) => r.x_estado === "programada") };
    } catch { /* sin dato: el celular no muestra el aviso */ }
    const tc = reglas.lugar === "fabrica" ? c.jefe_produccion?.nombre || null : null;
    const validador = reglas.lugar === "oficina" ? c.coo : c.validador_fabrica;
    const avisos = [];
    if (reglas.lugar === "fabrica" && !tc) avisos.push(AVISO_SIN_JEFE);
    if (!validador) avisos.push(avisoSinValidador(reglas.lugar, formulario));
    return { formulario, lugar: reglas.lugar, plantilla: reglas.plantilla, fuente_items: its.fuente,
      items: its.lista.map(({ codigo, nombre, bloque, secuencia, critico, admite_na }) => ({ codigo, nombre, bloque, secuencia, critico, admite_na })),
      sectores: formulario === "F03" ? SECTORES_FABRICA : [],
      responsables_sector: formulario === "F03" ? Object.fromEntries(SECTORES_FABRICA.map(([k]) => [k, delSector(c, k)])) : {},
      toma_conocimiento: { nombre: tc, editable: true, aviso: tc || reglas.lugar !== "fabrica" ? null : AVISO_SIN_JEFE },
      validador: validador ? { nombre: validador.nombre } : null,
      avisos,
      periodo: { tipo: reglas.periodo, ...per, ...estado,
        aviso: estado.realizada ? (reglas.periodo === "semana"
          ? "Ya hay una recorrida realizada esta semana: si cargás otra, se registra como «fuera de programa»."
          : "Ya hay un check realizado este mes en este lugar: si cargás otro, se registra como «fuera de programa».") : null } };
  }

  /** Quién toma conocimiento y quién es responsable del cambio en un sector: el del sector, o el Jefe de Producción, o nadie. */
  function delSector(c, sector) {
    const s = c.sectores?.[sector] || {};
    const jefe = c.jefe_produccion;
    return {
      toma_conocimiento: s.tc ? { nombre: s.tc, fuente: "sector" } : jefe ? { nombre: jefe.nombre, fuente: "jefe_produccion" } : { nombre: null, fuente: null },
      responsable: s.responsable ? { ...s.responsable, fuente: "sector" } : jefe ? { ...jefe, fuente: "jefe_produccion" } : { id: null, nombre: null, fuente: null },
    };
  }

  const olvidar = () => { cfg = { v: null, hasta: 0 }; items.clear(); };
  return { config, leerItems, delPeriodo, catalogo, delSector, olvidar };
}
