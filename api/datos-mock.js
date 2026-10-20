// Datos FICTICIOS para el modo MOCK (config.js → MOCK = true).
// Riesgos, plantilla de ítems y controles legales salen tal cual del documento de diseño
// (Diseno-App-HyS-Odoo-Studio.md §2.4, §2.12 y Anexo A). Obras, empleados, fichas y desvíos
// salen de la simulación «ARME HyS Formularios y Tablero» y son datos de prueba, no de Odoo.
// En producción todo esto lo entrega el backend de Render (GET /api/v1/catalogos, §5.2 punto 5).

export const RIESGOS = [
  {"id": 1, "x_codigo": "altura", "x_name": "Trabajo en altura", "x_gravedad": "critico", "x_hitos_texto": "Esqueleto / Montaje, Zinguería, Techado y aislación", "x_active": true},
  {"id": 2, "x_codigo": "izaje", "x_name": "Izaje de cargas / grúa", "x_gravedad": "critico", "x_hitos_texto": "Esqueleto / Montaje", "x_active": true},
  {"id": 3, "x_codigo": "caliente", "x_name": "Soldadura y corte (trabajo en caliente)", "x_gravedad": "critico", "x_hitos_texto": "Esqueleto / Montaje", "x_active": true},
  {"id": 4, "x_codigo": "excavacion", "x_name": "Excavación", "x_gravedad": "critico", "x_hitos_texto": "Excavaciones", "x_active": true},
  {"id": 5, "x_codigo": "confinados", "x_name": "Espacios confinados", "x_gravedad": "critico", "x_hitos_texto": "Cualquier tarea", "x_active": true},
  {"id": 6, "x_codigo": "demolicion", "x_name": "Demolición", "x_gravedad": "critico", "x_hitos_texto": "Cualquier tarea", "x_active": true},
  {"id": 7, "x_codigo": "hormigon", "x_name": "Hormigón / bomba", "x_gravedad": "medio", "x_hitos_texto": "Fundaciones, Piso", "x_active": true},
  {"id": 8, "x_codigo": "andamios", "x_name": "Andamios / escaleras", "x_gravedad": "medio", "x_hitos_texto": "Cerramiento lateral y aberturas", "x_active": true},
  {"id": 9, "x_codigo": "electrica", "x_name": "Instalación eléctrica provisoria", "x_gravedad": "medio", "x_hitos_texto": "Piso", "x_active": true},
  {"id": 10, "x_codigo": "viapublica", "x_name": "Vía pública / terceros", "x_gravedad": "medio", "x_hitos_texto": "Cualquier tarea", "x_active": true},
  {"id": 11, "x_codigo": "sustancias", "x_name": "Sustancias (pinturas, solventes, gases)", "x_gravedad": "medio", "x_hitos_texto": "Cualquier tarea", "x_active": true}
];

