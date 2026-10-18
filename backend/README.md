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
| `INSPECTORES_CSV` / `INSPECTORES_CSV_PATH` | Opcional. Lista **privada** de inspectores (ver abajo). Si está, manda sobre Odoo. Ruta por defecto `/etc/secrets/inspectores.csv` (Secret File de Render). |
| `INSPECTORES_CAMPO_LEGAJO` | Opcional. Campo de `hr.employee` que se usa como legajo (por defecto `registration_number`). `pin` y `barcode` están prohibidos (son credenciales de asistencia). |
| `INSPECTORES_PUESTOS` | Opcional. Solo empleados con esos puestos (`job_id`, separados por coma). Por defecto, todos. |
| `INSPECTORES_EXCLUIR_DEPTOS` | Opcional. Departamentos a excluir (por defecto `CESANTES`). |
| `INSPECCION_PREFIJO_PRUEBA` | **Solo pruebas locales.** Antepone un texto al número: «PRUEBA - borrar (INS-2026-00001)». No configurar en Render. |

## Endpoints

- `GET /healthz` → `{ok:true}` (no consulta Odoo).
- `GET /api/v1/obras` → `[{id, name, ot, partner, director}]`: `project.project` activos, no plantilla,
  en etapa EN PROGRESO o PAUSADO, sin los proyectos llamados solo «VARIOS». `ot` se saca del nombre
  (`OT`, `0T`, `OT.`), orden por OT. Caché en memoria de 5 minutos. Si Odoo falla: 502 JSON (o la
  última copia si hay una).
- `GET /api/v1/inspectores` → `[{id, nombre, legajo}]` (`id` = `hr.employee`). Cabeceras `X-Fuente` (`odoo` | `csv`) y `X-Sin-Vincular`. Caché 5 min.
- `GET /api/v1/hitos?ot=<id>` → `[{id, name, fecha_limite, alcanzado}]` (`project.milestone` de la obra). Caché 5 min.
- `POST /api/v1/inspecciones` → crea la inspección F02 en Odoo (cuerpo = el que arma el celular: `{formulario, idempotency_key, odoo: {model, method, vals}, contexto}`).
  - Valida como el celular (422 con `errores`): OT si ámbito obra, hito si «inicio de hito crítico», inspector, toma de conocimiento y firma, fecha UTC, GPS, `x_cargado_por`, al menos un ítem; cada «No» con gravedad y foto.
  - Solo pasan los campos que existen y se pueden escribir en `x_hys_inspeccion` / `x_hys_inspeccion_linea` (`fields_get`, cacheado 10 min); los demás se descartan y se listan en `descartados`. El celular no puede fijar `x_name`, `x_validacion_*`, `x_validador_id`, `x_asignado_id` ni `x_fecha_recepcion`.
  - Idempotencia: busca por `x_idempotency_key`; si ya existe → **200** `{id, name, repetido: true}` sin duplicar. Si no → create con `x_linea_ids` `[0, 0, {...}]` → **201** `{id, name}`.
  - Lo pone el servidor: `x_name` = `INS-AAAA-NNNNN` (siguiente del año), `x_fecha_recepcion`, `x_fecha_vencimiento` (= hora del control, porque es una inspección hecha), `x_origen` = `formulario`, `x_estado` = `realizada` (si no vinieron), `x_modalidad` / `x_clase_al_inspeccionar` / `x_clase_motivo` (de `contexto`), `x_presencial_obligatoria`, `x_cant_no`.
  - Fotos en `x_foto` (binario) de cada línea. Envío > 15 MB → **413** con mensaje claro. Errores de datos de Odoo → 422; Odoo caído → 502 (sin detalles internos).

## Inspectores: lista privada (opcional)

Si los legajos no están en Odoo, se puede cargar una lista **privada** (nunca en este repo público), por
variable `INSPECTORES_CSV` o como *Secret File* de Render en `/etc/secrets/inspectores.csv`:

```
legajo,nombre,employee_id
1234,Apellido Nombre,
1235,Otro Apellido,57
```

Cada fila se vincula a `hr.employee` por `employee_id` (si está) o por nombre igual (sin acentos ni mayúsculas).
Las que no se vinculan no se listan (el inspector en Odoo es un many2one) y se cuentan en `X-Sin-Vincular`.

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
