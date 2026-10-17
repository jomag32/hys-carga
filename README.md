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

## Cómo probarla en la compu

No hace falta instalar nada ni compilar. Desde la carpeta del repo:

```bash
python3 -m http.server 8000
```

y abrir <http://localhost:8000> (en el celular, con la misma red: `http://<ip-de-la-compu>:8000`; el GPS del navegador solo funciona en `https` o en `localhost`).

Primero se elige la **obra** (o «Planta») arriba, después **quién carga**, y después el formulario.

## La API es un MOCK

- `api/config.js` tiene un solo interruptor: **`MOCK: true`**. Con eso la app **no se conecta a nada**: usa obras, empleados, turnos y desvíos **ficticios** (`api/datos-mock.js`) y guarda lo enviado en el `localStorage` del navegador (clave `hys_mock_db`).
- `api/odoo.js` expone las funciones que usan las vistas: `crearRegistro(modelo, valores)`, `leerRegistros(modelo, dominio, campos)`, `escribirRegistro(modelo, ids, valores)`, `leerUsuariosLocales(obra)` y `leerTurnos()`. Con `MOCK: false` las mismas funciones hacen `fetch` al **backend de hys-carga en Render**, que es el único que habla con Odoo. **La API key de Odoo nunca vive en el teléfono.**
- Riesgos, plantilla de ítems (90) y controles legales (9) salen tal cual del documento de diseño; lo demás son datos de prueba.
- En **Envíos → Herramientas de prueba** se puede simular «sin señal» y reiniciar la base mock.

## Usuarios y campos de control

- **Usuarios propios por obra (decisión 17/10/2026).** hys-carga tiene su **propia lista de usuarios por obra (nombre y rol)**: no hay un usuario de Odoo por operario. Para entrar se elige el nombre de la lista de la obra seleccionada (en el mock es solo elegir; el ingreso real está por definir). Todo lo que se escribe en Odoo pasa por **una única cuenta de servicio**, del lado del servidor.
- **Cada registro lleva sus campos de control:** quién cargó (`x_cargado_por_ref`, `x_cargado_por_nombre`, `x_cargado_por_rol`, del usuario local), fecha y hora del control (`x_fecha_hora_control`, con zona `-03:00`), clave de idempotencia (`x_idempotency_key`, creada al abrir el formulario) y GPS.
- **GPS (decisión D-03):** se toma con `navigator.geolocation` al abrir el formulario y viaja con el envío: `x_gps_lat`, `x_gps_lon`, `x_gps_precision`, `x_gps_fecha`. Si se niega el permiso o no hay GPS, **se envía igual** con coordenadas vacías y `x_gps_estado` (`denegado`, `no_disponible`, `tiempo_agotado`, `sin_soporte`).
- La fecha de recepción (`x_fecha_recepcion`) la pone el backend. En el cierre de desvío (F07) los mismos campos van con prefijo `x_cierre_` porque el desvío ya tiene los suyos.
- **Para IT:** `x_gps_precision`, `x_gps_fecha`, `x_gps_estado` y `x_cargado_por_*` no estaban en el diseño v1: hay que agregarlos a los modelos cabecera `x_hys_*` (con los usuarios locales, `x_cargado_por_id` a `hr.employee` deja de ser la referencia de quién cargó).

## Sin señal

Cada envío se guarda primero en el celular (`api/cola.js`, en `localStorage`) y después se intenta mandar. Se reintenta solo al volver la señal, al abrir la app y cada 30 segundos, siempre con la misma clave de idempotencia. Estados visibles en **Envíos**: «En el celular», «Enviado a Odoo (INS-2026-00001)» o «Rechazado: motivo». El diseño apunta a IndexedDB para tener más lugar para fotos; el cambio queda dentro de `cola.js`.

## Cómo está armada (y por qué)

- **HTML + CSS + JavaScript sin frameworks, sin build y sin CDNs.** Un solo `index.html` con ruteo por *hash* (`#/f01`, `#/envios`, …) en `app.js`. Cada formulario es un **módulo ES** en `vistas/` que se carga recién cuando se abre (`import()`). Se eligió así porque es lo más liviano para un celular con mala señal, se sirve como archivos estáticos (desde el backend de Render o cualquier servidor) y no hace falta Node ni compilar para cambiar algo.
- Las vistas son **declarativas**: cada una lista sus pasos cortos (pocos campos por pantalla), la revisión y cómo se arma el registro `x_hys_*`. El motor común (`componentes/asistente.js`) pone Atrás/Siguiente, valida cada paso, guarda borrador, muestra la revisión final y manda a la cola.
- Checklists (F02, F03, F04, F08): Sí / No / N/A con botones grandes. Cada «No» pide **gravedad + foto obligatoria** y arma el **desvío** anidado (lo de plazos y responsable lo calcula Odoo). En F03 además pide el sector; en F08 el N/A pide justificación y un crítico ★ en «No» impide «Autorizado».

## Archivos

```
hys-carga/
├── index.html                    # Pantalla única: encabezado (obra / quién carga / envíos) + contenido
├── app.js                        # Arranque, ruteo por hash, inicio (F01–F08), elegir obra, elegir usuario, envíos
├── css/estilos.css               # Mobile-first, botones grandes, sin frameworks
├── api/
│   ├── config.js                 # MOCK = true/false, URL del backend, zona horaria, fotos
│   ├── odoo.js                   # crearRegistro / leerRegistros / escribirRegistro (mock y fetch al backend)
│   ├── cola.js                   # Cola sin conexión con reintentos e idempotencia
│   └── datos-mock.js             # Datos de prueba (obras, usuarios locales, empleados, turnos, ítems, ...)
├── componentes/
│   ├── selector-obra.js          # Selector de obra (OT), usado por F01, F02, F05 y por el encabezado
│   ├── selector-turno.js         # Selector de turno (F08); turnos a definir por la empresa
│   ├── campos-auto.js            # Idempotency key, fecha/hora con zona, GPS con falla controlada, campos de control
│   ├── campos.js                 # Campos grandes: texto, opciones, casillas, foto (comprimida), firma en pantalla
│   ├── checklist.js              # Sí/No/N/A, «No» → gravedad + foto → desvío
│   ├── asistente.js              # Motor de pasos: Atrás/Siguiente, borrador, revisión y Enviar
│   ├── encabezado.js             # Encabezado compartido
│   ├── sesion.js                 # Obra y usuario local elegidos
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

## Pendiente / simplificado en este esqueleto

- Sin backend: los endpoints `/api/v1/registros/...` de `odoo.js` son provisorios; el diseño (§5.5) define endpoints por formulario y fotos en `multipart`.
- Ingreso de usuarios: en el mock se elige de la lista; falta definir el mecanismo real.
- Turnos (F08): Mañana 07:00 y Tarde 14:00 son un supuesto; la empresa tiene que definirlos.
- F02 se crea como inspección «fuera de programa»; enlazarla con la inspección programada lo resuelve el backend.
- F01: la clase de riesgo, la frecuencia y los hitos críticos no se calculan acá (los calcula Odoo). F05: la investigación la carga HyS en Odoo. F07 lista todos los desvíos abiertos (en producción, solo los del responsable).
- Cola y fotos en `localStorage` (el diseño pide IndexedDB). Sin *service worker* todavía.
