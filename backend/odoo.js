// Cliente mínimo de Odoo por JSON-RPC (/jsonrpc), con fetch nativo de Node 20.
// La credencial sale SOLO de variables de entorno (Render) y nunca se registra ni se devuelve.

const TIMEOUT_MS = 20000;

export class ErrorOdoo extends Error {
  /** tipo = clase de excepción de Odoo (p. ej. "odoo.exceptions.ValidationError"); detalle = su mensaje (solo para logs). */
  constructor(mensaje, { tipo = null, detalle = null } = {}) { super(mensaje); this.tipo = tipo; this.detalle = detalle; }
  /** Errores de datos (el registro no pasa las reglas de Odoo): se devuelven como 422, no se reintentan. */
  get deDatos() { return /ValidationError|UserError|MissingError|ValueError/.test(this.tipo || ""); }
}

export function crearCliente({ url, db, usuario, clave }) {
  if (!url || !db || !usuario || !clave) throw new ErrorOdoo("Faltan variables ODOO_URL / ODOO_DB / ODOO_USER / ODOO_PASSWORD");
  const base = url.replace(/\/+$/, "");
  let uid = null;
  let id = 0;

  async function rpc(service, method, args) {
    let r;
    try {
      r = await fetch(`${base}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: ++id, params: { service, method, args } }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (e) {
      throw new ErrorOdoo(e.name === "TimeoutError" ? "Odoo no respondió a tiempo" : "No se pudo conectar con Odoo");
    }
    if (!r.ok) throw new ErrorOdoo(`Odoo respondió HTTP ${r.status}`);
    const j = await r.json().catch(() => null);
    if (!j) throw new ErrorOdoo("Respuesta de Odoo ilegible");
    // Solo el título del error (sin traceback ni argumentos de la llamada, que llevan la clave).
    if (j.error) throw new ErrorOdoo(`Odoo: ${j.error.data?.name || j.error.message || "error"}`,
      { tipo: j.error.data?.name || null, detalle: String(j.error.data?.message || "").slice(0, 400) });
    return j.result;
  }

  async function autenticar() {
    const r = await rpc("common", "authenticate", [db, usuario, clave, {}]);
    if (!r) throw new ErrorOdoo("Odoo rechazó el usuario de servicio");
    uid = r;
    return uid;
  }

  /** execute_kw(model, method, args, kwargs); re-autentica una vez si la sesión cayó. */
  async function ejecutar(modelo, metodo, args = [], kwargs = {}) {
    for (let intento = 0; intento < 2; intento++) {
      if (!uid) await autenticar();
      try {
        return await rpc("object", "execute_kw", [db, uid, clave, modelo, metodo, args, kwargs]);
      } catch (e) {
        if (intento === 0 && /AccessDenied|Access Denied/i.test(e.message)) { uid = null; continue; }
        throw e;
      }
    }
  }

  return { ejecutar, autenticar, get uid() { return uid; } };
}
