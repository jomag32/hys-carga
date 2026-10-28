# Manual de uso · Fichas HyS (hys-carga)

## Cómo funciona la app

### Ingreso

- Elegís tu nombre (nadie carga por otro), ponés tu contraseña y elegís la obra o lugar.
- Cada ficha es un asistente por pasos: «Siguiente» no avanza si falta algo obligatorio (te dice qué).
- Al final ves la Revisión y tocás «Enviar ✓».

### Sin señal

- Lo que envíes sin señal queda en el celular («📱 En el celular») y se manda solo cuando vuelve la señal.
- Hasta que en «Envíos del celular» no figura «✅ Enviado a Odoo», no se hizo.
- Si salís a mitad de una ficha, queda un borrador y la próxima vez seguís desde ahí.

### Datos automáticos

- La ubicación (GPS), la fecha y hora y quién carga se toman solos. Si el GPS falla, se envía igual con la marca.

### Quién ve qué

- Encargados de sector: F08 (ATS) y F05 (accidentes).
- HyS (inspector, responsable, desarrollo): todas, incluidas F06 y F07.
- Resto de usuarios habilitados: todas menos F06 y F07.

## F01 · Ficha de Riesgos de Obra

**Para qué sirve.** Dejar escritos los riesgos de cada obra al arrancarla. Con esa Ficha, Odoo calcula la clase de riesgo (A/B/C) y qué ítems se inspeccionan en F02.

**Quién la carga y quién la ve.** La carga HyS al crear la OT (obras no iniciadas, en curso o pausadas). La aprueba HyS responsable en Odoo. La ven HyS y Dirección de Obra en Odoo (Higiene y Seguridad › Fichas › F01).

### Cómo cargarla

1. **Obra:** Viene de la obra elegida al ingresar (podés «Cambiar»). Una sola Ficha por OT: si ya tiene, no deja seguir.
2. **Lugar:** Distancia a Posadas en km (obligatoria) y tipo de predio (obligatorio): terreno del cliente, planta de terceros o vía pública.
3. **Riesgos aplicables:** Marcá todos los que tiene la obra (al menos uno). ★ Crítico o Medio según el catálogo.
4. **Hitos (opcional):** Etapas de la obra (montaje, zinguería…): nombre, inicio previsto y riesgos de ese hito. Se pueden completar después en Odoo.
5. **Controles y documentación (opcional):** EPP y controles específicos; documentación que pide el cliente.
6. **Centro de salud:** Centro más cercano y teléfonos (obligatorio).

### Qué pasa después y cómo calcula

- Se crea en Odoo como BORRADOR con número FR automático. La app nunca aprueba.
- HyS responsable la aprueba en Odoo: necesita centro de salud, firma de aprobación y al menos un riesgo.
- Clase de riesgo (la calcula Odoo al guardar la Ficha o un hito, y todos los días a las 05:00):
  - Ficha sin aprobar → Clase A.
  - Aprobada pero sin hitos → Clase A («faltan hitos»).
  - Algún hito CRÍTICO en curso o que arranca en los próximos 7 días → Clase A.
  - Si no, algún hito MEDIO en curso o que arranca en los próximos 7 días → Clase B.
  - Si no hay ninguno de esos → Clase C.
- Hito terminado no cuenta. Hito crítico o medio sin fecha prevista: aviso para cargarle la fecha.
- «Revisar con UGEOP»: hay un riesgo crítico marcado que ningún hito crítico cubre.
- Obra a más de 50 km: modalidad alterna (inspección presencial y remota).

### Preguntas frecuentes

- **Me equivoqué en un riesgo, ¿lo cambio en la app?** No: una vez enviada, se corrige en Odoo (HyS). Si estaba aprobada, vuelve a borrador y hay que aprobarla de nuevo.
- **¿Por qué mi obra sale Clase A si es tranquila?** Porque todavía no está aprobada o no tiene hitos. Mirá el «Motivo de la clase» en la Ficha en Odoo.

## F02 · Inspección de obra

**Para qué sirve.** Registrar la inspección de HyS en una obra (o en Fábrica/Oficina) con sus ítems Sí / No / N/A.

**Quién la carga y quién la ve.** La carga el inspector de HyS que la hizo. Quien toma conocimiento firma en el celular. Se ve en Odoo › Fichas › F02.

### Cómo cargarla

1. **Tipo de inspección:** Ámbito (Obra, Fábrica u Oficina) y tipo: periódica por clase, inicio de hito crítico, apertura de obra o fuera de programa.
2. **Obra:** Obligatoria si el ámbito es Obra (arranca vacía cada vez). La app lee la Ficha de Riesgos: clase y riesgos. Inicio de hito crítico: elegí el hito que arrancó.
3. **Modalidad e inspector:** Presencial o remota. Remota solo si la obra está a más de 50 km y no es apertura ni inicio de hito crítico.
4. **Ítems generales y de riesgo:** 6 ítems generales siempre, más un bloque por cada riesgo de la Ficha APROBADA. Sin Ficha o en borrador: solo los 6 generales (Clase A).
5. **Cada «No»:** Gravedad (crítico, mayor o menor) y foto obligatorias. Comentario opcional.
6. **Toma de conocimiento:** Nombre y firma del capataz (o del Director de Obra si es remota). La firma no es veto: la inspección cuenta igual.
7. **Firma del inspector:** Obligatoria.

