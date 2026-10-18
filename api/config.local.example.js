// Copiá este archivo como api/config.local.js (está en .gitignore) para probar en localhost
// contra un backend local. Solo se carga en localhost/127.0.0.1; nunca en el sitio publicado.
export default {
  MODO_ENVIO: "backend",              // envía de verdad a Odoo a través del backend
  API_BASE: "http://localhost:8793",  // backend local: cd backend && PORT=8793 ODOO_...=… node server.js
  OBRAS_FUENTE: "backend"             // obras, inspectores e hitos desde el backend (no ejemplos)
};
