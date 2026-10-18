// Configuración de hys-carga.
//
// ╔══════════════════════════════════════════════════════════════════════════════════════╗
// ║  MODO_ENVIO: cómo se manda lo que se carga (hoy F02 · Inspección de obra).              ║
// ║                                                                                        ║
// ║   "simulado" → NO sale nada a la red. El celular valida el payload, lo guarda en la    ║
// ║                lista local «enviados» (localStorage "hys_enviados_simulados") y lo      ║
// ║                muestra en el panel de desarrollo (?dev=1, pantalla Envíos).             ║
// ║   "backend"  → POST a API_BASE + "/api/v1/inspecciones" (hys-carga-api): crea de verdad ║
// ║                la inspección en Odoo. Ese backend es el único que habla con Odoo, con la ║
// ║                cuenta de servicio MIA, cuya credencial vive solo en el servidor.        ║
// ╚══════════════════════════════════════════════════════════════════════════════════════╝
//
// MOCK = true → los catálogos (obras, inspectores, plantilla de ítems, hitos, fichas) salen de
//               api/datos-mock.js y los demás formularios (F01, F03–F08) se guardan en el
//               localStorage del navegador (clave "hys_mock_db"). No hay red.
// MOCK = false → odoo.js pide los catálogos al backend (API_BASE).
//
// OBRAS (selector de F02, F01, F05 e ingreso) — desde el 18/10/2026 salen del backend real:
//   GET {API_BASE}/api/v1/obras → hys-carga-api (Render) consulta Odoo con MIA (solo lectura).
//   Datos de ejemplo (datos/obras.json) SOLO con ?dev=1 o en localhost; en producción, si el backend
//   no responde, se muestra un error con «Reintentar» (nunca obras de ejemplo en silencio).
//   Forzar la fuente para probar: ?obras=backend | ?obras=ejemplo.
//
// IMPORTANTE: el celular NUNCA habla directo con Odoo y en este repo (público) NO va ninguna
// credencial: ni la API key/contraseña de MIA, ni URLs con usuario, ni PINs. La credencial de la
// cuenta de servicio va solo como variable de entorno secreta del backend en Render.
const PARAMS = new URLSearchParams(location.search);
const EN_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

export const CONFIG = {
  MODO_ENVIO: "backend",             // "simulado" | "backend" (envío real a Odoo desde el 18/10/2026, OK de Jorge 10:01)
  API_BASE: "https://hys-carga-api.onrender.com", // backend hys-carga-api: /api/v1/obras (hoy) y /api/v1/inspecciones (futuro, §5.5)
  MOCK: true,                       // catálogos de ejemplo (sin red)
  // Obras «en obra» (listarObrasActivas en api/odoo.js): ver OBRAS_FUENTE abajo.
  //   · "backend": GET API_BASE + "/api/v1/obras" (EN PROGRESO o PAUSADO, no plantilla, sin «VARIOS»).
  //   · "ejemplo": se leen estos archivos en orden; el primero que exista gana.
  //     datos/obras.local.json = copia real SOLO para pruebas en localhost (está en .gitignore).
  // D-05 (17/10/2026 18:54): el repo es PÚBLICO; los nombres reales de proyectos y clientes los
  // sirve el backend desde Odoo y NUNCA se suben a GitHub. Acá solo hay ejemplos (datos/obras.json).
  OBRAS_URLS: EN_LOCAL ? ["datos/obras.local.json", "datos/obras.json"] : ["datos/obras.json"],
  OBRAS_FUENTE: PARAMS.get("obras") === "backend" || PARAMS.get("obras") === "ejemplo"
    ? PARAMS.get("obras") : (EN_LOCAL || PARAMS.get("dev") === "1" ? "ejemplo" : "backend"),
  OBRAS_TIMEOUT_MS: 90000,          // el plan free de Render tarda ~50 s en despertar
  ZONA_HORARIA: "-03:00",           // America/Argentina/Buenos_Aires (las fechas viajan con zona)
  ZONA_IANA: "America/Argentina/Buenos_Aires", // para mostrar y calcular la hora de Argentina sin depender del celular
  REINTENTO_MS: 30000,              // cada cuánto se reintenta la cola si hay pendientes
  FOTO_LADO_MAX: 1600,              // px; el diseño pide ≤ 1600 px y < 500 KB (§5.3)
  FOTO_CALIDAD: 0.7
};

// Configuración LOCAL de prueba (solo en localhost; archivo en .gitignore, ver config.local.example.js).
// Sirve para probar MODO_ENVIO "backend" contra un backend local SIN tocar la configuración publicada.
if (EN_LOCAL) {
  try { Object.assign(CONFIG, (await import("./config.local.js")).default || {}); } catch (e) { /* no hay config local */ }
}

// Seguridad: con datos de EJEMPLO (?dev=1 o localhost sin config local) nunca se envía a Odoo de verdad:
// los ids de ejemplo (obras, inspectores) no son reales.
if (CONFIG.OBRAS_FUENTE === "ejemplo") CONFIG.MODO_ENVIO = "simulado";

// Rutas del backend (versión 1 de la API).
CONFIG.API_V1 = CONFIG.API_BASE + "/api/v1";
// Compatibilidad con el código anterior (odoo.js usa BACKEND_URL para los catálogos).
CONFIG.BACKEND_URL = CONFIG.API_V1;
