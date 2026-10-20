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

**Actualización 18/10/2026 (inspectores, sin desplegar):** los inspectores salen de una **tabla propia de HyS en Odoo** (`x_hys_inspector`, menú **HyS > Inspectores**; internos y externos), ya no de empleados. La inspección guarda `x_inspector_hys_id` + `x_inspector_texto`. El código está en `main` pero **no está desplegado**: antes hay que cargar los inspectores reales en Odoo (ver «Pendiente»). Con datos de ejemplo (`?dev=1` / localhost sin config local) el envío queda siempre **simulado**.

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
- **Quién ingresa:** no hay lista de usuarios en el repo. Ingresan los inspectores activos de Odoo (`x_hys_inspector`), que sirve el backend.
- **Credenciales:** ninguna en el frontend ni en el repo (ni la de MIA, ni PINs, ni tokens). La credencial de MIA va solo como variable de entorno secreta del backend en Render.
- Para probar en la compu con datos reales se puede generar `datos/obras.local.json` (misma forma que `obras.json`): está en `.gitignore` y la app lo usa primero si existe (solo en `localhost` con la fuente «ejemplo»).

## Quién ingresa (decisión de Jorge 18/10/2026 19:24)

- Ingresan **solo los inspectores activos** de la tabla propia de HyS en Odoo (`x_hys_inspector`, `x_active`), los mismos de `GET /api/v1/inspectores`. Un inspector archivado no aparece ni puede enviar. Se dan de alta/baja en Odoo (HyS > Inspectores); no hace falta tocar la app.
- Ingresar = 1) elegir la obra, 2) elegir tu nombre («Nombre · Legajo N · Inspector HyS»), 3) **tu contraseña** (una por inspector, Jorge 18/10/2026 19:34). La verifica el backend (`POST /api/v1/ingreso`) y devuelve un token de sesión (60 días) con el que se firman los envíos.
- **Contraseñas:** solo en variables de entorno del backend en Render, una por legajo: `HYS_PWD_<legajo>` (p. ej. `HYS_PWD_0001`). Alternativa: `HYS_LOGIN_PASSWORDS` = JSON `{"0001": "…"}` (si están las dos, gana `HYS_PWD_<legajo>`). Nunca en este repo ni en Odoo. Inspector activo sin contraseña configurada → «Este inspector no tiene contraseña configurada, consultá a HyS». Se comparan en Unicode NFC y sin espacios en las puntas (la «ñ» de Android/iPhone). Cambiar la contraseña de un legajo invalida sus sesiones. 8 intentos fallidos → 15 min de bloqueo para ese inspector. Opcional: `HYS_SESSION_SECRET` para firmar sesiones (si no está, se usa la credencial de servicio; si cambia, todos vuelven a ingresar).
- **Sin señal:** después de un ingreso con señal, el celular guarda una huella (PBKDF2) de esa contraseña y el token, nunca la contraseña: esa persona puede volver a entrar sin señal en ese celular. La primera vez hace falta señal.
- Lo que quedó en la cola se manda con el token de quien lo cargó; si venció, queda «En el celular» hasta que esa persona vuelva a ingresar. Todos los inspectores están habilitados en todas las obras (la tabla no tiene obras ni rol por persona).
- Sin señal se usa la última lista de inspectores leída en ese celular.
- Las sesiones de la lista fija anterior (usuarios de ejemplo) se descartan solas: piden ingresar de nuevo.
- `x_cargado_por` = `Legajo N · Nombre · Inspector HyS · OT 9101`. En F02 el backend toma a quien carga **del token** (no del cuerpo), verifica que siga activo (si no, 422; sin token válido, 401) y arma ese texto con el registro de Odoo.
- En F02 el inspector del formulario viene precargado con quien ingresó (se puede cambiar).
- Con datos de ejemplo (`?dev=1` o localhost sin configuración local) la lista es de inspectores **de ejemplo** (`api/datos-mock.js`) y el envío es siempre simulado.

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
    "x_ot_id": 101, "x_hito_id": 1000, "x_inspector_hys_id": 11,
    "x_tc_nombre": "Capataz Ejemplo", "x_tc_firma": "<base64 PNG>", "x_tc_observaciones": "Sin observaciones",
    "x_origen": "formulario", "x_idempotency_key": "f8fc0963-…",
    "x_fecha_hora_control": "2026-10-17 21:57:55",
    "x_gps_lat": -27.3671, "x_gps_lon": -55.8961, "x_gps_precision_m": 12, "x_gps_fecha": "2026-10-17 21:57:46", "x_gps_estado": "ok",
    "x_cargado_por": "Legajo 9012 · Inspector HyS Ejemplo · Inspector HyS · OT 9104",
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

