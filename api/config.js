// Configuración de hys-carga.
//
// ╔══════════════════════════════════════════════════════════════════════════════════════╗
// ║  MODO_ENVIO: cómo se manda lo que se carga (hoy F02 · Inspección de obra).              ║
// ║                                                                                        ║
// ║   "simulado" → NO sale nada a la red. El celular valida el payload, lo guarda en la    ║
// ║                lista local «enviados» (localStorage "hys_enviados_simulados") y lo      ║
// ║                muestra en el panel de desarrollo (?dev=1, pantalla Envíos).             ║
// ║   "backend"  → POST a API_BASE + "/inspecciones" (backend de hys-carga en Render, que   ║
// ║                TODAVÍA NO EXISTE). Ese backend es el único que habla con Odoo, con la   ║
// ║                cuenta de servicio MIA, cuya credencial vive solo en el servidor.        ║
// ╚══════════════════════════════════════════════════════════════════════════════════════╝
//
// MOCK = true → los catálogos (obras, inspectores, plantilla de ítems, hitos, fichas) salen de
//               api/datos-mock.js y los demás formularios (F01, F03–F08) se guardan en el
//               localStorage del navegador (clave "hys_mock_db"). No hay red.
// MOCK = false → odoo.js pide los catálogos al backend (API_BASE).
//
// IMPORTANTE: el celular NUNCA habla directo con Odoo y en este repo (público) NO va ninguna
// credencial: ni la API key/contraseña de MIA, ni URLs con usuario, ni PINs. La credencial de la
// cuenta de servicio va solo como variable de entorno secreta del backend en Render.
export const CONFIG = {
  MODO_ENVIO: "simulado",            // "simulado" | "backend"
  API_BASE: "/api/v1",              // backend futuro: POST /api/v1/inspecciones (diseño §5.5)
  MOCK: true,                       // catálogos de ejemplo (sin red)
  USUARIOS_URL: "datos/usuarios.json", // lista fija de usuarios de carga (D-04 revisada, §2.15)
  // Obras «en obra» para el selector de F02 (listarObrasActivas en api/odoo.js):
  //   · modo "backend": GET API_BASE + "/obras" → el backend consulta Odoo con MIA
  //     (project.project con etapa «EN PROGRESO», no plantilla) y devuelve [{id, name, ot, ...}].
  //   · modo "simulado": se leen estos archivos en orden; el primero que exista gana.
  //     datos/obras.local.json = copia real SOLO para pruebas locales (está en .gitignore).
  // D-05 (17/10/2026 18:54): el repo es PÚBLICO; los nombres reales de proyectos y clientes los
  // sirve el backend desde Odoo y NUNCA se suben a GitHub. Acá solo hay ejemplos (datos/obras.json).
  OBRAS_URLS: ["datos/obras.local.json", "datos/obras.json"],
  ZONA_HORARIA: "-03:00",           // America/Argentina/Buenos_Aires (las fechas viajan con zona)
  ZONA_IANA: "America/Argentina/Buenos_Aires", // para mostrar y calcular la hora de Argentina sin depender del celular
  REINTENTO_MS: 30000,              // cada cuánto se reintenta la cola si hay pendientes
  FOTO_LADO_MAX: 1600,              // px; el diseño pide ≤ 1600 px y < 500 KB (§5.3)
  FOTO_CALIDAD: 0.7
};

// Compatibilidad con el código anterior (odoo.js usa BACKEND_URL para los catálogos).
CONFIG.BACKEND_URL = CONFIG.API_BASE;
