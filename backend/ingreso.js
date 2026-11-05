// Ingreso por inspector (decisión de Jorge 18/10/2026 19:34; contraseña en Odoo 05/11/2026):
// cada inspector activo de x_hys_inspector tiene SU contraseña. Orden de resolución:
//   1) x_hys_password en Odoo (si no está vacío) — lo edita HyS en Inspectores
//   2) HYS_PWD_<legajo> / HYS_LOGIN_PASSWORDS en el entorno (Render), como respaldo
// Legajo "0001" y "1" son el mismo. Contraseñas comparadas en Unicode NFC y sin espacios en las puntas
// (la «ñ» de Android y la de iPhone pueden venir compuestas o descompuestas).
// POST /api/v1/ingreso {inspector_id, clave} → {token, vence, inspector}. El token firma (HMAC) el id y
// legajo del inspector con una clave derivada de SU contraseña: si se cambia la contraseña, sus
// sesiones dejan de valer. Sin estado en el servidor (el plan free se reinicia seguido).
// Nunca se registran contraseñas en logs.
import crypto from "node:crypto";

export const SIN_CLAVE = "Este inspector no tiene contraseña configurada, consultá a HyS";
const VIGENCIA_MS = 60 * 24 * 3600 * 1000; // 60 días
const FALLOS_MAX = 8, FALLOS_VENTANA_MS = 15 * 60 * 1000;

export class ErrorIngreso extends Error {
  constructor(estado, mensaje, codigo) { super(mensaje); this.estado = estado; this.codigo = codigo; }
}

export const normalizarClave = (c) => String(c ?? "").normalize("NFC").trim();
export const normalizarLegajo = (l) => { const s = String(l ?? "").trim(); return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase(); };

/** Map legajo normalizado → contraseña normalizada, desde el entorno. */
export function leerClaves(env = process.env) {
  const m = new Map();
  if (env.HYS_LOGIN_PASSWORDS) {
    try {
      for (const [l, c] of Object.entries(JSON.parse(env.HYS_LOGIN_PASSWORDS))) if (normalizarClave(c)) m.set(normalizarLegajo(l), normalizarClave(c));
    } catch (e) { console.warn("HYS_LOGIN_PASSWORDS no es un JSON válido; se ignora"); }
  }
  for (const [k, v] of Object.entries(env)) {
    const x = /^HYS_PWD_(.+)$/.exec(k);
    if (x && normalizarClave(v)) m.set(normalizarLegajo(x[1]), normalizarClave(v));
  }
  return m;
}

/**
 * Contraseña efectiva del inspector: Odoo (x_hys_password) si no está vacío; si no, entorno.
 * `insp.x_hys_password` puede ser false/null/"" cuando el campo está vacío en Odoo.
 */
export function claveDeInspector(insp, envMap = leerClaves()) {
  // Odoo JSON-RPC / XML-RPC devuelve false (boolean) cuando el Char está vacío — no es la palabra "false".
  const crudo = insp?.x_hys_password;
  const deOdoo = (crudo === false || crudo == null) ? "" : normalizarClave(crudo);
  if (deOdoo) return deOdoo;
  const legajo = normalizarLegajo(insp?.x_legajo || "");
  return legajo ? (envMap.get(legajo) || null) : null;
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const resumen = (s) => crypto.createHash("sha256").update(s, "utf8").digest();

export function crearIngreso({ catalogos, claves = () => leerClaves(), secreto, ahora = () => Date.now() }) {
  if (!secreto) throw new Error("Falta el secreto para firmar sesiones");
  const fallos = new Map(); // inspector_id → {n, desde}

  const llave = (legajo, clave) => crypto.createHmac("sha256", secreto).update(`hys-sesion|${legajo}|${clave}`, "utf8").digest();
  const firmar = (datos, k) => crypto.createHmac("sha256", k).update(datos).digest("base64url");

  function bloqueado(id) {
    const f = fallos.get(id);
    if (!f || ahora() - f.desde > FALLOS_VENTANA_MS) { fallos.delete(id); return false; }
    return f.n >= FALLOS_MAX;
  }
  function fallo(id) {
    const f = fallos.get(id);
    if (!f || ahora() - f.desde > FALLOS_VENTANA_MS) fallos.set(id, { n: 1, desde: ahora() }); else f.n++;
  }

  async function ingresar({ inspector_id, clave } = {}) {
    if (!Number.isInteger(inspector_id)) throw new ErrorIngreso(400, "Elegí tu nombre de la lista.", "datos");
    if (bloqueado(inspector_id)) throw new ErrorIngreso(429, "Demasiados intentos fallidos. Esperá 15 minutos o consultá a HyS.", "bloqueado");
    const insp = await catalogos.buscarInspector(inspector_id);
    if (!insp) throw new ErrorIngreso(403, "Este inspector no está activo en Odoo (HyS > Inspectores). Consultá a HyS.", "inactivo");
    const legajo = normalizarLegajo(insp.x_legajo || "");
    const esperada = claveDeInspector(insp, claves());
    if (!esperada) throw new ErrorIngreso(403, SIN_CLAVE, "sin_clave");
    const dada = normalizarClave(clave);
    if (!dada || !igual(resumen(dada), resumen(esperada))) {
      fallo(inspector_id);
      throw new ErrorIngreso(401, dada ? "Contraseña incorrecta." : "Escribí tu contraseña.", "clave");
    }
    fallos.delete(inspector_id);
    const vence = ahora() + VIGENCIA_MS;
    const datos = b64(JSON.stringify({ i: insp.id, l: legajo, e: vence }));
    return { token: `${datos}.${firmar(datos, llave(legajo, esperada))}`, vence: new Date(vence).toISOString(),
      inspector: { id: insp.id, nombre: insp.x_name, legajo: insp.x_legajo || null } };
  }

  /**
   * Token válido (firma, vigencia, contraseña actual del inspector) → {inspector_id, legajo}; si no, null.
   * Async: relee el inspector en Odoo para honorar x_hys_password (con fallback a env si Odoo cae o el campo está vacío).
   */
  async function verificar(token) {
    const [datos, firma] = String(token || "").split(".");
    if (!datos || !firma) return null;
    let p; try { p = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")); } catch (e) { return null; }
    if (!Number.isInteger(p?.i) || typeof p.l !== "string" || !(p.e > ahora())) return null;
    let insp = null;
    try { insp = await catalogos.buscarInspector(p.i); } catch (e) { insp = null; }
    // Inspector activo con legajo distinto al del token → inválido.
    if (insp && normalizarLegajo(insp.x_legajo || "") !== p.l) return null;
    // Sin registro (archivado u Odoo caído): solo validamos contra el entorno (compat).
    // Con registro: Odoo gana si x_hys_password no está vacío; si no, entorno.
    const clave = insp ? claveDeInspector(insp, claves()) : (claves().get(p.l) || null);
    if (!clave || !igual(firma, firmar(datos, llave(p.l, clave)))) return null;
    return { inspector_id: p.i, legajo: p.l };
  }

  return { ingresar, verificar };
}