## F08 · ATS de turno sectorial → `x_hys_ats` (20/10/2026)

Piloto en **Depósito Central** y **Logística y Mantenimiento**. Decisiones D-01..D-16 del plan F08 aceptadas el 20/10/2026.

- `GET /api/v1/ats/catalogo` (sesión): sectores, turnos de `x_hys_turno` («Jornada», lunes a viernes 07:00), los 10 controles de cada sector (`x_hys_item_plantilla`, F08_DEP / F08_LOG, con ★ y si admite N/A), las personas de cada sector (`hr.employee`, solo lectura) y el mínimo de letras para justificar un N/A. Caché de 5 min.
- `GET /api/v1/ats?sector=&fecha=` (sesión): ATS ya cargados ese día, para avisar «ya hay ATS para este turno».
- `POST /api/v1/ats` (sesión, mismo formato que `/fichas`): valida y crea el ATS con sus controles y tareas. 201 nuevo, 200 repetido (misma `idempotency_key`), 409 si el turno ya tiene un ATS válido (si el anterior quedó «No autorizado», se permite y queda enlazado en `x_ats_anterior_id`), 403 si un encargado carga otro sector, 422 con la lista de errores.
- Validaciones: todos los controles del sector, una sola vez; «No» con gravedad y foto; N/A con justificación y nunca en los ★ que no lo admiten; ★ en «No» ⇒ no puede ser «Autorizado»; «Autorizado tras corrección» pide qué se corrigió; tareas si hay trabajo fuera de rutina; dotación ≥ 1; charla previa; firma del encargado y de quien autoriza (o autorización a distancia); turno del sector y que trabaje ese día.
- El backend calcula: `x_inicio_turno`, `x_antes_de_turno`, `x_carga_tardia`, `x_identico_anterior`, `x_codigo_ats`, quién cargó (de la sesión) y copia texto y ★ de cada control desde la plantilla. El número (ATS-AAAA-NNNNN) lo pone Odoo.
- Encargados de sector: son `x_hys_inspector` con rol «encargado» y su sector. Entran con su legajo y `HYS_PWD_<legajo>` como los inspectores, solo ven F08 y solo de su sector (el backend responde 403 en otro sector y en F01/F02). El encargado y quien autoriza por defecto del turno siempre aparecen en la lista de personas, aunque la cuenta de servicio no pueda leerlos en RR. HH.
- Variable opcional `ATS_DEPARTAMENTOS` = JSON `{"deposito":[ids de hr.department],"logistica":[…]}` para acotar las personas de cada sector. Sin ella se listan todos los empleados activos.

## App instalable (PWA)

- `manifest.webmanifest` («HyS · Tecnología ARME», corto «HyS ARME», pantalla completa, `start_url`/`scope` = `./`, color `#163f8b`, `es-AR`), íconos en `iconos/` (escudo naranja, 192/512, *maskable* y `apple-touch-icon` 180) y metas de iOS en `index.html`.
- `sw.js` (service worker): guarda la «cáscara» (HTML, JS, CSS, íconos, `datos/*.json`) para **abrir la app sin señal**. **Red primero** para todo lo propio (si hay señal siempre usa lo último publicado; sin señal o si tarda > 4 s, la copia). **Nunca** toca las llamadas a `hys-carga-api` ni a Odoo (otro origen) ni nada que no sea GET. La cola de envíos (IndexedDB) no cambia.
- Versiones: subir `VERSION` en `sw.js` cuando cambie ese archivo o su lista `CASCARA` (p. ej. al agregar un formulario). El SW nuevo toma control solo y la página se recarga; si hay un formulario abierto, avisa y recarga al volver al inicio. El código nuevo de la app llega aunque no se suba `VERSION` (red primero).
- **Versión visible** (18/10/2026): abajo del inicio y del ingreso, chiquito, «v 2026-10-18.10» (`componentes/version.js`, igual a `VERSION` de `sw.js`; subir las dos en cada deploy). Si el service worker activo es de otra versión se ve «v X · sw Y».
- **CDN de Render** (`s-maxage=300`): tras un deploy puede dar archivos viejos ~5 min. El service worker pide todo como `archivo?v=VERSION` (al instalar y con señal) y lo guarda sin el `?v=`, así la copia de una versión nunca mezcla archivos de otra.
- **F02 arranca siempre con la obra vacía**, también al retomar un borrador (se borran la obra, las respuestas y el hito, y vuelve al paso «Obra»).
- Pantalla de ingreso: botón «📲 Instalar app en el celular» (Android/Chrome) o pasos para iPhone (`componentes/pwa.js`). `?sw=0` desactiva el service worker para depurar.

