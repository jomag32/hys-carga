// Visitas programadas del cronograma HyS (x_hys_inspeccion en estado «programada»).
// F02 (obra, por OT) y F03 (fábrica, por sector de visita). La F03 semanal oficial
// (sin x_sector_visita) sigue el período de planta.js y no se confunde con una visita sectorial.
// Fechas en hora de Argentina (UTC-3, sin horario de verano).

export const TZ_HORAS = -3;

/** Sectores de visita del plan (encabezado de la inspección, x_sector_visita). */
export const SECTORES_VISITA = [
  ["carpinteria", "Carpintería metálica"],
  ["estructura", "Estructura"],
  ["conformado", "Conformado"],
  ["corte_laser", "Corte láser"],
  ["deposito", "Depósito central"],
  ["logistica", "Logística y mantenimiento"],
  ["carpinteria_estructura", "Carpintería metálica / Estructura"],
  ["conformado_corte_laser", "Conformado / Corte láser"],
  ["deposito_logistica", "Depósito central / Logística y mantenimiento"],
  ["obra", "Obra"],
];

export const etiquetaSectorVisita = (cod) => SECTORES_VISITA.find(([k]) => k === cod)?.[1] || cod || null;

const aDate = (s) => {
  const t = String(s || "").trim();
  if (!t) return null;
  if (t.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(t)) return new Date(t);
  return new Date(t.replace(" ", "T") + "Z");
};

/** Fecha de calendario en Argentina (AAAA-MM-DD) a partir de un UTC «AAAA-MM-DD HH:MM:SS». */
export function fechaArt(utcTexto) {
  const d = aDate(utcTexto);
  if (!d || Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + TZ_HORAS * 3600e3);
  const y = local.getUTCFullYear(), m = local.getUTCMonth() + 1, day = local.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mismoDiaArt(a, b) {
  const fa = fechaArt(a), fb = fechaArt(b);
  return !!(fa && fb && fa === fb);
}

/** Inicio y fin (UTC) del día de calendario en Argentina de una fecha UTC. */
export function diaArtDe(utcTexto) {
  const dia = fechaArt(utcTexto);
  if (!dia) return null;
  const [y, m, d] = dia.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d, 0 - TZ_HORAS, 0, 0));
  const fin = new Date(Date.UTC(y, m - 1, d, 23 - TZ_HORAS, 59, 59));
  const txt = (x) => x.toISOString().slice(0, 19).replace("T", " ");
  return { dia, inicio: txt(inicio), fin: txt(fin) };
}

const idOt = (v) => (Array.isArray(v) ? v[0] : v) || false;
const sectorDe = (r) => r.x_sector_visita || false;

function compatible(reg, { formulario, otId, sectorVisita }) {
  if (reg.x_formulario !== formulario) return false;
  if (formulario === "F02") return !otId || !idOt(reg.x_ot_id) || idOt(reg.x_ot_id) === otId;
  // F03: visita sectorial solo cierra otra del mismo sector; la semanal oficial (sin sector) solo cierra otra sin sector.
  const sReg = sectorDe(reg);
  const sEnv = sectorVisita || false;
  return sReg === sEnv;
}

/**
 * Elige la programada a completar.
 * 1) Si el celular manda programada_id y sigue abierta y es compatible, se usa esa.
 * 2) Si no, la del mismo tipo (F02/F03), misma OT o mismo sector, del mismo día (Argentina).
 *    Si hay varias ese día, la de vencimiento más cercano a la hora del control (y menor id).
 * 3) Si no hay, null (el backend crea un registro nuevo).
 */
export function elegirProgramada(regs, { formulario, otId = null, sectorVisita = null, fechaControl, programadaId = null } = {}) {
  const abiertas = (regs || []).filter((r) => r.x_estado === "programada");
  if (programadaId) {
    const pedida = abiertas.find((r) => r.id === programadaId);
    if (pedida && compatible(pedida, { formulario, otId, sectorVisita })) return pedida;
  }
  const delDia = abiertas.filter((r) => compatible(r, { formulario, otId, sectorVisita }) && mismoDiaArt(r.x_fecha_vencimiento, fechaControl));
  if (!delDia.length) return null;
  const t = aDate(fechaControl)?.getTime() || 0;
  delDia.sort((a, b) => {
    const da = Math.abs((aDate(a.x_fecha_vencimiento)?.getTime() || 0) - t);
    const db = Math.abs((aDate(b.x_fecha_vencimiento)?.getTime() || 0) - t);
    return da - db || a.id - b.id;
  });
  return delDia[0];
}

