// Catálogos de solo lectura para el celular: inspectores (x_hys_inspector) e hitos (Odoo vía MIA), con caché corta.

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

export function crearCatalogos(cliente) {
  let inspectores = { lista: null, hasta: 0, fuente: null };
  const hitos = new Map(); // ot → {lista, hasta}

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

  async function leerHitos(ot) {
    const c = hitos.get(ot);
    if (c && Date.now() < c.hasta) return c.lista;
    const regs = await cliente().ejecutar("project.milestone", "search_read", [[["project_id", "=", ot]]],
      { fields: ["id", "name", "deadline", "is_reached"], order: "deadline, id" });
    const lista = regs.map((h) => ({ id: h.id, name: h.name, fecha_limite: h.deadline || null, alcanzado: !!h.is_reached }));
    hitos.set(ot, { lista, hasta: Date.now() + CACHE_MS });
    return lista;
  }

  return { leerInspectores, buscarInspector, leerHitos };
}
