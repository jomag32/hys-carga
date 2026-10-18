# hys-carga-api (backend)

Servicio mínimo (Node 20, **sin dependencias**) que es el único que habla con Odoo, con la cuenta de
servicio MIA. El repo es público (D-05): **ninguna credencial va en el código**; todo sale de variables
de entorno de Render.

| Variable | Uso |
|---|---|
| `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASSWORD` | Conexión JSON-RPC (`/jsonrpc`) a Odoo. Secretas, solo en Render. |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos, separados por coma (además de `http://localhost:*` para desarrollo). |
| `OBRAS_ETAPAS` | Opcional. Etapas de proyecto a listar (por defecto `EN PROGRESO,PAUSADO`). |
| `RATE_LIMIT_PER_MIN` | Opcional. Pedidos por minuto por IP (por defecto 60). |

## Endpoints

- `GET /healthz` → `{ok:true}` (no consulta Odoo).
- `GET /api/v1/obras` → `[{id, name, ot, partner, director}]`: `project.project` activos, no plantilla,
  en etapa EN PROGRESO o PAUSADO, sin los proyectos llamados solo «VARIOS». `ot` se saca del nombre
  (`OT`, `0T`, `OT.`), orden por OT. Caché en memoria de 5 minutos. Si Odoo falla: 502 JSON (o la
  última copia si hay una).
- `POST /api/v1/inspecciones` → 501 (todavía no se escribe en Odoo; la app sigue en modo simulado).

## Local

```bash
cd backend
node --test
ODOO_URL=… ODOO_DB=… ODOO_USER=… ODOO_PASSWORD=… PORT=8793 node server.js
```

En Render: servicio web `hys-carga-api`, build `cd backend && npm install`, start `cd backend && node server.js`.
