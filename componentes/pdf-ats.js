// Botón «Descargar PDF» de un ATS (F08) ya enviado a Odoo: pantalla de confirmación y lista de envíos.
import { h } from "./util.js";
import { descargarPdfAts } from "../api/odoo.js";
import { envioEnPrueba } from "../api/cola.js";

/** ¿Este envío es un ATS que ya está en Odoo (tiene id real)? */
export const tienePdfAts = (env) => env?.formulario === "F08" && env.estado === "enviado" && !envioEnPrueba(env) && Number.isInteger(env.respuesta?.id);

export function botonPdfAts(env, { clase = "btn secundario" } = {}) {
  if (!tienePdfAts(env)) return "";
  const nota = h("small", { class: "ayuda pdf-ats-estado", role: "status" });
  const btn = h("button", { type: "button", class: `${clase} btn-pdf-ats`, onclick: async () => {
    btn.disabled = true; nota.textContent = "Preparando el PDF…";
    try { await descargarPdfAts(env.respuesta.id, env.respuesta.name); nota.textContent = "Listo: imprimilo y firmalo (en papel y firmado es el que vale)."; }
    catch (e) { nota.textContent = `No se pudo bajar el PDF: ${e.message}`; }
    finally { btn.disabled = false; }
  } }, "📄 Descargar PDF");
  return h("span", { class: "pdf-ats" }, btn, " ", nota);
}