### Qué pasa después y cómo calcula

- Se crea la inspección en Odoo con número automático y un ítem por respuesta.
- Por cada «No» se crea un desvío (ver F07) con su plazo según la gravedad.
- Inicio de hito crítico: la inspección tiene que ser presencial dentro de las 72 h del inicio real del hito.

### Preguntas frecuentes

- **No veo los bloques de riesgo** La Ficha de esa obra no está aprobada (o no tiene riesgos). Pedile a HyS que la apruebe.
- **No tengo señal para leer la Ficha** Podés seguir solo con los 6 ítems generales, o «Reintentar».

## F03 · Recorrida semanal de Fábrica

**Para qué sirve.** La recorrida semanal de HyS por la Fábrica: 18 ítems en 6 bloques.

**Quién la carga y quién la ve.** La carga el inspector HyS. Toma conocimiento el Jefe de Producción (o su reemplazo). Valida la Dirección de Fábrica en Odoo.

### Cómo cargarla

1. **Inspector y tipo:** Venís preseleccionado. Tipo: recorrida semanal; si ya hay una esta semana, queda como «fuera de programa».
2. **Bloques de ítems:** Sí / No / N/A en cada ítem. Cada «No»: sector, gravedad y foto obligatorios.
3. **Toma de conocimiento:** Nombre (precargado, editable si firma un reemplazo) y firma. Observaciones opcionales.
4. **Firma del inspector:** Obligatoria.

### Qué pasa después y cómo calcula

- Se crea la inspección en Odoo (ámbito Fábrica). Por cada «No», un desvío (F07).
- Odoo pide la validación a la Dirección de Fábrica: tiene 24 h. Si vence o hay objeción, avisa al COO.
- Si una recorrida programada no se hizo, Odoo avisa al COO.

### Preguntas frecuentes

- **¿Puedo hacer dos en la semana?** Sí: la segunda se registra como «fuera de programa».

## F04 · Check mensual de instalaciones

**Para qué sirve.** El control mensual de las instalaciones de Fábrica u Oficina (los ítems salen del catálogo de Odoo).

**Quién la carga y quién la ve.** La carga el inspector HyS. Toma conocimiento el responsable del lugar. Valida en Odoo la Dirección de Fábrica (Fábrica) o el COO (Oficina).

### Cómo cargarla

1. **Lugar:** Fábrica u Oficina. Cambiar de lugar borra las respuestas (los ítems son otros).
2. **Inspector y tipo:** Check mensual; si ya hay uno este mes en ese lugar, queda como «fuera de programa».
3. **Bloques de ítems:** Sí / No / N/A. Cada «No»: gravedad y foto obligatorias.
4. **Toma de conocimiento y firma del inspector:** Nombre y firma del responsable del lugar; firma del inspector.

### Qué pasa después y cómo calcula

- Se crea la inspección en Odoo. Por cada «No», un desvío (F07).
- Validación en Odoo dentro de 24 h; si vence o hay objeción, avisa al COO.

### Preguntas frecuentes

- **La firma del responsable, ¿frena el check?** No, la firma no es veto: el check cuenta igual.

## F05 · Registro de accidente o incidente

**Para qué sirve.** Registrar todo accidente, incidente, casi-accidente o condición insegura, dentro de las 24 h.

**Quién la carga y quién la ve.** La puede cargar cualquiera que use la app (también encargados). En Odoo la ven solo HyS responsable, Jefe de Producción y COO (tiene datos de salud).

### Cómo cargarla

1. **Tipo de evento:** Accidente con baja, accidente sin baja, incidente (daño sin lesión), casi-accidente o condición insegura.
2. **Cuándo y dónde:** Fecha y hora (no futura) y lugar: obra (elegís la OT), sector de Fábrica u Oficina.
3. **Persona involucrada:** Empleado (de la lista), externo (nombre) o nadie.
4. **Lesión (solo accidentes):** Primero AVISÁ POR TELÉFONO a HyS. Parte lesionada, atención recibida, días de baja (si es con baja, 1 o más), «Sí, avisé», hora del aviso (no anterior al evento) y a quién avisaste.
5. **Qué pasó:** Relato obligatorio; testigos opcional.
6. **Foto y quién reporta:** Foto opcional; quién reporta, obligatorio.

### Qué pasa después y cómo calcula

- Se crea el evento en Odoo con número EV automático, en estado «Registrado».
- «Cargado en plazo» = se recibió dentro de las 24 h del evento.
- HyS recibe la tarea «Investigar evento»: causa inmediata, causa raíz y acción correctiva dentro de las 72 h.
- Estados: Registrado → En investigación → Investigado (los mueve HyS en Odoo).

### Preguntas frecuentes

- **Con lesión no me deja seguir** Hasta que no avisás por teléfono a HyS y lo marcás con la hora, no se puede enviar. Es a propósito.
- **Pasaron más de 24 h, ¿lo cargo igual?** Sí, siempre. Queda marcado como fuera de plazo.

