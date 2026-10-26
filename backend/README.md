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
Obras, Fichas e hitos piden la **sesión del inspector** (`Authorization: Bearer <token>` de `POST /api/v1/ingreso`);
sin token o vencido → **401** `{codigo: "sesion"}`. `/healthz`, `/api/v1/inspectores` y `/api/v1/ingreso` quedan abiertos (son para ingresar).

- `GET /api/v1/obras` → `[{id, name, ot, partner, director}]`: `project.project` activos, no plantilla,
  en etapa EN PROGRESO o PAUSADO, sin los proyectos llamados solo «VARIOS». `ot` se saca del nombre
  (`OT`, `0T`, `OT.`), orden por OT. Caché en memoria de 5 minutos. Si Odoo falla: 502 JSON (o la
  última copia si hay una).
- `GET /api/v1/inspectores` → `[{id, nombre, legajo, tipo, empresa}]` (`id` = `x_hys_inspector`, solo activos; `tipo` = `interno` | `externo`). Cabecera `X-Fuente: x_hys_inspector`. Caché 5 min.
- `GET /api/v1/fichas` → Fichas de Riesgos (F01) **activas** (`x_hys_ficha` con `x_active`), una por OT (si hubiera dos, la de id mayor):
  `[{id, nombre, ot, estado, aprobada, clase, motivo, clase_calculada_el, frecuencia_dias, modalidad, distancia_km, faltan_hitos, aviso_ugeop, aviso,
  riesgos: [{codigo, nombre, gravedad}], hitos: [{id, name, riesgo_hys, critico, inicio_previsto, inicio_real, alcanzado, situacion, riesgos: [códigos]}]}]`.
  Riesgos de `x_hys_riesgo`, hitos de `x_hys_ficha_hito`. No expone centro de salud, documentación del cliente ni GPS. Caché 5 min.
- `GET /api/v1/fichas?ot=<id>` → la Ficha activa de esa OT, o `null` (obra sin Ficha → Clase A).
- `GET /api/v1/hitos?ot=<id>` → los `hitos` de la Ficha activa de la OT (`x_hys_ficha_hito`; ya **no** `project.milestone`); `[]` sin Ficha.
- `GET /api/v1/inspecciones/catalogo?formulario=F03|F04&lugar=fabrica|oficina` → con sesión: ítems de la plantilla (o los de respaldo), sectores, toma de conocimiento precargada (Jefe de Producción) y período (inicio, vence, si ya hay realizada o programada).
- `POST /api/v1/inspecciones` → crea la inspección F02, F03 o F04 en Odoo (F03/F04: completa la programada del período; si ya hay una realizada, queda `fuera_programa` con aviso) (cuerpo = el que arma el celular: `{formulario, idempotency_key, odoo: {model, method, vals}, contexto}`).
  - Valida como el celular (422 con `errores`): OT si ámbito obra, hito (`x_ficha_hito_id`, o `x_hito_id` de envíos viejos en cola) si «inicio de hito crítico», inspector, toma de conocimiento y firma, fecha UTC, GPS, `x_cargado_por`, al menos un ítem; cada «No» con gravedad y foto.
  - Solo pasan los campos que existen y se pueden escribir en `x_hys_inspeccion` / `x_hys_inspeccion_linea` (`fields_get`, cacheado 10 min); los demás se descartan y se listan en `descartados`. El celular no puede fijar `x_name`, `x_validacion_*`, `x_validador_id`, `x_asignado_id` ni `x_fecha_recepcion`.
  - Idempotencia: busca por `x_idempotency_key`; si ya existe → **200** `{id, name, repetido: true}` sin duplicar. Si no → create con `x_linea_ids` `[0, 0, {...}]` → **201** `{id, name}`.
  - Lo pone el servidor: `x_name` = `INS-AAAA-NNNNN` (siguiente del año: máximo numérico de los nombres que contienen `INS-AAAA-`, incluidos los de prueba con prefijo y archivados; asignación en serie dentro del proceso y verificación después del create — si otro registro más viejo tiene el mismo número, el nuevo se renumera; números de registros borrados pueden reutilizarse), `x_fecha_recepcion`, `x_fecha_vencimiento` (= hora del control, porque es una inspección hecha), `x_origen` = `formulario`, `x_estado` = `realizada` (si no vinieron), `x_modalidad` (de `contexto`), y **de la Ficha activa de la OT leída en Odoo al recibir** (sin caché; lo que mande el celular se descarta): `x_ficha_id`, `x_clase_al_inspeccionar` = clase de la Ficha (sin Ficha → `A`), `x_clase_motivo` = motivo de la Ficha (sin Ficha → «Sin Ficha de Riesgos: se trata como Clase A»). En hito crítico, `x_ficha_hito_id` tiene que ser un hito **crítico** de esa Ficha (si no → 422); en otros tipos se quitan los hitos. Envíos viejos sin datos de Ficha se completan igual desde la OT, `x_presencial_obligatoria`, `x_cant_no`.
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

## Ingreso por inspector (contraseñas)