export const ITEMS_PLANTILLA = [
  {"id": 1, "x_codigo": "F02-GEN-01", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Orden y limpieza del frente; acopios estables y fuera de la circulación", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 2, "x_codigo": "F02-GEN-02", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Vallado y señalización del perímetro y sectores restringidos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 3, "x_codigo": "F02-GEN-03", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "EPP en uso según la tarea", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 4, "x_codigo": "F02-GEN-04", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 4, "x_name": "Todo el personal presente figura en la nómina de la obra", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 5, "x_codigo": "F02-GEN-05", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 5, "x_name": "Extintor y botiquín en el frente, accesibles y en fecha", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 6, "x_codigo": "F02-GEN-06", "x_formulario": "F02", "x_bloque": "Generales · siempre", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 6, "x_name": "Tableros y cables provisorios con disyuntor y puesta a tierra", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 7, "x_codigo": "F02-ALTURA-01", "x_formulario": "F02", "x_bloque": "Trabajo en altura", "x_riesgo_id": [1, "Trabajo en altura"], "x_critico": false, "x_secuencia": 7, "x_name": "Barandas, redes o protección de bordes y aberturas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 8, "x_codigo": "F02-ALTURA-02", "x_formulario": "F02", "x_bloque": "Trabajo en altura", "x_riesgo_id": [1, "Trabajo en altura"], "x_critico": false, "x_secuencia": 8, "x_name": "Arnés con doble cabo y anclaje o línea de vida certificada", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 9, "x_codigo": "F02-ALTURA-03", "x_formulario": "F02", "x_bloque": "Trabajo en altura", "x_riesgo_id": [1, "Trabajo en altura"], "x_critico": false, "x_secuencia": 9, "x_name": "Escaleras y accesos en buen estado y sujetos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 10, "x_codigo": "F02-IZAJE-01", "x_formulario": "F02", "x_bloque": "Izaje de cargas / grúa", "x_riesgo_id": [2, "Izaje de cargas / grúa"], "x_critico": false, "x_secuencia": 10, "x_name": "Plan de izaje y área de exclusión: nadie bajo la carga", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 11, "x_codigo": "F02-IZAJE-02", "x_formulario": "F02", "x_bloque": "Izaje de cargas / grúa", "x_riesgo_id": [2, "Izaje de cargas / grúa"], "x_critico": false, "x_secuencia": 11, "x_name": "Eslingas, grilletes y ganchos con traba, sin daños", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 12, "x_codigo": "F02-IZAJE-03", "x_formulario": "F02", "x_bloque": "Izaje de cargas / grúa", "x_riesgo_id": [2, "Izaje de cargas / grúa"], "x_critico": false, "x_secuencia": 12, "x_name": "Operador y señalero identificados y habilitados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 13, "x_codigo": "F02-CALIENTE-01", "x_formulario": "F02", "x_bloque": "Soldadura y corte (trabajo en caliente)", "x_riesgo_id": [3, "Soldadura y corte (trabajo en caliente)"], "x_critico": false, "x_secuencia": 13, "x_name": "Permiso de trabajo en caliente y extintor a mano", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 14, "x_codigo": "F02-CALIENTE-02", "x_formulario": "F02", "x_bloque": "Soldadura y corte (trabajo en caliente)", "x_riesgo_id": [3, "Soldadura y corte (trabajo en caliente)"], "x_critico": false, "x_secuencia": 14, "x_name": "Pantallas para terceros; careta y ropa adecuada", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 15, "x_codigo": "F02-CALIENTE-03", "x_formulario": "F02", "x_bloque": "Soldadura y corte (trabajo en caliente)", "x_riesgo_id": [3, "Soldadura y corte (trabajo en caliente)"], "x_critico": false, "x_secuencia": 15, "x_name": "Cilindros sujetos, con capuchón y válvula antirretorno", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 16, "x_codigo": "F02-EXCAVACION-01", "x_formulario": "F02", "x_bloque": "Excavación", "x_riesgo_id": [4, "Excavación"], "x_critico": false, "x_secuencia": 16, "x_name": "Borde vallado; acopio a más de 1 m del borde", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 17, "x_codigo": "F02-EXCAVACION-02", "x_formulario": "F02", "x_bloque": "Excavación", "x_riesgo_id": [4, "Excavación"], "x_critico": false, "x_secuencia": 17, "x_name": "Taludes o entibado según profundidad; escalera de salida", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 18, "x_codigo": "F02-EXCAVACION-03", "x_formulario": "F02", "x_bloque": "Excavación", "x_riesgo_id": [4, "Excavación"], "x_critico": false, "x_secuencia": 18, "x_name": "Interferencias identificadas antes de excavar", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 19, "x_codigo": "F02-CONFINADOS-01", "x_formulario": "F02", "x_bloque": "Espacios confinados", "x_riesgo_id": [5, "Espacios confinados"], "x_critico": false, "x_secuencia": 19, "x_name": "Medición de atmósfera antes del ingreso", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 20, "x_codigo": "F02-CONFINADOS-02", "x_formulario": "F02", "x_bloque": "Espacios confinados", "x_riesgo_id": [5, "Espacios confinados"], "x_critico": false, "x_secuencia": 20, "x_name": "Vigía exterior y medio de rescate disponible", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 21, "x_codigo": "F02-DEMOLICION-01", "x_formulario": "F02", "x_bloque": "Demolición", "x_riesgo_id": [6, "Demolición"], "x_critico": false, "x_secuencia": 21, "x_name": "Servicios cortados y zona de exclusión", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 22, "x_codigo": "F02-DEMOLICION-02", "x_formulario": "F02", "x_bloque": "Demolición", "x_riesgo_id": [6, "Demolición"], "x_critico": false, "x_secuencia": 22, "x_name": "Procedimiento de demolición aprobado", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 23, "x_codigo": "F02-HORMIGON-01", "x_formulario": "F02", "x_bloque": "Hormigón / bomba", "x_riesgo_id": [7, "Hormigón / bomba"], "x_critico": false, "x_secuencia": 23, "x_name": "Encofrados y apuntalamientos estables", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 24, "x_codigo": "F02-HORMIGON-02", "x_formulario": "F02", "x_bloque": "Hormigón / bomba", "x_riesgo_id": [7, "Hormigón / bomba"], "x_critico": false, "x_secuencia": 24, "x_name": "Bomba o mixer con área de exclusión y señalero", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 25, "x_codigo": "F02-HORMIGON-03", "x_formulario": "F02", "x_bloque": "Hormigón / bomba", "x_riesgo_id": [7, "Hormigón / bomba"], "x_critico": false, "x_secuencia": 25, "x_name": "Hierros salientes protegidos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 26, "x_codigo": "F02-ANDAMIOS-01", "x_formulario": "F02", "x_bloque": "Andamios / escaleras", "x_riesgo_id": [8, "Andamios / escaleras"], "x_critico": false, "x_secuencia": 26, "x_name": "Andamio con tarjeta de inspección vigente", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 27, "x_codigo": "F02-ANDAMIOS-02", "x_formulario": "F02", "x_bloque": "Andamios / escaleras", "x_riesgo_id": [8, "Andamios / escaleras"], "x_critico": false, "x_secuencia": 27, "x_name": "Plataformas completas, barandas y zócalos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 28, "x_codigo": "F02-ANDAMIOS-03", "x_formulario": "F02", "x_bloque": "Andamios / escaleras", "x_riesgo_id": [8, "Andamios / escaleras"], "x_critico": false, "x_secuencia": 28, "x_name": "Apoyos firmes, nivelados y arriostrados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 29, "x_codigo": "F02-ELECTRICA-01", "x_formulario": "F02", "x_bloque": "Instalación eléctrica provisoria", "x_riesgo_id": [9, "Instalación eléctrica provisoria"], "x_critico": false, "x_secuencia": 29, "x_name": "Herramientas eléctricas con cable y ficha sanos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 30, "x_codigo": "F02-ELECTRICA-02", "x_formulario": "F02", "x_bloque": "Instalación eléctrica provisoria", "x_riesgo_id": [9, "Instalación eléctrica provisoria"], "x_critico": false, "x_secuencia": 30, "x_name": "Prolongaciones sin empalmes y fuera del agua", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 31, "x_codigo": "F02-VIAPUBLICA-01", "x_formulario": "F02", "x_bloque": "Vía pública / terceros", "x_riesgo_id": [10, "Vía pública / terceros"], "x_critico": false, "x_secuencia": 31, "x_name": "Señalero y vallado para terceros", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 32, "x_codigo": "F02-VIAPUBLICA-02", "x_formulario": "F02", "x_bloque": "Vía pública / terceros", "x_riesgo_id": [10, "Vía pública / terceros"], "x_critico": false, "x_secuencia": 32, "x_name": "Ropa reflectiva e iluminación si hay poca luz", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 33, "x_codigo": "F02-SUSTANCIAS-01", "x_formulario": "F02", "x_bloque": "Sustancias (pinturas, solventes, gases)", "x_riesgo_id": [11, "Sustancias (pinturas, solventes, gases)"], "x_critico": false, "x_secuencia": 33, "x_name": "Envases rotulados, con hoja de seguridad", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 34, "x_codigo": "F02-SUSTANCIAS-02", "x_formulario": "F02", "x_bloque": "Sustancias (pinturas, solventes, gases)", "x_riesgo_id": [11, "Sustancias (pinturas, solventes, gases)"], "x_critico": false, "x_secuencia": 34, "x_name": "Almacenamiento ventilado, lejos de fuentes de calor", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 35, "x_codigo": "F03-01", "x_formulario": "F03", "x_bloque": "Máquinas (Láser, Plegado, Conformado)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Láser: cabina, enclavamientos y extracción", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 36, "x_codigo": "F03-02", "x_formulario": "F03", "x_bloque": "Máquinas (Láser, Plegado, Conformado)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Plegadora y guillotina: protección del punto de operación y pedal", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 37, "x_codigo": "F03-03", "x_formulario": "F03", "x_bloque": "Máquinas (Láser, Plegado, Conformado)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "Bloqueo y rotulado de equipos en mantenimiento", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 38, "x_codigo": "F03-04", "x_formulario": "F03", "x_bloque": "Soldadura y gases", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 4, "x_name": "Extracción de humos funcionando en los puestos", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 39, "x_codigo": "F03-05", "x_formulario": "F03", "x_bloque": "Soldadura y gases", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 5, "x_name": "Cilindros encadenados, oxígeno separado del combustible", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 40, "x_codigo": "F03-06", "x_formulario": "F03", "x_bloque": "Soldadura y gases", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 6, "x_name": "Mamparas para proteger al resto del sector", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 41, "x_codigo": "F03-07", "x_formulario": "F03", "x_bloque": "Izaje y puente grúa", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 7, "x_name": "Ganchos con traba, eslingas y cadenas sin daños", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 42, "x_codigo": "F03-08", "x_formulario": "F03", "x_bloque": "Izaje y puente grúa", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 8, "x_name": "Carga máxima indicada y botonera en buen estado", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 43, "x_codigo": "F03-09", "x_formulario": "F03", "x_bloque": "Izaje y puente grúa", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 9, "x_name": "Nadie trabaja bajo carga suspendida", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 44, "x_codigo": "F03-10", "x_formulario": "F03", "x_bloque": "Autoelevador", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 10, "x_name": "Check preuso del operador hecho en el día", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 45, "x_codigo": "F03-11", "x_formulario": "F03", "x_bloque": "Autoelevador", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 11, "x_name": "Operador habilitado; luces, bocina y alarma de retroceso", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 46, "x_codigo": "F03-12", "x_formulario": "F03", "x_bloque": "Ingreso de mercadería y carga/descarga", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 12, "x_name": "Zona de descarga demarcada y despejada de personas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 47, "x_codigo": "F03-13", "x_formulario": "F03", "x_bloque": "Ingreso de mercadería y carga/descarga", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 13, "x_name": "Camión frenado y calzado antes de descargar", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 48, "x_codigo": "F03-14", "x_formulario": "F03", "x_bloque": "Ingreso de mercadería y carga/descarga", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 14, "x_name": "Estiba de chapas y perfiles estable, con separadores", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 49, "x_codigo": "F03-15", "x_formulario": "F03", "x_bloque": "Ingreso de mercadería y carga/descarga", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 15, "x_name": "Autoelevador o grúa operados solo por personal habilitado", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 50, "x_codigo": "F03-16", "x_formulario": "F03", "x_bloque": "Orden, EPP y almacenamiento", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 16, "x_name": "EPP completo en uso en todos los sectores", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 51, "x_codigo": "F03-17", "x_formulario": "F03", "x_bloque": "Orden, EPP y almacenamiento", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 17, "x_name": "Estanterías ancladas y sin sobrecarga", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 52, "x_codigo": "F03-18", "x_formulario": "F03", "x_bloque": "Orden, EPP y almacenamiento", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 18, "x_name": "Residuos y recortes en su contenedor", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 53, "x_codigo": "F04F-01", "x_formulario": "F04_FAB", "x_bloque": "Extintores", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Carga y precinto vigentes, manómetro en verde", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 54, "x_codigo": "F04F-02", "x_formulario": "F04_FAB", "x_bloque": "Extintores", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Accesibles, señalizados y con tarjeta de control", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 55, "x_codigo": "F04F-03", "x_formulario": "F04_FAB", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "Luces de emergencia: prueba de encendido", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 56, "x_codigo": "F04F-04", "x_formulario": "F04_FAB", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 4, "x_name": "Salidas de emergencia libres, señalizadas y que abren hacia afuera", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 57, "x_codigo": "F04F-05", "x_formulario": "F04_FAB", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 5, "x_name": "Punto de reunión señalizado", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 58, "x_codigo": "F04F-06", "x_formulario": "F04_FAB", "x_bloque": "Electricidad", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 6, "x_name": "Disyuntores: prueba con el botón de test", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 59, "x_codigo": "F04F-07", "x_formulario": "F04_FAB", "x_bloque": "Electricidad", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 7, "x_name": "Tableros cerrados, rotulados y sin partes vivas expuestas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 60, "x_codigo": "F04F-08", "x_formulario": "F04_FAB", "x_bloque": "Primeros auxilios", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 8, "x_name": "Botiquines completos y en fecha", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 61, "x_codigo": "F04F-09", "x_formulario": "F04_FAB", "x_bloque": "Inflamables y presión", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 9, "x_name": "Depósito de pinturas y solventes ventilado, con contención de derrames", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 62, "x_codigo": "F04F-10", "x_formulario": "F04_FAB", "x_bloque": "Inflamables y presión", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 10, "x_name": "Compresor: válvula de seguridad y purga del tanque", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 63, "x_codigo": "F04O-01", "x_formulario": "F04_OFI", "x_bloque": "Extintores", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Carga y precinto vigentes, manómetro en verde", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 64, "x_codigo": "F04O-02", "x_formulario": "F04_OFI", "x_bloque": "Extintores", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Accesibles y señalizados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 65, "x_codigo": "F04O-03", "x_formulario": "F04_OFI", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "Luces de emergencia: prueba de encendido", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 66, "x_codigo": "F04O-04", "x_formulario": "F04_OFI", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 4, "x_name": "Salidas libres y señalizadas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 67, "x_codigo": "F04O-05", "x_formulario": "F04_OFI", "x_bloque": "Emergencia", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 5, "x_name": "Plano de evacuación visible y actualizado", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 68, "x_codigo": "F04O-06", "x_formulario": "F04_OFI", "x_bloque": "Electricidad", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 6, "x_name": "Disyuntor: prueba con el botón de test", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 69, "x_codigo": "F04O-07", "x_formulario": "F04_OFI", "x_bloque": "Electricidad", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 7, "x_name": "Sin zapatillas en cadena ni cables por el piso", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 70, "x_codigo": "F04O-08", "x_formulario": "F04_OFI", "x_bloque": "Primeros auxilios", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 8, "x_name": "Botiquín completo y en fecha", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 71, "x_codigo": "F08D-01", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Personal instruido y tareas informadas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 72, "x_codigo": "F08D-02", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Pasillos, salidas y equipos de emergencia accesibles", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 73, "x_codigo": "F08D-03", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "Estibas, perfiles, chapas y cargas estables", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 74, "x_codigo": "F08D-04", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 4, "x_name": "Equipos y medios de izaje inspeccionados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 75, "x_codigo": "F08D-05", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 5, "x_name": "Cilindros identificados, sujetos y válvulas protegidas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 76, "x_codigo": "F08D-06", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 6, "x_name": "Gases y líquidos inflamables segregados según evaluación", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 77, "x_codigo": "F08D-07", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 7, "x_name": "Ventilación y control de fuentes de ignición verificados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 78, "x_codigo": "F08D-08", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 8, "x_name": "FDS disponibles y envases químicos identificados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 79, "x_codigo": "F08D-09", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 9, "x_name": "Sin fugas ni derrames sin controlar", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 80, "x_codigo": "F08D-10", "x_formulario": "F08_DEP", "x_bloque": "Chequeo antes de empezar (ATS-DEP-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 10, "x_name": "EPP, permisos y controles específicos disponibles", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 81, "x_codigo": "F08L-01", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 1, "x_name": "Personal instruido y tareas informadas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 82, "x_codigo": "F08L-02", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 2, "x_name": "Pasillos, salidas y equipos de emergencia accesibles", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 83, "x_codigo": "F08L-03", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 3, "x_name": "Zonas de circulación vehicular y peatonal delimitadas", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 84, "x_codigo": "F08L-04", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 4, "x_name": "Andamios, repuestos y cargas correctamente estibados", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 85, "x_codigo": "F08L-05", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 5, "x_name": "Máquinas de mano codificadas y registradas (control de avance)", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 86, "x_codigo": "F08L-06", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 6, "x_name": "Herramientas inspeccionadas; defectuosas fuera de servicio", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 87, "x_codigo": "F08L-07", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 7, "x_name": "Resguardos, cables, fichas y accesorios en condiciones", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 88, "x_codigo": "F08L-08", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": true, "x_secuencia": 8, "x_name": "Aislamiento / bloqueo de energías y permisos, cuando aplique", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 89, "x_codigo": "F08L-09", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 9, "x_name": "Lubricantes y químicos identificados; sin derrames", "x_active": true, "x_version": "PR-HYS-001 v1"},
  {"id": 90, "x_codigo": "F08L-10", "x_formulario": "F08_LOG", "x_bloque": "Chequeo antes de empezar (ATS-LOG-MANT-001)", "x_riesgo_id": false, "x_critico": false, "x_secuencia": 10, "x_name": "EPP y controles específicos disponibles", "x_active": true, "x_version": "PR-HYS-001 v1"}
];

export const CONTROLES_LEGALES = [
  {"id": 1, "x_name": "Medición de puesta a tierra y continuidad de masas", "x_referencia": "Res. SRT 900/15", "x_donde": "Fábrica y Oficina", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "1", "x_estado": "sin_estado"},
  {"id": 2, "x_name": "Recarga de extintores", "x_referencia": "IRAM 3517-2", "x_donde": "Fábrica, Oficina y obradores", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "1", "x_estado": "sin_estado"},
  {"id": 3, "x_name": "Medición de ruido", "x_referencia": "Res. SRT 85/12", "x_donde": "Fábrica", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "2", "x_estado": "sin_estado"},
  {"id": 4, "x_name": "Medición de iluminación", "x_referencia": "Res. SRT 84/12", "x_donde": "Fábrica y Oficina", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "2", "x_estado": "sin_estado"},
  {"id": 5, "x_name": "Contaminantes en el aire (humos de soldadura, solventes)", "x_referencia": "Res. MTEySS 295/03", "x_donde": "Soldadura y Pintura", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "2", "x_estado": "sin_estado"},
  {"id": 6, "x_name": "Prueba hidráulica de extintores", "x_referencia": "IRAM 3517-2", "x_donde": "Fábrica, Oficina y obradores", "x_periodicidad": "5_anios", "x_periodicidad_meses": 60, "x_prioridad": "2", "x_estado": "sin_estado"},
  {"id": 7, "x_name": "Compresor y recipientes a presión", "x_referencia": "Normativa provincial", "x_donde": "Fábrica", "x_periodicidad": "segun_norma", "x_periodicidad_meses": false, "x_prioridad": "2", "x_estado": "sin_estado"},
  {"id": 8, "x_name": "Simulacro de evacuación", "x_referencia": "Plan de evacuación", "x_donde": "Fábrica y Oficina", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "3", "x_estado": "sin_estado"},
  {"id": 9, "x_name": "Plan anual de capacitación aprobado", "x_referencia": "Ley 19.587", "x_donde": "Todas las áreas", "x_periodicidad": "anual", "x_periodicidad_meses": 12, "x_prioridad": "3", "x_estado": "sin_estado"}
];

// ---- Datos de prueba (ficticios, de la simulación) ----

// project.project · OT activas. km = distancia a Posadas (> 50 km: puede alternar presencial/remota).
// project.project «en obra» · EJEMPLOS ficticios (el repo es público: los nombres reales de proyectos y
// clientes NO se suben; los sirve el backend desde Odoo con GET /api/obras, decisión D-05).
// Mismos datos que datos/obras.json. x_mock_km es solo del ejemplo (distancia para la modalidad remota).
export const OBRAS = [
  {id: 101, name: "OT 9101 - Galpón Ejemplo Norte", ot: "9101", partner_id: [901, "Cliente Ejemplo A"], user_id: [201, "Director de Obra Ejemplo 1"], x_mock_km: 35},
  {id: 102, name: "OT 9102 - Cubierta Ejemplo Sur", ot: "9102", partner_id: [901, "Cliente Ejemplo A"], user_id: [201, "Director de Obra Ejemplo 1"], x_mock_km: 35},
  {id: 103, name: "OT 9103 - Estructura Ejemplo Lejana", ot: "9103", partner_id: [902, "Cliente Ejemplo B"], user_id: [201, "Director de Obra Ejemplo 1"], x_mock_km: 120},
  {id: 104, name: "OT 9104 - Entrepiso Ejemplo", ot: "9104", partner_id: [903, "Cliente Ejemplo C"], user_id: [202, "Director de Obra Ejemplo 2"], x_mock_km: 15},
  {id: 105, name: "OT 9105 - Aireadores Ejemplo", ot: "9105", partner_id: [901, "Cliente Ejemplo A"], user_id: [201, "Director de Obra Ejemplo 1"], x_mock_km: 35},
  {id: 106, name: "OT 9106 - Portones Ejemplo", ot: "9106", partner_id: [901, "Cliente Ejemplo A"], user_id: [201, "Director de Obra Ejemplo 1"], x_mock_km: 35}
];

// hr.employee · x_mock_roles, x_legajo, x_tipo y x_empresa (EJEMPLOS) son solo del mock; los inspectores
// reales salen de x_hys_inspector (HyS > Inspectores) vía el backend (para filtrar listas); en Odoo saldrá de grupos/puestos.
export const EMPLEADOS = [
  {id: 11, name: "Gerente HyS Ejemplo", job_title: "Gerente HyS", x_mock_roles: ["inspector", "hys"], x_legajo: "9011"},
  {id: 12, name: "Inspector HyS Ejemplo", job_title: "HyS", x_mock_roles: ["inspector", "hys"], x_legajo: "9012"},
  {id: 13, name: "Ing. asesora de HyS", job_title: "Asesora HyS", x_mock_roles: ["inspector"], x_legajo: "9013", x_tipo: "externo", x_empresa: "Consultora Ejemplo SRL"},
  {id: 14, name: "Director de Obra Ejemplo 1", job_title: "Director de Obra", x_mock_roles: ["director"]},
  {id: 15, name: "Director de Obra Ejemplo 2", job_title: "Director de Obra", x_mock_roles: ["director"]},
  {id: 16, name: "Jefe de Producción Ejemplo", job_title: "Jefe de Producción", x_mock_roles: ["fabrica"]},
  {id: 17, name: "Encargado Depósito Ejemplo", job_title: "Encargado Depósito Central", x_mock_roles: ["encargado"]},
  {id: 18, name: "Gerencia de Stock Ejemplo", job_title: "Gerencia de Stock", x_mock_roles: ["autoriza"]},
  {id: 19, name: "Gerencia de Logística Ejemplo", job_title: "Gerencia de Logística", x_mock_roles: ["autoriza", "encargado"]},
  {id: 20, name: "Gerente UGEOP Ejemplo", job_title: "Gerente de UGEOP", x_mock_roles: []},
  {id: 21, name: "Dirección Ejemplo", job_title: "Dirección", x_mock_roles: []}
];

// x_hys_ficha · Fichas ya aprobadas (la OT 9104 no tiene: solo entran los 6 ítems generales en F02).
export const FICHAS = [
  {id: 1, x_name: "FR-OT-101", x_ot_id: [101, "OT 9101 - Galpón Ejemplo Norte"], x_estado: "aprobada", x_distancia_km: 35, x_riesgo_ids: [1, 2, 3, 9], x_clase_riesgo: "A", x_clase_motivo: "Riesgo crítico: Esqueleto / Montaje en curso (izaje, altura, soldadura)"},
  {id: 2, x_name: "FR-OT-102", x_ot_id: [102, "OT 9102 - Cubierta Ejemplo Sur"], x_estado: "aprobada", x_distancia_km: 35, x_riesgo_ids: [1, 8], x_clase_riesgo: "A", x_clase_motivo: "Riesgo crítico: Zinguería en curso (altura)"},
  {id: 3, x_name: "FR-OT-103", x_ot_id: [103, "OT 9103 - Estructura Ejemplo Lejana"], x_estado: "aprobada", x_distancia_km: 120, x_riesgo_ids: [7, 2, 1, 3], x_clase_riesgo: "A", x_clase_motivo: "Esqueleto / Montaje arranca en los próximos 7 días"},
  {id: 4, x_name: "FR-OT-105", x_ot_id: [105, "OT 9105 - Aireadores Ejemplo"], x_estado: "aprobada", x_distancia_km: 35, x_riesgo_ids: [7, 9], x_clase_riesgo: "B", x_clase_motivo: "Solo hitos de riesgo medio (Piso)"},
  {id: 5, x_name: "FR-OT-106", x_ot_id: [106, "OT 9106 - Portones Ejemplo"], x_estado: "aprobada", x_distancia_km: 35, x_riesgo_ids: [9], x_clase_riesgo: "C", x_clase_motivo: "Obra fina, sin hitos de riesgo crítico ni medio"}
];

// x_hys_desvio · Desvíos abiertos de prueba (para F07).
export const DESVIOS = [
  {id: 1, x_name: "D-00001", x_origen_formulario: "F03", x_ambito: "fabrica", x_sector: "corte_laser", x_descripcion: "Cabina del láser abierta con el equipo en marcha", x_criticidad: "critico", x_estado: "abierto", x_fecha_deteccion: "2026-10-21T10:00:00-03:00", x_responsable_id: [216, "Jefe de Producción Ejemplo"]},
  {id: 2, x_name: "D-00002", x_origen_formulario: "F03", x_ambito: "fabrica", x_sector: "estructura_soldadura", x_descripcion: "Cilindro de oxígeno sin cadena de sujeción", x_criticidad: "mayor", x_estado: "abierto", x_fecha_deteccion: "2026-10-21T10:00:00-03:00", x_responsable_id: [216, "Jefe de Producción Ejemplo"]},
  {id: 3, x_name: "D-00003", x_origen_formulario: "F02", x_ambito: "obra", x_ot_id: [103, "OT 9103 - Estructura Ejemplo Lejana"], x_descripcion: "Eslinga con alambres cortados en uso", x_criticidad: "mayor", x_estado: "abierto", x_fecha_deteccion: "2026-10-21T11:00:00-03:00", x_responsable_id: [201, "Director de Obra Ejemplo 1"]},
  {id: 4, x_name: "D-00004", x_origen_formulario: "F02", x_ambito: "obra", x_ot_id: [101, "OT 9101 - Galpón Ejemplo Norte"], x_descripcion: "Acopio de chapas sobre la vía de circulación", x_criticidad: "menor", x_estado: "abierto", x_fecha_deteccion: "2026-10-20T09:00:00-03:00", x_responsable_id: [201, "Director de Obra Ejemplo 1"]}
];

// x_hys_turno (F08). En Odoo: «Jornada» lunes a viernes 07:00 en los dos sectores (decisión D-03).
// Mismo formato que GET /api/v1/ats/catalogo → turnos. Datos de EJEMPLO.
export const TURNOS = [
  {id: 1, codigo: "jornada", nombre: "Jornada", sector: "deposito", inicio: "07:00", dias: [0, 1, 2, 3, 4], encargado_id: 17, autoriza_id: 18, codigo_ats: "ATS-DEP-001"},
  {id: 2, codigo: "jornada", nombre: "Jornada", sector: "logistica", inicio: "07:00", dias: [0, 1, 2, 3, 4], encargado_id: null, autoriza_id: 19, codigo_ats: "ATS-LOG-MANT-001"}
];
// ★ que NO admiten N/A (decisión D-05). El resto admite N/A con justificación.
export const ATS_SIN_NA = ["F08D-04", "F08D-05", "F08D-06", "F08D-07", "F08D-09", "F08L-06", "F08L-07"];

// ---- Lugar sin OT (Fábrica, Oficina, Depósito Central, Logística y Mantenimiento) ----
export const LUGAR_PLANTA = {id: "planta", name: "Planta · Fábrica, Oficina, Depósito y Logística"};

// Quién ingresa: los inspectores (x_hys_inspector). En modo ejemplo, los EMPLEADOS de abajo con rol «inspector».

// project.milestone · hitos de prueba por OT (nombres de la plantilla, diseño §2.6).
// x_riesgo_hys: critico | medio | bajo. En F02 «Inicio de hito crítico (72 h)» lista los críticos de la OT.
const HITOS_PLANTILLA = [
  ["Excavaciones", "critico"], ["Fundaciones", "medio"], ["Esqueleto / Montaje", "critico"], ["Zinguería", "critico"],
  ["Techado y aislación", "critico"], ["Cerramiento lateral y aberturas", "medio"], ["Piso", "medio"], ["Obra fina", "bajo"]
];
export const HITOS = OBRAS.flatMap((o, i) => HITOS_PLANTILLA.map(([name, riesgo], j) => ({
  id: 1000 + i * 10 + j, name, project_id: [o.id, o.name], x_riesgo_hys: riesgo
})));