## F06 · Carga de vencimiento legal

**Para qué sirve.** Cargar cada protocolo legal que llega (medición de puesta a tierra, ruido, etc.) para tener al día sus vencimientos.

**Quién la carga y quién la ve.** Solo HyS: carga y consulta («📅 Vencimientos legales» en el inicio). En Odoo › Fichas › F06.

### Cómo cargarla

1. **Control:** Elegí el control legal (⚠ = prioridad 1). Ves referencia, dónde y cada cuánto.
2. **Estado:** Vigente, Vencido o Sin protocolo.
3. **Fechas y proveedor:** Fecha de servicio, vencimiento y profesional. Si está VIGENTE: vencimiento obligatorio, posterior al servicio y posterior a hoy (si ya pasó, cargalo como Vencido).
4. **Protocolo:** PDF o foto. Obligatorio si está vigente.

### Qué pasa después y cómo calcula

- Se guarda la carga en Odoo y se actualiza el control legal (estado, fechas, proveedor y protocolo).
- Semáforo:
  - 🔴 Rojo: vencido, sin protocolo o sin fecha.
  - 🟡 Amarillo: vence en 30 días o menos.
  - 🟢 Verde: vence en más de 30 días.
- Alertas: todos los días a las 08:00 Odoo crea una tarea al responsable del control y a HyS cuando faltan 30, 15, 7 y 0 días. Si venció, pasa solo a «Vencido» y avisa.
- Cuenta en días corridos.

### Preguntas frecuentes

- **Llegó el protocolo nuevo, ¿qué hago?** Cargalo con F06 como Vigente con la nueva fecha: el semáforo y las alertas se reinician solos.

## F07 · Cierre de desvío

**Para qué sirve.** Cerrar un desvío (un «No» de una inspección o ATS) con la foto del arreglo.

**Quién la carga y quién la ve.** Solo HyS. Los desvíos se ven en Odoo › Fichas › F07 › Desvíos.

### Cómo cargarla

1. **Desvío:** Lista de pendientes (abiertos, en curso y vencidos), primero los que vencen antes. Ves gravedad, lugar y vencimiento.
2. **Qué se hizo:** Obligatorio.
3. **Foto de la corrección:** Obligatoria: sin foto, no está cerrado.
4. **Firma:** Opcional.

### Qué pasa después y cómo calcula

- Un desvío por cada «No» de F02, F03, F04 y F08 (se crea solo al enviar la ficha).
- Plazo según gravedad, contado desde la detección, en días CORRIDOS (fines de semana y feriados cuentan, sin excepciones):
  - Crítico: 24 horas · se detiene la tarea.
  - Mayor: 5 días · se corrige o se restringe.
  - Menor: 15 días · se registra y se programa.
- Al cerrar: estado «Cerrado» y «Cerrado en plazo» = Sí si se cerró antes del vencimiento.
- Todos los días a las 08:05, los vencidos sin cierre pasan a «Vencido» y se avisa al responsable (o a HyS).
- Estados: Abierto, En curso, Vencido, Cerrado, Anulado (anular solo en Odoo, con motivo).

### Preguntas frecuentes

- **El desvío venció, ¿lo puedo cerrar?** Sí, sigue en la lista; queda como cerrado fuera de plazo.

## F08 · ATS de turno sectorial

**Para qué sirve.** Análisis de trabajo seguro antes de cada turno (piloto: Depósito Central y Logística y Mantenimiento).

**Quién la carga y quién la ve.** Lo carga el encargado del sector (solo su sector) o HyS. Se ve en Odoo › Fichas › F08.

### Cómo cargarla

1. **Sector y turno:** Empresa, sector, fecha y turno. Un solo ATS por turno; si el anterior quedó «No autorizado», este lo reemplaza.
2. **Actividades y responsables:** Actividades del turno, encargado y quién autoriza (obligatorios).
3. **Controles previos:** 10 controles (★ = crítico). Cada «No»: gravedad, foto y medida. N/A con justificación (mín. 10 letras); los ★ no admiten N/A.
4. **Tareas fuera de rutina:** Si hay: al menos una tarea, con qué puede salir mal, cómo se evita y responsable.
5. **Dotación y resultado:** Dotación presente, charla previa y resultado: Autorizado, Autorizado tras corrección (decí qué se corrigió) o No autorizado.
6. **Firmas:** Encargado y quien autoriza (si autorizó por teléfono, se marca «a distancia»).

### Qué pasa después y cómo calcula

- Un control crítico en «No» no permite «Autorizado».
- Se crea el ATS en Odoo con número automático; se puede bajar el PDF desde «Envíos».
- Por cada «No» se crea un desvío (F07).
- Odoo avisa a HyS si quedó No autorizado, tiene un crítico en «No» o es idéntico al anterior.

### Preguntas frecuentes

- **¿Cuándo no se inicia el turno?** Ante fugas, cargas inestables, equipos dañados, resguardos ausentes, falta de aislamiento de energía, tránsito sin control, derrames o falta de controles críticos.

