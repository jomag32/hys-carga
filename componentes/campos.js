// Campos de formulario grandes, pensados para el dedo. Cada campo se "ata" a una clave del
// objeto de datos del formulario (d): al cambiar, escribe d[clave] y llama a alCambiar.

import { h } from "./util.js";
import { CONFIG } from "../api/config.js";

let n = 0;
const nuevoId = () => `c${++n}`;

function envoltorio(etiqueta, control, { requerido, ayuda, id } = {}) {
  return h("div", { class: "campo" },
    etiqueta && h("label", { class: "etiqueta", for: id }, etiqueta, requerido && h("span", { class: "req", title: "Obligatorio" }, " *")),
    ayuda && h("p", { class: "ayuda" }, ayuda),
    control);
}

export function campoTexto(d, clave, etiqueta, { tipo = "text", requerido, ayuda, alCambiar, ...attrs } = {}) {
  const id = nuevoId();
  const input = h("input", {
    id, type: tipo, class: "entrada", value: d[clave] ?? "", ...attrs,
    inputmode: tipo === "number" ? "numeric" : undefined,
    oninput: (e) => { d[clave] = tipo === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value; alCambiar?.(d[clave]); }
  });
  return envoltorio(etiqueta, input, { requerido, ayuda, id });
}

export function campoArea(d, clave, etiqueta, { requerido, ayuda, filas = 3, alCambiar } = {}) {
  const id = nuevoId();
  const t = h("textarea", { id, class: "entrada", rows: filas, oninput: (e) => { d[clave] = e.target.value; alCambiar?.(d[clave]); } });
  t.value = d[clave] ?? "";
  return envoltorio(etiqueta, t, { requerido, ayuda, id });
}

/** Botones grandes de opción única. opciones = [[valor, texto, {deshabilitado, clase}], ...] */
export function campoOpciones(d, clave, etiqueta, opciones, { requerido, ayuda, alCambiar, columnas } = {}) {
  const grupo = h("div", { class: `opciones${columnas ? " col" + columnas : ""}`, role: "radiogroup" });
  const pintar = () => {
    grupo.replaceChildren(...opciones.map(([valor, texto, o = {}]) =>
      h("button", {
        type: "button", role: "radio", "aria-checked": String(d[clave] === valor),
        class: `opcion ${d[clave] === valor ? "elegida" : ""} ${o.clase || ""}`, disabled: !!o.deshabilitado,
        onclick: () => { d[clave] = valor; pintar(); alCambiar?.(valor); }
      }, texto)));
  };
  pintar();
  return envoltorio(etiqueta, grupo, { requerido, ayuda });
}

export function campoSelect(d, clave, etiqueta, opciones, { requerido, ayuda, alCambiar, vacio = "Elegí…" } = {}) {
  const id = nuevoId();
  const s = h("select", { id, class: "entrada", onchange: (e) => {
    const o = opciones.find(([v]) => String(v) === e.target.value);
    d[clave] = o ? o[0] : null; alCambiar?.(d[clave]);
  } },
  h("option", { value: "" }, vacio),
  opciones.map(([v, t]) => h("option", { value: v, selected: String(d[clave]) === String(v) }, t)));
  return envoltorio(etiqueta, s, { requerido, ayuda, id });
}

/** Casillas múltiples: d[clave] es un array de valores. */
export function campoCasillas(d, clave, etiqueta, opciones, { requerido, ayuda, alCambiar } = {}) {
  d[clave] = d[clave] || [];
  const lista = h("div", { class: "casillas" }, opciones.map(([v, t, extra]) => {
    const input = h("input", { type: "checkbox", checked: d[clave].includes(v), onchange: (e) => {
      d[clave] = e.target.checked ? [...new Set([...d[clave], v])] : d[clave].filter((x) => x !== v);
      alCambiar?.(d[clave]);
    } });
    return h("label", { class: "casilla" }, input, h("span", {}, t, extra && h("small", {}, ` ${extra}`)));
  }));
  return envoltorio(etiqueta, lista, { requerido, ayuda });
}

