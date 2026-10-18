// Ingreso por inspector (decisión de Jorge 18/10/2026 19:34): cada inspector activo de x_hys_inspector
// tiene SU contraseña, por legajo, en variables de entorno de Render (nunca en el repo ni en Odoo):
//   HYS_PWD_<legajo>     una variable por inspector, p. ej. HYS_PWD_0001  (recomendado: fácil de editar)
//   HYS_LOGIN_PASSWORDS  alternativa, JSON {"0001": "…", "0002": "…"}   (si hay ambas, gana HYS_PWD_<legajo>)
// Legajo "0001" y "1" son el mismo. Contraseñas comparadas en Unicode NFC y sin espacios en las puntas
// (la «ñ» de Android y la de iPhone pueden venir compuestas o descompuestas).
// POST /api/v1/ingreso {inspector_id, clave} → {token, vence, inspector}. El token firma (HMAC) el id y
// legajo del inspector con una clave derivada de SU contraseña: si se cambia la contraseña, sus
// sesiones dejan de valer. Sin estado en el servidor (el plan free se reinicia seguido).
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
    const esperada = legajo ? claves().get(legajo) : null;
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

  /** Token válido (firma, vigencia, contraseña actual del legajo) → {inspector_id, legajo}; si no, null. */
  function verificar(token) {
    const [datos, firma] = String(token || "").split(".");
    if (!datos || !firma) return null;
    let p; try { p = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")); } catch (e) { return null; }
    if (!Number.isInteger(p?.i) || typeof p.l !== "string" || !(p.e > ahora())) return null;
    const clave = claves().get(p.l);
    if (!clave || !igual(firma, firmar(datos, llave(p.l, clave)))) return null;
    return { inspector_id: p.i, legajo: p.l };
  }

  return { ingresar, verificar };
}
