// Cola de envíos sin conexión (diseño §5.2).
//
// Cada envío se guarda en el celular ANTES de intentar mandarlo. Estados visibles:
//   "pendiente"  → «En el celular» (todavía no cuenta: «si no está en Odoo, no se hizo»)
//   "enviado"    → «Enviado a Odoo (INS-2026-00012)»
//   "rechazado"  → «Rechazado: motivo» (error de validación: no se reintenta solo)
// Reintenta al volver la señal (evento "online"), al abrir la app y cada CONFIG.REINTENTO_MS.
// Los reintentos usan SIEMPRE la misma idempotency_key, así el backend no duplica.
//
// Esqueleto: se usa localStorage (pedido inicial). El diseño apunta a IndexedDB + Blob para
// fotos (más espacio); el cambio queda encapsulado en leer()/guardar() de este archivo.

import { CONFIG } from "./config.js";
import { crearRegistro, escribirRegistro } from "./odoo.js";

const CLAVE = "hys_cola";
const oyentes = new Set();
let procesando = false;

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch (e) { return []; }
}
function guardar(cola) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch (e) {
    throw new Error("No hay más espacio en el celular para guardar el envío (¿muchas fotos?). Enviá lo pendiente con señal.");
  }
  oyentes.forEach((f) => f(cola));
}

/**
 * Agrega un envío a la cola.
 * envio = {formulario, titulo, operacion: "crear"|"escribir", modelo, valores, ids?, idempotency_key}
 */
export function encolar(envio) {
  const cola = leer();
  if (cola.some((e) => e.idempotency_key === envio.idempotency_key)) return; // ya estaba (doble toque)
  cola.unshift({ ...envio, estado: "pendiente", intentos: 0, creado: new Date().toISOString(), error: null, respuesta: null });
  guardar(cola);
}

/** Intenta mandar todo lo pendiente. Devuelve la cola actualizada. */
export async function procesarCola() {
  if (procesando) return leer();
  procesando = true;
  try {
    for (const e of leer().filter((x) => x.estado === "pendiente")) {
      try {
        const resp = e.operacion === "escribir"
          ? await escribirRegistro(e.modelo, e.ids, e.valores, { idempotencyKey: e.idempotency_key })
          : await crearRegistro(e.modelo, e.valores, { idempotencyKey: e.idempotency_key });
        // Enviado: se descartan los valores (fotos) para liberar espacio; queda el resumen.
        actualizar(e.idempotency_key, { estado: "enviado", respuesta: resp, error: null, valores: null, intentos: e.intentos + 1, enviado: new Date().toISOString() });
      } catch (err) {
        if (err.reintentable !== false) {
          // Sin señal o servidor caído: queda pendiente y no se sigue con el resto ahora.
          actualizar(e.idempotency_key, { error: err.message || "Sin conexión", intentos: e.intentos + 1 });
          break;
        }
        // Rechazo de validación (4xx): no se reintenta solo; se muestra el motivo.
        actualizar(e.idempotency_key, { estado: "rechazado", error: err.message, intentos: e.intentos + 1 });
      }
    }
  } finally {
    procesando = false;
  }
  return leer();
}

function actualizar(clave, cambio) {
  const cola = leer().map((e) => (e.idempotency_key === clave ? { ...e, ...cambio } : e));
  guardar(cola);
}

export function listarCola() { return leer(); }
export function contarPendientes() { return leer().filter((e) => e.estado === "pendiente").length; }
export function buscarEnvio(clave) { return leer().find((e) => e.idempotency_key === clave); }
export function alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); }

/** Quita de la cola los ya enviados (los pendientes no se tocan nunca desde acá). */
export function limpiarEnviados() { guardar(leer().filter((e) => e.estado !== "enviado")); }

/** Arranca los reintentos automáticos. */
export function iniciarCola() {
  window.addEventListener("online", () => procesarCola());
  setInterval(() => { if (contarPendientes()) procesarCola(); }, CONFIG.REINTENTO_MS);
  procesarCola();
}
