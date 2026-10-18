// Catálogos de solo lectura para el celular: inspectores y hitos (Odoo vía MIA), con caché corta.
import { readFileSync, existsSync } from "node:fs";

const CACHE_MS = 5 * 60 * 1000;
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- inspectores
// Fuente (a): hr.employee activos de Odoo. Legajo = campo INSPECTORES_CAMPO_LEGAJO (por defecto
//   registration_number, «Employee Reference»; al 18/10/2026 está vacío en Odoo → legajo null).
//   Filtros opcionales: INSPECTORES_PUESTOS (nombres de puesto, coma) y INSPECTORES_EXCLUIR_DEPTOS
//   (por defecto «CESANTES»).
// Fuente (b), si está definida, manda: lista privada «legajo,nombre[,employee_id]» en la variable
//   INSPECTORES_CSV o en el archivo INSPECTORES_CSV_PATH (por defecto /etc/secrets/inspectores.csv,
//   «Secret File» de Render). Cada fila se vincula al hr.employee por employee_id o por nombre igual
//   (sin acentos ni mayúsculas); las que no se pueden vincular no se listan (x_inspector_id es un
//   many2one) y se cuentan en la cabecera X-Sin-Vincular. Nunca se sube a GitHub (repo público).
const CAMPOS_PROHIBIDOS = new Set(["pin", "barcode"]); // credenciales de asistencia: jamás se exponen

export function leerCsvInspectores() {
  let texto = process.env.INSPECTORES_CSV || null;
  const ruta = process.env.INSPECTORES_CSV_PATH || "/etc/secrets/inspectores.csv";
  if (!texto && existsSync(ruta)) texto = readFileSync(ruta, "utf8");
  if (!texto) return null;
  return parsearCsv(texto);
}

/** "legajo,nombre[,employee_id]" (con o sin encabezado; separador coma o punto y coma). */
export function parsearCsv(texto) {
  const filas = [];
  for (const cruda of String(texto).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("#")) continue;
    const [legajo, nombre, empleado] = linea.split(/[;,]/).map((x) => x?.trim().replace(/^"|"$/g, ""));
    if (/^legajo$/i.test(legajo)) continue; // encabezado
    if (!nombre) continue;
    filas.push({ legajo: legajo || null, nombre, employee_id: Number(empleado) || null });
  }
  return filas;
}

export function crearCatalogos(cliente) {
  let inspectores = { lista: null, hasta: 0, sinVincular: 0, fuente: null };
  const hitos = new Map(); // ot → {lista, hasta}

  async function leerInspectores() {
    if (inspectores.lista && Date.now() < inspectores.hasta) return inspectores;
    const campoLegajo = process.env.INSPECTORES_CAMPO_LEGAJO || "registration_number";
    if (CAMPOS_PROHIBIDOS.has(campoLegajo)) throw new Error(`INSPECTORES_CAMPO_LEGAJO no puede ser «${campoLegajo}»`);
    const dominio = [["active", "=", true]];
    const excluir = (process.env.INSPECTORES_EXCLUIR_DEPTOS ?? "CESANTES").split(",").map((s) => s.trim()).filter(Boolean);
    const puestos = (process.env.INSPECTORES_PUESTOS || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const d of excluir) dominio.push("|", ["department_id", "=", false], ["department_id.name", "not ilike", d]);
    if (puestos.length) dominio.push(["job_id.name", "in", puestos]);
    const csv = leerCsvInspectores();
    const campos = ["id", "name", campoLegajo];
    const emp = await cliente().ejecutar("hr.employee", "search_read", [csv ? [["active", "=", true]] : dominio], { fields: campos, order: "name" });
    let lista, sinVincular = 0;
    if (csv) {
      const porId = new Map(emp.map((e) => [e.id, e]));
      const porNombre = new Map();
      for (const e of emp) { const k = normalizar(e.name); porNombre.set(k, porNombre.has(k) ? null : e); } // null = nombre repetido
      lista = [];
      for (const f of csv) {
        const e = (f.employee_id && porId.get(f.employee_id)) || porNombre.get(normalizar(f.nombre));
        if (e) lista.push({ id: e.id, nombre: e.name, legajo: f.legajo });
        else sinVincular++;
      }
    } else {
      lista = emp.map((e) => ({ id: e.id, nombre: e.name, legajo: e[campoLegajo] ? String(e[campoLegajo]) : null }));
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    inspectores = { lista, hasta: Date.now() + CACHE_MS, sinVincular, fuente: csv ? "csv" : "odoo" };
    return inspectores;
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

  return { leerInspectores, leerHitos };
}
