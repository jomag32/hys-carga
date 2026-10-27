// Lugar de ingreso (después de la contraseña): sector/ámbito ANTES de la OF.
// Pedido Jorge 27/10/2026: si elige «Obra» → pedir OF/proyecto; si elige Depósito,
// Logística u otro sector de planta → no pedir OF y seguir.
//
// session.obra queda como marcador del lugar (hayIngreso / encabezado), con forma:
//   · obra real: { id: <núm project.project>, name, ot?, tipo: "obra", ... }
//   · sector F08: { id: "sector:deposito"|"sector:logistica", name, tipo: "sector", sector }
//   · planta (F03/F04): { id: "planta", name, tipo: "planta" }
// F08 ATS en Odoo (x_hys_ats.x_sector) solo admite deposito|logistica: «Obra» es lugar de
// ingreso, NO un valor de x_sector del ATS (haría falta cambiar Odoo + plantilla + turnos).

import { LUGAR_PLANTA } from "../api/datos-mock.js";

/** Sectores de ATS F08 (mismos códigos que backend/ats.js SECTORES). */
export const SECTORES_ATS = {
  deposito: { codigo: "deposito", nombre: "Depósito Central" },
  logistica: { codigo: "logistica", nombre: "Logística y Mantenimiento" }
};

/** Opciones del paso «¿Dónde estás?» del ingreso (inspectores HyS). */
export const OPCIONES_LUGAR = [
  { clave: "obra", tipo: "obra", name: "Obra", ayuda: "Después elegís la OT / proyecto." },
  { clave: "deposito", tipo: "sector", sector: "deposito", name: "Depósito Central", ayuda: "Sin OF: seguís al menú (ATS F08)." },
  { clave: "logistica", tipo: "sector", sector: "logistica", name: "Logística y Mantenimiento", ayuda: "Sin OF: seguís al menú (ATS F08)." },
  { clave: "planta", tipo: "planta", name: "Planta · Fábrica y Oficina", ayuda: "Sin OF: recorridas F03/F04 y oficina." }
];

/** ¿Es una OT/proyecto real (id numérico de project.project)? */
export const esObraReal = (obra) => !!obra && Number.isInteger(obra.id);

/** ¿El lugar de la sesión es un sector de planta (sin OF)? */
export const esSectorSesion = (obra) => !!obra && (obra.tipo === "sector" || String(obra.id || "").startsWith("sector:"));

/** Código de sector ATS (deposito|logistica) si la sesión está en uno; si no, null. */
export function sectorDeSesion(obra) {
  if (!obra) return null;
  if (obra.sector && SECTORES_ATS[obra.sector]) return obra.sector;
  const m = /^sector:(deposito|logistica)$/.exec(String(obra.id || ""));
  return m ? m[1] : null;
}

export const esPlantaSesion = (obra) => !!obra && (obra.id === "planta" || obra.tipo === "planta");

/** Arma el objeto session.obra para un sector F08 (sin OF). */
export function lugarSector(codigo) {
  const s = SECTORES_ATS[codigo];
  if (!s) throw new Error(`Sector desconocido: ${codigo}`);
  return { id: `sector:${s.codigo}`, name: s.nombre, tipo: "sector", sector: s.codigo };
}

export function lugarPlanta() {
  return { id: "planta", name: LUGAR_PLANTA.name, tipo: "planta" };
}

/** Marca tipo:"obra" en una OT elegida del selector (sin mutar el original). */
export function lugarObra(o) {
  if (!o || o.id === "planta" || String(o.id).startsWith("sector:")) return null;
  return { ...o, tipo: "obra" };
}

/** Texto corto para encabezado / x_cargado_por. */
export function lugarCorto(obra) {
  if (!obra) return "—";
  if (esPlantaSesion(obra)) return "Planta";
  if (esSectorSesion(obra)) return SECTORES_ATS[sectorDeSesion(obra)]?.nombre || obra.name || "Sector";
  if (obra.ot) return `OT ${obra.ot}`;
  if (Number.isInteger(obra.id)) return `Proyecto ${obra.id}`;
  return obra.name || "—";
}

/**
 * Opciones de lugar visibles para este usuario.
 * Encargado de sector: solo su sector (no elige Obra ni otros).
 */
export function opcionesLugarPara(usuario) {
  if (usuario?.rol_hys === "encargado") {
    const s = usuario.sector;
    return OPCIONES_LUGAR.filter((o) => o.tipo === "sector" && o.sector === s);
  }
  return OPCIONES_LUGAR;
}
