# hys-carga

App web HTML liviana para cargar datos de **Higiene y Seguridad (HyS)** desde el celular en obra, para Tecnología ARME / Cooperativa de Trabajo El Sol.

## Qué es

- Una **app web estática** (HTML, CSS y JavaScript) pensada para usarse en el navegador del celular en obra, en pantallas simples y con pocos campos por paso.
- Se hostea en **Render**, con el nombre de servicio **`hys-carga`**.
- El **backend es Odoo** (cooperativa-de-trabajo-el-sol.odoo.com). Los datos se guardan en los modelos `x_hys_*`, definidos en el documento de diseño *Diseno-App-HyS-Odoo-Studio*.
- La app habla con Odoo **por API**. La API key de Odoo nunca está en el teléfono: la guarda la parte de servidor del servicio en Render.

Formularios que cubre: F01 a F08 (inspecciones y checklist, Ficha de Riesgos/ATS, desvíos, turnos, etc.), con autocompletado de usuario, fecha y hora, obra y GPS, y cola de envío cuando no hay señal.

## Estructura de carpetas prevista

```
hys-carga/
├── vistas/        # Vistas de cada formulario (F01–F08)
├── componentes/   # Componentes compartidos (selector de obra, selector de turno, ...)
└── api/           # Lógica de comunicación con Odoo (lectura de datos maestros, envío de registros x_hys_*)
```

## Estado

Solo README inicial. Todavía no hay código ni despliegue en Render.

**Actualización 17/10/2026:** ya está el **esqueleto de la app** (formularios F01–F08 con una **API simulada, sin conexión a Odoo**). Sigue sin despliegue en Render.

**Actualización 17/10/2026 (tarde):** F02 · Inspección de obra lista para probar desde el celular: **ingreso** con la lista fija de usuarios, **selector de obra con buscador**, formulario alineado con el modelo `x_hys_inspeccion` creado en Odoo, **cola sin señal en IndexedDB** y **capa de envío** que arma el payload exacto del `create` (hoy en **modo simulado**: no sale nada a la red). Sigue **sin backend y sin despliegue en Render** (cualquier deploy lo autoriza Jorge).