/**
 * Foto desde la cámara (o archivo). Las imágenes se comprimen en el celular (JPEG, lado mayor
 * CONFIG.FOTO_LADO_MAX) y se guardan como data URL en d[clave]. Con aceptar="application/pdf,image/*"
 * sirve para el protocolo de F06 (el PDF va tal cual, con límite de tamaño).
 */
export function campoFoto(d, clave, etiqueta, { requerido, ayuda, aceptar = "image/*", alCambiar } = {}) {
  const id = nuevoId();
  const vista = h("div", { class: "foto-vista" });
  const pintar = () => {
    if (!d[clave]) return vista.replaceChildren(h("span", { class: "sin-foto" }, "Sin archivo"));
    vista.replaceChildren(d[clave].startsWith("data:image")
      ? h("img", { src: d[clave], alt: "Foto cargada" })
      : h("span", { class: "archivo" }, `📄 ${d[clave + "_nombre"] || "Archivo cargado"}`));
  };
  const input = h("input", {
    id, type: "file", accept: aceptar, capture: aceptar === "image/*" ? "environment" : undefined, class: "oculto",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        d[clave] = f.type.startsWith("image/") ? await comprimirImagen(f) : await leerComoDataUrl(f, 2 * 1024 * 1024);
        d[clave + "_nombre"] = f.name;
      } catch (err) { alert(err.message); }
      pintar(); alCambiar?.(d[clave]);
    }
  });
  pintar();
  return envoltorio(etiqueta, h("div", { class: "foto" },
    vista,
    h("label", { class: "btn secundario", for: id }, aceptar === "image/*" ? "📷 Sacar foto" : "📎 Adjuntar"),
    input), { requerido, ayuda });
}

function leerComoDataUrl(f, max) {
  if (max && f.size > max) return Promise.reject(new Error(`El archivo pesa ${Math.round(f.size / 1024)} KB; el máximo es ${Math.round(max / 1024)} KB.`));
  return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(f); });
}

async function comprimirImagen(f) {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo leer la foto")); i.src = url; });
    const k = Math.min(1, CONFIG.FOTO_LADO_MAX / Math.max(img.width, img.height));
    const c = h("canvas", { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", CONFIG.FOTO_CALIDAD);
  } finally { URL.revokeObjectURL(url); }
}

/** Firma en pantalla (campo tipo Firma de Studio). Guarda un PNG en data URL. */
export function campoFirma(d, clave, etiqueta, { requerido, ayuda, alCambiar } = {}) {
  const lienzo = h("canvas", { class: "firma-lienzo", width: 600, height: 220, "aria-label": "Firmar acá" });
  const ctx = lienzo.getContext("2d");
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
  if (d[clave]) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0); i.src = d[clave]; }
  let dibujando = false;
  const punto = (e) => { const r = lienzo.getBoundingClientRect(); return [(e.clientX - r.left) * lienzo.width / r.width, (e.clientY - r.top) * lienzo.height / r.height]; };
  lienzo.addEventListener("pointerdown", (e) => { dibujando = true; lienzo.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...punto(e)); });
  lienzo.addEventListener("pointermove", (e) => { if (!dibujando) return; ctx.lineTo(...punto(e)); ctx.stroke(); });
  const fin = () => { if (!dibujando) return; dibujando = false; d[clave] = lienzo.toDataURL("image/png"); alCambiar?.(d[clave]); };
  lienzo.addEventListener("pointerup", fin);
  lienzo.addEventListener("pointercancel", fin);
  const borrar = h("button", { type: "button", class: "btn chico", onclick: () => { ctx.clearRect(0, 0, lienzo.width, lienzo.height); d[clave] = null; alCambiar?.(null); } }, "Borrar firma");
  return envoltorio(etiqueta, h("div", { class: "firma" }, lienzo, borrar), { requerido, ayuda });
}

export const aviso = (texto, tipo = "info") => h("div", { class: `aviso ${tipo}` }, texto);