### Cómo instalarla (para inspectores)

**Android (Chrome):** abrí el link <https://hys-carga.onrender.com/> en Chrome → tocá «📲 Instalar app en el celular» (o menú ⋮ → «Instalar app» / «Agregar a pantalla principal») → «Instalar». Queda el ícono naranja «HyS ARME».

**iPhone (Safari):** abrí el link en **Safari** (no en WhatsApp ni Chrome) → tocá **Compartir** (cuadrado con flecha ↑) → **«Agregar a inicio»** → «Agregar».

Después se abre desde el ícono, como cualquier app. Sin señal también abre; lo cargado queda «En el celular» y se manda solo cuando vuelve la señal.

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
│   ├── obras.json                # Obras «en obra» de EJEMPLO para el modo simulado
│   └── obras.local.json          # (no se sube, .gitignore) copia real para probar en la compu
├── css/estilos.css               # Mobile-first, botones grandes, sin frameworks
├── api/
│   ├── config.js                 # MODO_ENVIO simulado/backend, API_BASE, MOCK, fuentes de obras
│   ├── odoo.js                   # Envío F02 (payload, validación, simulado/backend), obras, inspectores (ingreso), catálogos
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

- **Desplegar inspectores HyS** (con el OK de Jorge): (1) cargar los inspectores reales en Odoo, **HyS > Inspectores** (si no, la lista del celular queda vacía); borrar o archivar el de prueba «PRUEBA - Inspector Ejemplo» (legajo PRUEBA-1, id 1); (2) desplegar `hys-carga-api` (último commit de `main`) y probar `GET /api/v1/inspectores`; (3) enseguida desplegar el sitio `hys-carga`. Entre (2) y (3) el sitio viejo no puede enviar (422 «app desactualizada»); los celulares tienen que recargar.
- Registros de prueba en Odoo para borrar cuando Jorge diga: «EJEMPLO - borrar (INS-2026-00000)» (id 1), «PRUEBA - borrar (INS-2026-00001)» (id 2), INS-2026-00001 marcado PRUEBA (id 3).
- **Backend:** falta idempotencia en Postgres (§5.2; hoy se busca por `x_idempotency_key` en Odoo) y el resto de los formularios. No se despliega nada sin el OK de Jorge.
- **Permisos de MIA:** grupo «HyS Servicio API» con leer / crear / escribir (sin borrar) en `x_hys_inspeccion` y `x_hys_inspeccion_linea` (verificado 18/10/2026). Falta para los demás modelos `x_hys_*`.
- **Método de acceso** de los usuarios (PIN, enlace, etc., §7.4 #4) ; rol u obras por persona si hacen falta (hoy todos los inspectores en todas las obras).
- **Modelo de plantilla de ítems** (`x_hys_item_plantilla`) en Odoo: hoy los ítems salen del Anexo A (en `datos-mock.js`) y viajan por **código** (`x_item_codigo`), no como many2one.
- Ids de ejemplo (solo `?dev=1`/localhost): `x_ot_id`, `x_inspector_hys_id` y `x_hito_id` de los ejemplos no son ids reales de Odoo (por eso con datos de ejemplo el envío se fuerza a simulado); con el backend son reales (obras, inspectores e hitos vienen de Odoo).
- **Desvíos de F02:** el backend todavía no crea `x_hys_desvio` por cada «No» (queda `x_cant_no`).
- **Desvíos:** cada «No» debería generar un `x_hys_desvio`; no va en este payload (el modelo no está confirmado). Lo resuelve el backend o una automatización de Odoo.
- Fotos y firma viajan en base64 dentro del JSON; el diseño (§5.3) prefiere `multipart` con Blob. Sin *service worker* todavía (la app necesita señal para abrir la primera vez).
- F02 se crea con el tipo elegido; enlazarla con una inspección **programada** existente (`write` en vez de `create`) lo resuelve el backend (§5.5).
- Turnos (F08): Mañana 07:00 y Tarde 14:00 son un supuesto. F01, F03–F08 siguen con el guardado de ejemplo (todavía no usan la capa de envío de F02).