**Actualización 18/10/2026:** hay **backend** (`backend/`, servicio **`hys-carga-api`** en Render, <https://hys-carga-api.onrender.com>). Por ahora solo **lee** de Odoo la lista de obras (`GET /api/v1/obras`, con la cuenta de servicio MIA). La app ya usa esa lista real en producción. El envío de inspecciones **sigue en modo simulado** (`POST /api/v1/inspecciones` responde 501).

**Actualización 18/10/2026 (mañana):** el backend ya sabe **crear la inspección F02 de verdad en Odoo** (`POST /api/v1/inspecciones`, idempotente) y sirve **inspectores** (`GET /api/v1/inspectores`, «Nombre · Legajo N» con buscador) e **hitos por obra** (`GET /api/v1/hitos?ot=<id>`). Probado de punta a punta **solo desde la compu** (registro de prueba «PRUEBA - borrar (INS-2026-00001)», id 2). **Lo publicado sigue en modo simulado** y **nada de esto está desplegado** en Render hasta el OK de Jorge (ver «Pasar a producción»).

**Actualización 18/10/2026 10:01:** con el OK de Jorge, **en producción F02 se envía de verdad a Odoo** (`MODO_ENVIO: "backend"`; backend y sitio desplegados).

## Cómo probarla en la compu

No hace falta instalar nada ni compilar. Desde la carpeta del repo:

```bash
python3 -m http.server 8000
```

y abrir <http://localhost:8000> (en el celular, con la misma red: `http://<ip-de-la-compu>:8000`; el GPS del navegador solo funciona en `https` o en `localhost`). Con `?dev=1` (p. ej. `http://localhost:8000/?dev=1#/envios`) aparece el **panel de desarrollo**: modo de envío, «Simular sin señal», reiniciar datos y los **payloads «enviados»**.

Flujo: **Ingresar** (1. obra u otro lugar → 2. quién sos) → inicio → F02 → pasos cortos → Revisión → Enviar → «Enviado» o «Guardado en el celular». Arriba se ven la obra, el usuario, los envíos pendientes y **Salir**.

## Repo público: qué datos NO se suben (decisión D-05, 17/10/2026 18:54)

El repo `jomag32/hys-carga` **queda público**. Por eso:

- **Proyectos y clientes reales:** los sirve el **backend** `hys-carga-api` desde Odoo (`GET /api/v1/obras`, con la cuenta de servicio MIA). **Nunca** se suben a GitHub. En el repo solo hay obras de **ejemplo** (`datos/obras.json`, «OT 9101 - Galpón Ejemplo Norte», …).
- **Usuarios de carga reales:** la lista real **no** se sube a este repo. `datos/usuarios.json` tiene solo ejemplos («Usuario Ejemplo 1», …). Más adelante la sirve el backend desde un lugar privado (Postgres de Render o archivo de configuración privado).
- **Credenciales:** ninguna en el frontend ni en el repo (ni la de MIA, ni PINs, ni tokens). La credencial de MIA va solo como variable de entorno secreta del backend en Render.
- Para probar en la compu con datos reales se puede generar `datos/obras.local.json` (misma forma que `obras.json`): está en `.gitignore` y la app lo usa primero si existe (solo en `localhost` con la fuente «ejemplo»).

## Usuarios de carga (D-04 revisada)

- Lista **fija de texto** dentro de hys-carga, no en Odoo: `datos/usuarios.json` = `[{id, nombre, rol, obras: [id de project.project | "planta" | "*"], activo}]`. `"*"` = habilitado en todas las obras (p. ej. HyS). `activo: false` = dado de baja (no aparece, pero los registros viejos conservan su texto).
- Ingreso: se elige la obra (o «Planta») y después el nombre de la lista de esa obra. La sesión queda en `localStorage` (`hys_sesion`); **Salir** la cierra.
- **Método de acceso (PIN, enlace, etc.): pendiente** (diseño §7.4 #4). Hoy es solo elegir, sin contraseñas.
- En cada registro viaja `x_cargado_por` (char) con el formato del diseño §2.15: `<id> · <nombre> · <rol> · <obra>`, p. ej. `EJ-004 · Usuario Ejemplo 4 · Capataz · OT 9104`.

## Obras: selector de F02 (y del ingreso)

- `api/odoo.js` → `listarObrasActivas()`, según `CONFIG.OBRAS_FUENTE`:
  - **`backend`** (producción): `GET {API_BASE}/api/v1/obras` → `[{id, name, ot, partner, director}]` desde Odoo. Mientras carga muestra «Cargando obras…» y, si tarda (el plan free de Render puede tardar ~50 s en despertar), avisa que el servidor se está despertando. Si falla: mensaje claro con **Reintentar** (nunca obras de ejemplo en silencio). Si ya hubo una lista real en ese celular, la usa avisando la fecha.
  - **`ejemplo`**: solo con `?dev=1` o en `localhost`. Lee `datos/obras.json` (y antes `datos/obras.local.json`, solo en `localhost`).
  - Para forzar la fuente al probar: `?obras=backend` o `?obras=ejemplo`.
- Muestra **todos** los proyectos «en obra» (no filtra por la obra del ingreso; esa solo viene marcada), con buscador mientras se escribe, **sin distinguir mayúsculas ni acentos**, por **nombre**, **número de OT** («9102», «OT 9102») o **número de proyecto** (id de `project.project`, «proyecto 102»).
- **Criterio «en obra»** (backend, 18/10/2026): `project.project` con etapa «EN PROGRESO» o «PAUSADO», `is_template` = Falso, `active` = Verdadero, **sin** los proyectos que se llaman solo «VARIOS». Al 18/10/2026: 25 obras (27 en EN PROGRESO menos 2 «VARIOS»; PAUSADO existe pero hoy no tiene proyectos). Orden por número de OT.
- El número de OT se saca del nombre (`OT 9101 - …`, `0T-9101-…`, `OT.9101 …`); Odoo no tiene un campo de código de proyecto.

## Modos (api/config.js)

| Interruptor | Valor | Qué hace |
|---|---|---|
| `MODO_ENVIO` | `"simulado"` | No sale nada a la red. Se valida el payload igual que lo hará el backend, se guarda en la lista local «enviados» (`localStorage` `hys_enviados_simulados`) y se ve en el panel `?dev=1`. La pantalla dice «Enviado (modo prueba)». |
| | **`"backend"`** (publicado desde el 18/10/2026) | `POST {API_BASE}/api/v1/inspecciones` con cabecera `Idempotency-Key`. El backend `hys-carga-api` valida igual que el celular, descarta (y avisa en `descartados`) los campos que no existen en Odoo, busca por `x_idempotency_key` (si ya existe devuelve 200 con el mismo registro) y si no crea con MIA `x_hys_inspeccion` + `x_linea_ids` `[0, 0, {...}]` (201 `{id, name}`). La pantalla dice «Enviado a Odoo» y el número. |
| Prueba local | `api/config.local.js` | Solo en `localhost` (archivo en `.gitignore`; modelo en `api/config.local.example.js`): pone `MODO_ENVIO: "backend"`, `API_BASE: "http://localhost:8793"` y `OBRAS_FUENTE: "backend"` para probar contra un backend local **sin tocar la configuración publicada**. |
| `API_BASE` | `"https://hys-carga-api.onrender.com"` | Backend `hys-carga-api` (Render). Rutas bajo `/api/v1`. |
| `OBRAS_FUENTE` | `"backend"` en producción | `"ejemplo"` con `?dev=1` o en `localhost`; se fuerza con `?obras=backend\|ejemplo`. |
| `MOCK` | `true` | Catálogos de ejemplo (`api/datos-mock.js`: inspectores, plantilla de ítems, fichas, hitos) y guardado local de F01, F03–F08. |

## F02 · Inspección de obra → `x_hys_inspeccion`

Pasos: **Tipo** (ámbito Obra/Fábrica/Oficina + tipo de programa) → **Obra** (OT obligatoria si ámbito = obra; **Hito** obligatorio si «Inicio de hito crítico (72 h)») → **Modalidad e inspector** → **Ítems generales** (6) → bloques de riesgo de la Ficha de la OT (si la tiene) → **Toma de conocimiento** (nombre, firma en pantalla, observaciones) → Revisión → Enviar.

Selecciones, tal cual el modelo de Odoo: `x_formulario` F02 · `x_ambito` obra/fabrica/oficina · `x_tipo_programa` periodica, hito_critico, apertura, recorrida_semanal, check_mensual, fuera_programa · `x_respuesta` si/no/na · `x_criticidad` critico/mayor/menor · `x_gps_estado` ok/denegado/sin_posicion/no_disponible · `x_origen` = formulario.

Automáticos: `x_fecha_hora_control` (al tocar Enviar), GPS con `navigator.geolocation` al abrir (`x_gps_lat`, `x_gps_lon`, `x_gps_precision_m`, `x_gps_fecha`, `x_gps_estado`; si no hay permiso o posición se envía igual), `x_idempotency_key` (UUID al abrir el formulario), `x_cargado_por`.

Cada «No» pide **gravedad** y **foto** (cámara, comprimida a JPEG ≤ 1600 px, calidad 0,7). Comentario opcional en cualquier ítem.

Payload (lo que se ve en `?dev=1`; imágenes en base64 sin prefijo, fechas en UTC `AAAA-MM-DD HH:MM:SS` como las guarda Odoo):

```json
{
  "formulario": "F02",
  "idempotency_key": "f8fc0963-…",
  "odoo": { "model": "x_hys_inspeccion", "method": "create", "vals": {
    "x_formulario": "F02", "x_ambito": "obra", "x_tipo_programa": "hito_critico", "x_estado": "realizada",
    "x_ot_id": 101, "x_hito_id": 1000, "x_inspector_id": 11,
    "x_tc_nombre": "Capataz Ejemplo", "x_tc_firma": "<base64 PNG>", "x_tc_observaciones": "Sin observaciones",
    "x_origen": "formulario", "x_idempotency_key": "f8fc0963-…",
    "x_fecha_hora_control": "2026-10-17 21:57:55",
    "x_gps_lat": -27.3671, "x_gps_lon": -55.8961, "x_gps_precision_m": 12, "x_gps_fecha": "2026-10-17 21:57:46", "x_gps_estado": "ok",
    "x_cargado_por": "EJ-004 · Usuario Ejemplo 4 · Capataz · OT 9104",
    "x_linea_ids": [
      [0, 0, {"x_name": "Orden y limpieza del frente; …", "x_bloque": "Generales · siempre", "x_item_codigo": "F02-GEN-01", "x_secuencia": 1,
              "x_respuesta": "si", "x_criticidad": false, "x_foto": false, "x_comentario": "Todo ordenado"}],
      [0, 0, {"x_name": "Vallado y señalización …", "x_bloque": "Generales · siempre", "x_item_codigo": "F02-GEN-02", "x_secuencia": 2,
              "x_respuesta": "no", "x_criticidad": "critico", "x_foto": "<base64 JPEG>", "x_comentario": "Disyuntor puenteado"}]
    ] } },
  "contexto": { "obra": "OT 9101 - …", "modalidad": "presencial", "clase_al_inspeccionar": "A", "clase_motivo": "…",
                "cant_no": 1, "desvios_a_generar": 1, "campos_pendientes_en_odoo": [], "app": "hys-carga web" }
}
```

`x_linea_ids` usa comandos `[0, 0, {...}]` (= `(0, 0, {...})` / `Command.create`): cabecera y líneas en **una sola llamada**, todo o nada. `contexto` no va al `create`: son datos que el backend puede usar (modalidad, clase, desvíos) mientras no se confirme que esos campos existen en el modelo creado.

## Sin señal (api/cola.js)

Cada envío se guarda primero en el celular, en **IndexedDB** (base `hys-carga`, almacén `cola`, clave = idempotency key; si no hay IndexedDB, `localStorage`). Lo que había en la cola vieja de `localStorage` se migra solo. Se reintenta **al volver la señal** (evento `online`), **al abrir la app**, cada 30 s y con **«Reintentar ahora»** (pantalla Envíos). Siempre con la **misma clave**: la cola no duplica y el backend (o el modo simulado) devuelve la misma respuesta si ya lo recibió. Estados: «En el celular», «Enviado (INS-2026-00001)», «Rechazado: motivo». La cantidad pendiente se ve arriba (📱 N), en el inicio y en Envíos.

## Pruebas (17/10/2026)

Chrome sin ventana (Playwright) en tamaño celular (390×844): ingreso con búsqueda de obra → F02 con los 6 ítems generales (un «No» crítico con foto y comentario) → enviado con señal; validación de «No» sin foto; F02 sin señal (`set_offline`) → «Guardado en el celular», 1 pendiente, reintento manual sigue pendiente → vuelve la señal → cola vacía sola; reenvío con la misma clave → misma respuesta, sin duplicar. Los demás formularios (F01–F08) abren sin errores.

## Cómo está armada (y por qué)

- **HTML + CSS + JavaScript sin frameworks, sin build y sin CDNs.** Un solo `index.html` con ruteo por *hash* (`#/f01`, `#/envios`, …) en `app.js`. Cada formulario es un **módulo ES** en `vistas/` que se carga recién cuando se abre (`import()`). Se eligió así porque es lo más liviano para un celular con mala señal, se sirve como archivos estáticos (desde el backend de Render o cualquier servidor) y no hace falta Node ni compilar para cambiar algo.
- Las vistas son **declarativas**: cada una lista sus pasos cortos (pocos campos por pantalla), la revisión y cómo se arma el registro `x_hys_*`. El motor común (`componentes/asistente.js`) pone Atrás/Siguiente, valida cada paso, guarda borrador, muestra la revisión final y manda a la cola.
- Checklists (F02, F03, F04, F08): Sí / No / N/A con botones grandes. Cada «No» pide **gravedad + foto obligatoria**; en F03, F04 y F08 arma además el **desvío** anidado (en F02 lo genera el backend u Odoo, ver Pendiente). En F03 además pide el sector; en F08 el N/A pide justificación y un crítico ★ en «No» impide «Autorizado».

## Archivos

```
hys-carga/
├── backend/                      # hys-carga-api (Node 20, sin dependencias): GET /healthz, GET /api/v1/obras (ver backend/README.md)
├── index.html                    # Pantalla única: encabezado (obra / quién carga / envíos / Salir) + contenido
├── app.js                        # Arranque, ruteo por hash, ingreso (obra → usuario), inicio, envíos, panel ?dev=1
├── datos/
│   ├── usuarios.json             # Lista fija de usuarios de carga: SOLO EJEMPLOS (repo público)
│   ├── obras.json                # Obras «en obra» de EJEMPLO para el modo simulado
│   └── obras.local.json          # (no se sube, .gitignore) copia real para probar en la compu
├── css/estilos.css               # Mobile-first, botones grandes, sin frameworks
├── api/
│   ├── config.js                 # MODO_ENVIO simulado/backend, API_BASE, MOCK, fuentes de usuarios y obras
│   ├── odoo.js                   # Envío F02 (payload, validación, simulado/backend), obras, usuarios, catálogos
│   ├── cola.js                   # Cola sin conexión en IndexedDB con reintentos e idempotencia
│   └── datos-mock.js             # Datos de ejemplo (obras, empleados, turnos, ítems, fichas, hitos, ...)
├── componentes/
│   ├── selector-obra.js          # Selector de obra con buscador (nombre / OT / n.º de proyecto), ingreso, F01, F02, F05
│   ├── selector-turno.js         # Selector de turno (F08); turnos a definir por la empresa
│   ├── campos-auto.js            # Idempotency key, fecha/hora, GPS (x_gps_*), x_cargado_por
│   ├── campos.js                 # Campos grandes: texto, opciones, casillas, foto (comprimida), firma en pantalla
│   ├── checklist.js              # Sí/No/N/A, «No» → gravedad + foto → desvío
│   ├── asistente.js              # Motor de pasos: Atrás/Siguiente, borrador, revisión y Enviar
│   ├── encabezado.js             # Encabezado compartido
│   ├── sesion.js                 # Sesión: obra y usuario de la lista elegidos; Salir
│   └── util.js                   # Ayudas de DOM
└── vistas/
    ├── f01-ficha-riesgo.js       # HYS-F01 · Ficha de Riesgos de Obra        → x_hys_ficha
    ├── f02-inspeccion-obra.js    # HYS-F02 · Inspección de obra              → x_hys_inspeccion (+ líneas y desvíos)
    ├── f03-recorrida-fabrica.js  # HYS-F03 · Recorrida semanal de Fábrica    → x_hys_inspeccion
    ├── f04-check-instalaciones.js# HYS-F04 · Check mensual de instalaciones  → x_hys_inspeccion
    ├── f05-evento.js             # HYS-F05 · Registro de accidente o incidente → x_hys_evento
    ├── f06-vencimiento-legal.js  # HYS-F06 · Carga de vencimiento legal      → x_hys_vencimiento_carga
    ├── f07-cierre-desvio.js      # HYS-F07 · Cierre de desvío                → write en x_hys_desvio
    ├── f08-ats-turno.js          # HYS-F08 · ATS de turno sectorial          → x_hys_ats (+ líneas, tareas y desvíos)
    └── _inspeccion-planta.js     # Partes comunes de F03 y F04
```

## Pendiente

- **Pasar a producción el envío real de F02** (con el OK de Jorge): (1) desplegar `hys-carga-api` (último commit de `main`) y probar `GET /api/v1/inspectores`; (2) cambiar en `api/config.js` `MODO_ENVIO: "simulado"` → `"backend"`, commit y desplegar el sitio `hys-carga`. Si se despliega el sitio antes que el backend, F02 no abre (le faltan los inspectores). Borrar en Odoo el registro de prueba «PRUEBA - borrar (INS-2026-00001)» cuando Jorge diga.
- **Legajos de inspectores:** en Odoo `hr.employee` no hay legajo cargado (`registration_number` vacío; `barcode` es la credencial de asistencia, no un legajo). Hasta que se cargue, la lista sale sin legajo; se puede cargar una lista privada `legajo,nombre` en el backend (ver `backend/README.md`). Falta definir quiénes son inspectores (hoy: todos los empleados activos menos el departamento CESANTES).
- **Backend:** falta lista de usuarios real, idempotencia en Postgres (§5.2; hoy se busca por `x_idempotency_key` en Odoo) y el resto de los formularios. No se despliega nada sin el OK de Jorge.
- **Permisos de MIA:** grupo «HyS Servicio API» con leer / crear / escribir (sin borrar) en `x_hys_inspeccion` y `x_hys_inspeccion_linea` (verificado 18/10/2026). Falta para los demás modelos `x_hys_*`.
- **Usuarios de ejemplo vs. obras reales:** `datos/usuarios.json` referencia obras de ejemplo (101–106); con las obras reales del backend solo aparece el usuario de ejemplo habilitado en todas («*»). Se resuelve con la lista real de usuarios (privada, servida por el backend).
- **Método de acceso** de los usuarios (PIN, enlace, etc., §7.4 #4) y **dónde vive la lista real** (privada, servida por el backend).
- **Modelo de plantilla de ítems** (`x_hys_item_plantilla`) en Odoo: hoy los ítems salen del Anexo A (en `datos-mock.js`) y viajan por **código** (`x_item_codigo`), no como many2one.
- Ids de ejemplo (solo `?dev=1`/localhost): `x_ot_id`, `x_inspector_id` y `x_hito_id` de los ejemplos no son ids reales de Odoo; con el backend son reales (obras, inspectores e hitos vienen de Odoo).
- **Desvíos de F02:** el backend todavía no crea `x_hys_desvio` por cada «No» (queda `x_cant_no`).
- **Desvíos:** cada «No» debería generar un `x_hys_desvio`; no va en este payload (el modelo no está confirmado). Lo resuelve el backend o una automatización de Odoo.
- Fotos y firma viajan en base64 dentro del JSON; el diseño (§5.3) prefiere `multipart` con Blob. Sin *service worker* todavía (la app necesita señal para abrir la primera vez).
- F02 se crea con el tipo elegido; enlazarla con una inspección **programada** existente (`write` en vez de `create`) lo resuelve el backend (§5.5).
- Turnos (F08): Mañana 07:00 y Tarde 14:00 son un supuesto. F01, F03–F08 siguen con el guardado de ejemplo (todavía no usan la capa de envío de F02).
