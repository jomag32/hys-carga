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
| `MAX_BODY_MB` | Opcional. Tamaño máximo de un envío (por defecto 15 MB; si se pasa → 413). |
| `INSPECCION_PREFIJO_PRUEBA` | **Solo pruebas locales.** Antepone un texto al número: «PRUEBA - borrar (INS-2026-00001)». No configurar en Render. |

## Endpoints

- `GET /healthz` → `{ok:true}` (no consulta Odoo).
- `GET /api/v1/obras` → `[{id, name, ot, partner, director}]`: `project.project` activos, no plantilla,
  en etapa EN PROGRESO o PAUSADO, sin los proyectos llamados solo «VARIOS». `ot` se saca del nombre
  (`OT`, `0T`, `OT.`), orden por OT. Caché en memoria de 5 minutos. Si Odoo falla: 502 JSON (o la
  última copia si hay una).
- `GET /api/v1/inspectores` → `[{id, nombre, legajo, tipo, empresa}]` (`id` = `x_hys_inspector`, solo activos; `tipo` = `interno` | `externo`). Cabecera `X-Fuente: x_hys_inspector`. Caché 5 min.
- `GET /api/v1/hitos?ot=<id>` → `[{id, name, fecha_limite, alcanzado}]` (`project.milestone` de la obra). Caché 5 min.
- `POST /api/v1/inspecciones` → crea la inspección F02 en Odoo (cuerpo = el que arma el celular: `{formulario, idempotency_key, odoo: {model, method, vals}, contexto}`).
  - Valida como el celular (422 con `errores`): OT si ámbito obra, hito si «inicio de hito crítico», inspector, toma de conocimiento y firma, fecha UTC, GPS, `x_cargado_por`, al menos un ítem; cada «No» con gravedad y foto.
  - Solo pasan los campos que existen y se pueden escribir en `x_hys_inspeccion` / `x_hys_inspeccion_linea` (`fields_get`, cacheado 10 min); los demás se descartan y se listan en `descartados`. El celular no puede fijar `x_name`, `x_validacion_*`, `x_validador_id`, `x_asignado_id` ni `x_fecha_recepcion`.
  - Idempotencia: busca por `x_idempotency_key`; si ya existe → **200** `{id, name, repetido: true}` sin duplicar. Si no → create con `x_linea_ids` `[0, 0, {...}]` → **201** `{id, name}`.
  - Lo pone el servidor: `x_name` = `INS-AAAA-NNNNN` (siguiente del año), `x_fecha_recepcion`, `x_fecha_vencimiento` (= hora del control, porque es una inspección hecha), `x_origen` = `formulario`, `x_estado` = `realizada` (si no vinieron), `x_modalidad` / `x_clase_al_inspeccionar` / `x_clase_motivo` (de `contexto`), `x_presencial_obligatoria`, `x_cant_no`.
  - Fotos en `x_foto` (binario) de cada línea. Envío > 15 MB → **413** con mensaje claro. Errores de datos de Odoo → 422; Odoo caído → 502 (sin detalles internos).

## Inspectores (tabla propia de HyS en Odoo)

Los inspectores **no** salen de empleados ni usuarios de Odoo (los externos tendrían que darse de alta).
Viven en el modelo `x_hys_inspector` («Inspector HyS»), menú **HyS > Inspectores** (solo grupo Desarrollo):
`x_name` (nombre), `x_legajo`, `x_tipo` (`interno` | `externo`), `x_empresa`, `x_active` (archivar), `x_notas`.
MIA (grupo «HyS Servicio API») solo **lee**. El legajo no es único a nivel base (modelo manual): cuidarlo al cargar.

En el `POST`, la inspección guarda `x_inspector_hys_id` (many2one a `x_hys_inspector`) y el servidor pone
`x_inspector_texto` = «Legajo N · Nombre» (+ «externo · Empresa»). Si el inspector no existe o está archivado → 422.
`x_inspector_id` (empleado) queda solo como campo anterior: el celular ya no lo manda y el backend lo rechaza
(payload de una versión vieja → 422 «La app está desactualizada: recargá la página…»).

## Local

```bash
cd backend
node --test
ODOO_URL=… ODOO_DB=… ODOO_USER=… ODOO_PASSWORD=… PORT=8793 node server.js
```

En Render: servicio web `hys-carga-api`, build `cd backend && npm install`, start `cd backend && node server.js`.

Prueba local de punta a punta (envío real a Odoo): backend local en el puerto 8793 con las variables de Odoo
(y `INSPECCION_PREFIJO_PRUEBA="PRUEBA - borrar"`), y en el frontend `cp api/config.local.example.js api/config.local.js`
(solo `localhost`, archivo ignorado por git).
