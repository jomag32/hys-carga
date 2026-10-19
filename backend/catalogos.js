// Catálogos de solo lectura para el celular: inspectores (x_hys_inspector), fichas F01 (x_hys_ficha) con
// sus riesgos e hitos (x_hys_ficha_hito). Odoo vía MIA (solo lectura), con caché corta.

const CACHE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- inspectores
// Decisión de Jorge (18/10/2026 10:22): la lista NO sale de Empleados ni de Usuarios de Odoo (los
// inspectores externos no están ahí). Sale del modelo propio de la app HyS: x_hys_inspector
// («HyS > Inspectores»), solo los activos (x_active). MIA tiene solo lectura sobre ese modelo.

/** Texto que queda copiado en la inspección (x_inspector_texto): «Legajo N · Nombre[ · externo · Empresa]». */
export function textoInspector(r) {
  const nombre = String(r.x_name ?? r.nombre ?? "").trim();
  const legajo = r.x_legajo ?? r.legajo;
  const tipo = r.x_tipo ?? r.tipo;
  const empresa = r.x_empresa ?? r.empresa;
  return [legajo ? `Legajo ${String(legajo).trim()}` : null, nombre,
    tipo === "externo" ? (empresa ? `externo · ${String(empresa).trim()}` : "externo") : null].filter(Boolean).join(" · ");
}

const CAMPOS_FICHA = ["id", "x_name", "x_estado", "x_ot_id", "x_clase_riesgo", "x_clase_motivo", "x_clase_calculada_el", "x_frecuencia_dias",
  "x_modalidad", "x_distancia_km", "x_faltan_hitos", "x_aviso_ugeop", "x_aviso", "x_riesgo_ids", "x_fecha_aprobacion"];
const CAMPOS_HITO = ["id", "x_ficha_id", "x_name", "x_riesgo_hys", "x_riesgo_ids", "x_inicio_previsto", "x_inicio_real", "x_alcanzado", "x_situacion", "x_secuencia"];
const m2oId = (v) => (Array.isArray(v) ? v[0] : v || null);
const nada = (v) => (v === false || v === undefined ? null : v);
const codigos = (ids, mapa) => (ids || []).map((id) => mapa.get(id)).filter(Boolean)
  .sort((a, b) => a.secuencia - b.secuencia).map(({ codigo, nombre, gravedad }) => ({ codigo, nombre, gravedad }));

export function armarHito(hh, mapa) {
  return { id: hh.id, name: hh.x_name, riesgo_hys: hh.x_riesgo_hys || null, critico: hh.x_riesgo_hys === "critico",
    inicio_previsto: nada(hh.x_inicio_previsto), inicio_real: nada(hh.x_inicio_real), alcanzado: !!hh.x_alcanzado,
    situacion: nada(hh.x_situacion), riesgos: codigos(hh.x_riesgo_ids, mapa).map((r) => r.codigo) };
}
export function armarFicha(r, mapa, hitos) {
  return { id: r.id, nombre: nada(r.x_name), ot: m2oId(r.x_ot_id), estado: r.x_estado || "borrador", aprobada: r.x_estado === "aprobada",
    clase: r.x_clase_riesgo || "A", motivo: nada(r.x_clase_motivo), clase_calculada_el: nada(r.x_clase_calculada_el),
    frecuencia_dias: nada(r.x_frecuencia_dias), modalidad: nada(r.x_modalidad), distancia_km: nada(r.x_distancia_km),
    faltan_hitos: !!r.x_faltan_hitos, aviso_ugeop: !!r.x_aviso_ugeop, aviso: nada(r.x_aviso),
    riesgos: codigos(r.x_riesgo_ids, mapa), hitos };
}