const CAMPOS_PROG = ["id", "x_name", "x_formulario", "x_estado", "x_tipo_programa", "x_ot_id",
  "x_sector_visita", "x_fecha_vencimiento", "x_ambito", "x_lugar", "x_inspector_hys_id"];

function publico(r) {
  const ot = r.x_ot_id;
  return {
    id: r.id,
    nombre: r.x_name,
    formulario: r.x_formulario,
    tipo_programa: r.x_tipo_programa,
    ot_id: idOt(ot) || null,
    ot_nombre: Array.isArray(ot) ? ot[1] : null,
    sector_visita: sectorDe(r) || null,
    sector_visita_nombre: etiquetaSectorVisita(sectorDe(r)),
    vence: r.x_fecha_vencimiento || null,
    ambito: r.x_ambito || null,
  };
}

/**
 * Lectura de programadas (solo search_read). Si el campo x_sector_visita todavía no existe en Odoo,
 * se omite del domain y de los fields (la app igual lista F02 por OT y fecha).
 */
export function crearProgramadas(cliente) {
  const ej = (...a) => cliente().ejecutar(...a);

  let sectorHasta = 0, sectorHay = false;
  async function tieneSectorVisita() {
    const n = Date.now();
    if (n < sectorHasta) return sectorHay;
    try {
      const fg = await ej("x_hys_inspeccion", "fields_get", [], { attributes: ["type"] });
      sectorHay = !!fg.x_sector_visita;
    } catch { sectorHay = false; }
    sectorHasta = n + 5 * 60 * 1000;
    return sectorHay;
  }

  async function leerPorId(id) {
    if (!Number.isInteger(id)) return null;
    const conSector = await tieneSectorVisita();
    const fields = CAMPOS_PROG.filter((k) => conSector || k !== "x_sector_visita");
    try {
      return (await ej("x_hys_inspeccion", "search_read", [[["id", "=", id], ["x_estado", "=", "programada"]]], { fields, limit: 1 }))[0] || null;
    } catch { return null; }
  }

  async function buscarDelDia(formulario, fechaControl, { otId = null, sectorVisita = undefined } = {}) {
    const dia = diaArtDe(fechaControl);
    if (!dia) return [];
    const conSector = await tieneSectorVisita();
    const fields = CAMPOS_PROG.filter((k) => conSector || k !== "x_sector_visita");
    const dom = [
      ["x_formulario", "=", formulario],
      ["x_estado", "=", "programada"],
      ["x_fecha_vencimiento", ">=", dia.inicio],
      ["x_fecha_vencimiento", "<=", dia.fin],
    ];
    if (formulario === "F02" && otId) dom.push(["x_ot_id", "=", otId]);
    if (conSector && sectorVisita !== undefined) {
      if (sectorVisita) dom.push(["x_sector_visita", "=", sectorVisita]);
      else dom.push(["x_sector_visita", "=", false]);
    }
    try {
      return await ej("x_hys_inspeccion", "search_read", [dom], { fields, order: "x_fecha_vencimiento, id" });
    } catch { return []; }
  }

  /** Programadas de hoy (y, en F03, la semanal oficial abierta de esta semana, aunque venza el viernes). */
  async function listarHoy(formulario, { ahoraUtc, otId = null, semana = null } = {}) {
    const fecha = ahoraUtc || new Date().toISOString().slice(0, 19).replace("T", " ");
    const delDia = await buscarDelDia(formulario, fecha, { otId });
    const vistos = new Set(delDia.map((r) => r.id));
    const extra = [];
    if (formulario === "F03" && semana) {
      const conSector = await tieneSectorVisita();
      const fields = CAMPOS_PROG.filter((k) => conSector || k !== "x_sector_visita");
      const dom = [
        ["x_formulario", "=", "F03"],
        ["x_estado", "=", "programada"],
        ["x_tipo_programa", "=", "recorrida_semanal"],
        ["x_fecha_vencimiento", ">=", semana.inicio],
        ["x_fecha_vencimiento", "<=", semana.fin],
      ];
      try {
        for (const r of await ej("x_hys_inspeccion", "search_read", [dom], { fields, order: "id" })) {
          if (!vistos.has(r.id) && !r.x_sector_visita) extra.push(r);
        }
      } catch { /* sin dato */ }
    }
    return [...delDia, ...extra].map(publico);
  }

  return { tieneSectorVisita, buscarDelDia, listarHoy, leerPorId, publico };
}

export { publico as programadaPublica };
