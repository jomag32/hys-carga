// Configuración de hys-carga.
//
// MOCK = true  → no hay red: odoo.js responde con datos ficticios y guarda los registros en
//                localStorage del navegador (clave "hys_mock_db"). Sirve para probar la app.
// MOCK = false → odoo.js llama al backend de hys-carga en Render (BACKEND_URL).
//
// IMPORTANTE: el celular NUNCA habla directo con Odoo. Las llamadas reales van al backend de
// Render (servicio web `hys-carga`), que es el único que tiene la credencial de la cuenta de
// servicio de Odoo (variable de entorno secreta). La API key de Odoo nunca vive en el teléfono.
export const CONFIG = {
  MOCK: true,
  BACKEND_URL: "/api/v1",          // mismo origen cuando la app la sirve el backend en Render
  ZONA_HORARIA: "-03:00",           // America/Argentina/Buenos_Aires (las fechas viajan con zona)
  REINTENTO_MS: 30000,              // cada cuánto se reintenta la cola si hay pendientes
  FOTO_LADO_MAX: 1280,              // px; el diseño pide ≤ 1600 px y < 500 KB (§5.3)
  FOTO_CALIDAD: 0.7
};
