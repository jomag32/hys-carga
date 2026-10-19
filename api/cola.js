// Cola de envíos sin conexión (diseño §5.2).
//
// Cada envío se guarda en el celular ANTES de intentar mandarlo. Estados visibles:
//   "pendiente"  → «En el celular» (todavía no cuenta: «si no está en Odoo, no se hizo»)
//   "enviado"    → «Enviado a Odoo (INS-2026-00012)»; si es de modo prueba, «Guardado solo en el celular (modo prueba)»
//   "rechazado"  → «Rechazado: motivo» (error de validación: no se reintenta solo)
// Reintenta al volver la señal (evento "online"), al abrir la app, cada CONFIG.REINTENTO_MS y con
// el botón «Reintentar ahora». Los reintentos usan SIEMPRE la misma idempotency_key (creada al
// abrir el formulario), así ni la cola ni el backend duplican.
//
// Almacenamiento: IndexedDB (base "hys-carga", almacén "cola", clave idempotency_key), porque las
// fotos y firmas no entran en localStorage. Para que el resto de la app pueda leer sin esperar,
// la cola se mantiene también en memoria y cada cambio se escribe en IndexedDB. Si el navegador
// no tiene IndexedDB (raro), se usa localStorage. Lo que había en localStorage ("hys_cola", de la
// versión anterior) se pasa a IndexedDB al arrancar.

import { CONFIG } from "./config.js";
import { crearRegistro, escribirRegistro, enviarFormulario } from "./odoo.js";
import { leerSesion } from "../componentes/sesion.js";

const CLAVE_LS = "hys_cola";

// ---------------------------------------------------------------- modo prueba (18/10/2026 21:19, pedido de Jorge)
// En producción SOLO F02 llega a Odoo (POST /api/v1/inspecciones del backend). F01 y F03–F08 se guardan
// en este celular (api/odoo.js modo MOCK: localStorage "hys_mock_db_v2") y NO llegan a Odoo.
export const TEXTO_PRUEBA = "Guardado solo en el celular (modo prueba) — no llega a Odoo";
export const ETIQUETA_PRUEBA = "Modo prueba · no llega a Odoo";
/** ¿Este formulario llega a Odoo de verdad? Solo F02 con el backend real. */
export const formularioConectado = (cod) => cod === "F02" && CONFIG.MODO_ENVIO === "backend";
/** ¿Este envío es de modo prueba? «crear»/«escribir» van siempre al guardado local (no hay endpoint en el
 *  backend), también los guardados con versiones anteriores que no traían la marca simulado. Solo es real
 *  un «enviar» al backend que respondió sin simulado. */
export const envioEnPrueba = (e) => !!e && (e.operacion !== "enviar" || !!e.respuesta?.simulado
  || (e.estado !== "enviado" && CONFIG.MODO_ENVIO !== "backend"));
const oyentes = new Set();
let cache = [];
let listo = null;         // promesa de carga inicial
let cadena = null;        // vuelta de envío en curso (promesa)
let otraVuelta = false;   // alguien pidió reintentar mientras se enviaba

// ---------------------------------------------------------------- almacenamiento
const idb = {
  db: null,
  abrir() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    return new Promise((ok) => {
      const r = indexedDB.open("hys-carga", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("cola", { keyPath: "idempotency_key" });
      r.onsuccess = () => { this.db = r.result; ok(this.db); };
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    });
  },
  tx(modo, fn) {
    return new Promise((ok, mal) => {
      const t = this.db.transaction("cola", modo);
      const res = fn(t.objectStore("cola"));
      t.oncomplete = () => ok(res?.result);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error("Transacción cancelada"));
    });
  },
  todos() { return this.tx("readonly", (s) => s.getAll()); },
  poner(e) { return this.tx("readwrite", (s) => s.put(e)); },
  quitar(k) { return this.tx("readwrite", (s) => s.delete(k)); }
};

async function cargar() {
  await idb.abrir();
  let viejos = [];
  try { viejos = JSON.parse(localStorage.getItem(CLAVE_LS) || "[]"); } catch (e) { viejos = []; }
  if (idb.db) {
    for (const e of viejos) await idb.poner(e); // migración desde localStorage
    if (viejos.length) localStorage.removeItem(CLAVE_LS);
    cache = await idb.todos();
  } else cache = viejos;
  cache.sort((a, b) => (a.creado < b.creado ? 1 : -1));
  avisar();
}

async function persistir(e) {
  if (idb.db) return idb.poner(e);
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(cache)); }
  catch (err) { throw new Error("No hay más espacio en el celular para guardar el envío (¿muchas fotos?). Enviá lo pendiente con señal."); }
}
const avisar = () => oyentes.forEach((f) => f(cache));

