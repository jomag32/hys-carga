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
