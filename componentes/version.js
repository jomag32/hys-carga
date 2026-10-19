// Versión de la app que se ve chiquita en el inicio y en el ingreso («v 2026-10-18.10»).
// Tiene que ser IGUAL a VERSION de sw.js (subir las dos en cada deploy). Si el service worker que
// controla la página informa otra, la etiqueta muestra las dos («v X · sw Y»): señal de código mezclado.
import { h } from "./util.js";

export const VERSION = "2026-10-18.10";

/** <p id="version-app">v VERSION</p>; agrega «· sw Y» si el service worker activo dice otra versión. */
export function etiquetaVersion() {
  const p = h("p", { class: "version-app", id: "version-app" }, `v ${VERSION}`);
  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    const alResponder = (ev) => {
      if (ev.data?.tipo !== "version") return;
      navigator.serviceWorker.removeEventListener("message", alResponder);
      p.dataset.sw = ev.data.version;
      if (ev.data.version !== VERSION) p.textContent = `v ${VERSION} · sw ${ev.data.version}`;
    };
    navigator.serviceWorker.addEventListener("message", alResponder);
    sw.postMessage("version");
  }
  return p;
}
