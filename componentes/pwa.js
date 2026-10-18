// App instalable (PWA): registra el service worker (sw.js), maneja las versiones nuevas y arma el
// bloque «Instalar app» de la pantalla de ingreso (botón en Android/Chrome, pasos en iPhone).
import { h } from "./util.js";

let pedidoInstalar = null;
const PARAMS = new URLSearchParams(location.search);

export const esInstalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();               // lo mostramos con nuestro botón
  pedidoInstalar = ev;
  window.dispatchEvent(new Event("hys:instalable"));
});
window.addEventListener("appinstalled", () => { pedidoInstalar = null; window.dispatchEvent(new Event("hys:instalable")); });

/** Registra sw.js. Si llega una versión nueva, recarga (o espera a que no haya un formulario abierto). */
export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator) || PARAMS.get("sw") === "0") return;
  const habiaControl = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaControl || recargando) return;  // primera instalación: no hace falta recargar
    const recargar = () => { if (recargando) return; recargando = true; location.reload(); };
    const enFormulario = () => /^#\/f0\d/.test(location.hash);
    if (!enFormulario()) return recargar();
    // Hay un formulario a medio cargar: no se pierde nada; se actualiza al volver al inicio.
    avisoVersion();
    const alSalir = () => { if (!enFormulario()) { window.removeEventListener("hashchange", alSalir); recargar(); } };
    window.addEventListener("hashchange", alSalir);
  });
  const registrar = async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" });
      // Buscar versión nueva al volver a la app (los celulares la dejan abierta días).
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    } catch (e) { console.warn("Service worker no registrado:", e.message); }
  };
  // Después de cargar la página, para no competir con lo primero que se baja.
  if (document.readyState === "complete") registrar(); else window.addEventListener("load", registrar, { once: true });
}

function avisoVersion() {
  if (document.getElementById("aviso-version")) return;
  document.body.append(h("div", { class: "aviso-version", id: "aviso-version", role: "status" },
    "Hay una versión nueva de la app. Se aplica sola al terminar o salir de este formulario."));
}

/** Bloque para la pantalla de ingreso. Vacío si ya está instalada. Se actualiza solo. */
export function bloqueInstalar() {
  const caja = h("div", { class: "caja-instalar", id: "caja-instalar" });
  const pintar = () => {
    if (esInstalada()) return caja.replaceChildren();
    if (pedidoInstalar) {
      return caja.replaceChildren(h("button", { type: "button", class: "btn secundario ancho", id: "btn-instalar", onclick: async () => {
        const p = pedidoInstalar; pedidoInstalar = null;
        p.prompt();
        await p.userChoice.catch(() => null);
        pintar();
      } }, "📲 Instalar app en el celular"));
    }
    if (esIOS()) {
      return caja.replaceChildren(h("details", { class: "ayuda-instalar" },
        h("summary", {}, "📲 Instalar en iPhone"),
        h("ol", {}, h("li", {}, "Abrí este link en Safari."), h("li", {}, "Tocá Compartir (cuadrado con flecha ↑)."),
          h("li", {}, "Elegí «Agregar a inicio» y después «Agregar».")))); 
    }
    caja.replaceChildren();
  };
  window.addEventListener("hys:instalable", pintar);
  pintar();
  return caja;
}
