// Ayudas chicas de DOM, sin frameworks.

/** h("button", {class: "btn", onclick: fn}, "Texto", otroNodo) → elemento. */
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // solo con texto propio, nunca con datos del usuario
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const nombreM2o = (v) => (Array.isArray(v) ? v[1] : v || "");
export const idM2o = (v) => (Array.isArray(v) ? v[0] : v || null);