// ---------------------------------------------------------------- API
/**
 * Agrega un envío a la cola (y lo guarda en el celular antes de intentar mandarlo).
 * envio = {formulario, titulo, idempotency_key, operacion: "enviar"|"crear"|"escribir", ...}
 *   "enviar"  → {endpoint, cuerpo}         (F02: POST /inspecciones con el payload de Odoo)
 *   "crear"   → {modelo, valores}          (F01, F03–F08, todavía con el guardado de ejemplo)
 *   "escribir"→ {modelo, ids, valores}     (F07)
 */
export async function encolar(envio) {
  await listo;
  if (cache.some((e) => e.idempotency_key === envio.idempotency_key)) return; // ya estaba (doble toque)
  const e = { ...envio, estado: "pendiente", intentos: 0, creado: new Date().toISOString(), error: null, respuesta: null };
  cache.unshift(e);
  try { await persistir(e); } catch (err) { cache.shift(); throw err; }
  avisar();
}

/** Intenta mandar todo lo pendiente. Si ya hay una vuelta en curso, se encadena otra. */
export function procesarCola() {
  if (cadena) { otraVuelta = true; return cadena; }
  cadena = (async () => {
    await listo;
    try { do { otraVuelta = false; await vuelta(); } while (otraVuelta); }
    finally { cadena = null; }
    return cache;
  })();
  return cadena;
}

async function mandar(e) {
  // Token de quien cargó (guardado al encolar); si esa misma persona volvió a ingresar, el token nuevo.
  const s = leerSesion();
  const token = s.usuario && e.auth && s.usuario.id === e.auth.inspector_id && s.usuario.token ? s.usuario.token : e.auth?.token || null;
  const op = { idempotencyKey: e.idempotency_key, token };
  if (e.operacion === "enviar") return enviarFormulario(e.endpoint, e.cuerpo, op);
  if (e.operacion === "escribir") return escribirRegistro(e.modelo, e.ids, e.valores, op);
  return crearRegistro(e.modelo, e.valores, op);
}

async function vuelta() {
  // Del más viejo al más nuevo.
  for (const e of [...cache].reverse().filter((x) => x.estado === "pendiente")) {
    try {
      const resp = await mandar(e);
      // Enviado: se descartan los datos (fotos) para liberar espacio; queda el resumen.
      await actualizar(e.idempotency_key, { estado: "enviado", respuesta: resp, error: null, valores: null, cuerpo: null,
        intentos: e.intentos + 1, enviado: new Date().toISOString() });
    } catch (err) {
      if (err.reintentable !== false) {
        // Sin señal o servidor caído: queda pendiente y no se sigue con el resto ahora.
        await actualizar(e.idempotency_key, { error: err.message || "Sin conexión", intentos: e.intentos + 1, ultimoIntento: new Date().toISOString() });
        break;
      }
      // Rechazo de validación (4xx): no se reintenta solo; se muestra el motivo.
      await actualizar(e.idempotency_key, { estado: "rechazado", error: err.message, intentos: e.intentos + 1 });
    }
  }
}

async function actualizar(clave, cambio) {
  const i = cache.findIndex((e) => e.idempotency_key === clave);
  if (i < 0) return;
  cache[i] = { ...cache[i], ...cambio };
  await persistir(cache[i]);
  avisar();
}

export function listarCola() { return cache; }
export function contarPendientes() { return cache.filter((e) => e.estado === "pendiente").length; }
export function buscarEnvio(clave) { return cache.find((e) => e.idempotency_key === clave); }
export function alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); }

/** Quita de la cola los ya enviados (los pendientes no se tocan nunca desde acá). */
export async function limpiarEnviados() {
  // Los de modo prueba NO se borran: son la única constancia de lo guardado en el celular (recuperación).
  const fuera = cache.filter((e) => e.estado === "enviado" && !envioEnPrueba(e));
  cache = cache.filter((e) => !fuera.includes(e));
  if (idb.db) for (const e of fuera) await idb.quitar(e.idempotency_key);
  else localStorage.setItem(CLAVE_LS, JSON.stringify(cache));
  avisar();
}

/** Arranca la cola: carga lo guardado y prende los reintentos automáticos. */
export function iniciarCola() {
  if (listo) return listo;
  listo = cargar();
  window.addEventListener("online", () => procesarCola());
  setInterval(() => { if (contarPendientes()) procesarCola(); }, CONFIG.REINTENTO_MS);
  listo.then(() => procesarCola());
  return listo;
}