export function crearCatalogos(cliente) {
  let inspectores = { lista: null, hasta: 0, fuente: null };

  async function leerInspectores() {
    if (inspectores.lista && Date.now() < inspectores.hasta) return inspectores;
    const regs = await cliente().ejecutar("x_hys_inspector", "search_read", [[["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa"], order: "x_name, id" });
    const lista = regs.map((r) => ({ id: r.id, nombre: String(r.x_name || "").trim(), legajo: r.x_legajo ? String(r.x_legajo).trim() : null,
      tipo: r.x_tipo || "interno", empresa: r.x_empresa ? String(r.x_empresa).trim() : null }));
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    inspectores = { lista, hasta: Date.now() + CACHE_MS, fuente: "x_hys_inspector" };
    return inspectores;
  }

  /** Inspector activo por id (para el envío); null si no existe o está archivado. Sin caché. */
  async function buscarInspector(id) {
    const r = await cliente().ejecutar("x_hys_inspector", "search_read", [[["id", "=", id], ["x_active", "=", true]]],
      { fields: ["id", "x_name", "x_legajo", "x_tipo", "x_empresa"], limit: 1 });
    return r[0] || null;
  }

  // ---------------------------------------------------------------- F01 · fichas de riesgo (x_hys_ficha)
  // Ficha ACTIVA (x_active) de cada OT, con sus riesgos (x_hys_riesgo) y sus hitos (x_hys_ficha_hito).
  // MIA solo lee. La clase y el motivo los calcula Odoo (acción A-CLASE): acá se copian tal cual.
  let riesgos = { mapa: null, hasta: 0 };
  let fichas = { lista: null, hasta: 0 };

  async function leerRiesgos() {
    if (riesgos.mapa && Date.now() < riesgos.hasta) return riesgos.mapa;
    const regs = await cliente().ejecutar("x_hys_riesgo", "search_read", [[]],
      { fields: ["id", "x_codigo", "x_name", "x_gravedad", "x_secuencia", "x_active"], order: "x_secuencia, id", context: { active_test: false } });
    riesgos = { mapa: new Map(regs.map((r) => [r.id, { id: r.id, codigo: r.x_codigo, nombre: r.x_name, gravedad: r.x_gravedad || null, secuencia: r.x_secuencia ?? 0, activo: r.x_active !== false }])),
      hasta: Date.now() + CACHE_MS };
    return riesgos.mapa;
  }

  /** Lee fichas activas (todas o de una OT) con hitos y riesgos, en el formato del celular. */
  async function leerFichasDeOdoo(ot = null) {
    const dominio = [["x_active", "=", true]];
    if (ot) dominio.push(["x_ot_id", "=", ot]);
    const regs = await cliente().ejecutar("x_hys_ficha", "search_read", [dominio], { fields: CAMPOS_FICHA, order: "id desc" });
    if (!regs.length) return [];
    const [mapa, hitosRegs] = await Promise.all([leerRiesgos(),
      cliente().ejecutar("x_hys_ficha_hito", "search_read", [[["x_ficha_id", "in", regs.map((r) => r.id)]]],
        { fields: CAMPOS_HITO, order: "x_secuencia, id" })]);
    const porFicha = new Map();
    for (const hh of hitosRegs) {
      const fid = Array.isArray(hh.x_ficha_id) ? hh.x_ficha_id[0] : hh.x_ficha_id;
      if (!porFicha.has(fid)) porFicha.set(fid, []);
      porFicha.get(fid).push(armarHito(hh, mapa));
    }
    // Una ficha activa por OT (regla de Odoo); si hubiera dos, gana la más nueva (id mayor).
    const vistas = new Set();
    return regs.filter((r) => { const o = m2oId(r.x_ot_id); if (vistas.has(o)) return false; vistas.add(o); return true; })
      .map((r) => armarFicha(r, mapa, porFicha.get(r.id) || []));
  }

  /** Todas las fichas activas (caché 5 min) — para GET /api/v1/fichas y copia sin señal en el celular. */
  async function leerFichas() {
    if (fichas.lista && Date.now() < fichas.hasta) return fichas.lista;
    const lista = await leerFichasDeOdoo();
    fichas = { lista, hasta: Date.now() + CACHE_MS };
    return lista;
  }

  /** Ficha activa de una OT. fresca = sin caché (para el envío: la clase se copia al momento de recibir). */
  async function fichaDeOt(ot, { fresca = false } = {}) {
    if (!fresca) return (await leerFichas()).find((f) => f.ot === ot) || null;
    return (await leerFichasDeOdoo(ot))[0] || null;
  }

  /** Hitos de la ficha activa de la OT (ya no project.milestone). [] si la OT no tiene ficha. */
  async function leerHitos(ot) {
    return (await fichaDeOt(ot))?.hitos || [];
  }

  /** Riesgos activos para el F01 del celular: [{id, codigo, nombre, gravedad}] ordenados. */
  async function listarRiesgos() {
    return [...(await leerRiesgos()).values()].filter((r) => r.activo).sort((a, b) => a.secuencia - b.secuencia || a.id - b.id)
      .map(({ id, codigo, nombre, gravedad }) => ({ id, codigo, nombre, gravedad }));
  }
  /** Después de crear una Ficha: la próxima lectura va a Odoo. */
  const olvidarFichas = () => { fichas = { lista: null, hasta: 0 }; };

  return { leerInspectores, buscarInspector, leerHitos, leerFichas, fichaDeOt, leerRiesgos, listarRiesgos, olvidarFichas };
}