- `POST /api/v1/ingreso` `{inspector_id, clave}` → `{token, vence, inspector}` · 401 contraseña incorrecta/vacía · 403 inactivo o «Este inspector no tiene contraseña configurada, consultá a HyS» · 429 tras 8 fallos (15 min).
- `POST /api/v1/inspecciones` exige `Authorization: Bearer <token>`; «cargado por» sale del token.
- Variables (Render → hys-carga-api → Environment): `HYS_PWD_<legajo>` = contraseña, una por inspector (`HYS_PWD_0001`, `HYS_PWD_0002`, …). Alternativa `HYS_LOGIN_PASSWORDS` (JSON). Opcional `HYS_SESSION_SECRET`.

## F01 · POST /api/v1/fichas (18/10/2026)

- Con sesión de inspector (`Authorization: Bearer <token>`, igual que `/inspecciones`). Crea `x_hys_ficha` con MIA, **siempre en `borrador`** (la app nunca aprueba; aprueba HyS en Odoo), con sus hitos (`x_hito_ids` → `x_hys_ficha_hito`).
- Solo escribe campos que existen y son editables según `fields_get` en vivo; el resto vuelve en `descartados`. Protegidos (los pone Odoo/HyS/servidor): número, estado, aprobación, firma, clase, frecuencia, modalidad, avisos, cliente y director (los copia el servidor desde la OT).
- Obra activa en etapa NO INICIADA(S), EN PROGRESO o PAUSADO; si no → 422. Lista para el celular: `GET /api/v1/obras?para=f01`. Riesgos: `GET /api/v1/riesgos`.
- Una Ficha activa por OT: si ya hay → **409** `{codigo: "ficha_existente", ficha: {id, name, estado}}`.
- Idempotente: misma clave → 200 `repetido`. El modelo no tiene campo de clave: tras un reinicio, si la OT ya tiene una Ficha creada por MIA en las últimas 48 h con la misma distancia y riesgos, se toma como el mismo envío (200).
- Quién cargó: nota en el historial de la Ficha (si tiene chatter) «Cargada desde la app hys-carga por Legajo N · Nombre».
- Respuesta 201: `{id, name (FR-… de la secuencia de Odoo), estado, clase}`.

## F05 y F06 (25/10/2026)

- `GET /api/v1/eventos/catalogo` (sesión): empleados para «Persona involucrada».
- `POST /api/v1/eventos` (sesión; cualquier inspector o encargado) → `x_hys_evento`. Cuerpo `{formulario:"F05", idempotency_key, datos, control}`.
  Valida tipo, fecha no futura, Dónde = Obra (con OT) · uno de los 8 sectores · Oficina, qué pasó y quién reporta; con lesión (con o sin baja)
  **aviso telefónico obligatorio con hora** (y a quién, opcional); con baja, días ≥ 1. Marca `x_cargado_en_plazo` (≤ 24 h). Odoo numera `EV-AAAA-NNNN`,
  fija la investigación a 72 h y crea la actividad a HyS (automatización R-EVE-1). En Odoo lo leen solo HyS, Jefe de Producción, Desarrollo y «HyS / Lectura F05».
- `GET /api/v1/vencimientos` (sesión; solo HyS: inspector/responsable/desarrollo, el resto → 403): controles legales con semáforo (rojo vencido/sin estado, amarillo ≤ 30 días, verde).
- `POST /api/v1/vencimientos` (sesión; solo HyS, el resto → 403) → `x_hys_vencimiento_carga` + actualiza `x_hys_control_legal`.
- Alertas: acción programada diaria en Odoo a 30/15/7/0 días y vencidos (actividad al responsable del control y a HyS).
- Creación en Odoo: `scripts/odoo-crear-f05-f06.py` (simulación por defecto; `--aplicar`).

## F07 · Desvíos (25/10/2026, v2026-10-25.7)

- Al recibir F02/F03/F04 (`POST /inspecciones`) y F08 (`POST /ats`), el backend crea un `x_hys_desvio` por cada línea en «No» (`x_idempotency_key` = `ins-linea-<id>` / `ats-linea-<id>`: reenviar no duplica). Fichas cuyo nombre tiene PRUEBA/EJEMPLO no generan (salvo `DESVIOS_EN_PRUEBA=1`, solo pruebas). Si falla, la ficha igual se guarda y se reintenta en el reenvío.
- Vence: crítico +24 h · mayor +5 días corridos (sábados, domingos y feriados cuentan; pregunta #8 resuelta 25/10/2026) · menor +15 días (diseño §2.10/§3.3). Opcional `DESVIO_PLAZOS` (JSON, p. ej. `{"menor":{"dias":10}}`).
- `GET /api/v1/desvios` (sesión; solo HyS, el resto → 403): abiertos con vencimiento y si está vencido.
- `POST /api/v1/desvios/:id/cierre` (sesión; solo HyS) `{idempotency_key, que_se_hizo, foto_cierre, control}` → write `x_estado=cerrado`, `x_que_se_hizo`, `x_foto_cierre`, `x_fecha_cierre`, `x_cerrado_por`, `x_cerrado_en_plazo`, `x_cierre_idempotency_key`. Sin foto → 422; ya cerrado con la misma clave → 200 `repetido`; cerrado/anulado con otra → 409.
