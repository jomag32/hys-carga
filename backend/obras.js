// Reglas puras para GET /api/v1/obras (sin red: se prueban con `node --test`).

/** "OT 4101 - X", "0T-4101-X", "OT.4101 X", "ot4101" → "4101" (null si no tiene). */
export function numeroOt(nombre = "") {
  const m = String(nombre).match(/(?:^|[^A-Za-z0-9])[O0]T[\s.\-_:#]*(\d{3,5})(?!\d)/i);
  return m ? m[1] : null;
}

/** Proyectos que no son una obra real (bolsas genéricas tipo «VARIOS»). */
export const esExcluida = (nombre) => String(nombre ?? "").trim().toUpperCase() === "VARIOS";

const m2o = (v) => (Array.isArray(v) ? v[1] : null);

/** project.project (search_read) → [{id, name, ot, partner, director}] ordenado por OT. */
export function armarObras(registros) {
  return registros
    .filter((p) => !esExcluida(p.name))
    .map((p) => ({ id: p.id, name: String(p.name).trim(), ot: numeroOt(p.name), partner: m2o(p.partner_id), director: m2o(p.user_id) }))
    .sort((a, b) => (a.ot === null) - (b.ot === null) || Number(a.ot) - Number(b.ot) || a.name.localeCompare(b.name, "es"));
}
