// HYS-F05 · Registro de accidente o incidente → x_hys_evento (diseño §2.11, §5.5 F05, Anexo B).
// Dentro de las 24 h; con lesión, aviso telefónico inmediato a HyS. La investigación
// (causa inmediata, causa raíz, acción correctiva en 72 h) la carga HyS en Odoo, no acá.
// Contiene datos de salud: en Odoo el acceso queda restringido a Gerencia de HyS y COO.

import { campoOpciones, campoSelect, campoTexto, campoArea, campoFoto, aviso } from "../componentes/campos.js";
import { selectorObra } from "../componentes/selector-obra.js";
import { SECTORES_FABRICA } from "../componentes/checklist.js";
import { camposControl, ahoraIso } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";
import { CONFIG } from "../api/config.js";

const TIPOS = [
  ["baja", "Accidente con baja", { clase: "rojo" }], ["sinbaja", "Accidente sin baja", { clase: "naranja" }],
  ["incidente", "Incidente (daño material, sin lesión)"], ["casi", "Casi-accidente (pudo pasar y no pasó)"],
  ["condicion", "Condición insegura"]
];
const LESIONES = [["manos", "Manos y dedos"], ["ojos", "Ojos"], ["cabeza", "Cabeza"], ["espalda", "Espalda"], ["pies", "Pies"], ["otra", "Otra"]];
const DONDE = [["obra", "Obra"], ["fabrica", "Fábrica"], ["oficina", "Oficina"]];
const esAccidente = (d) => d.tipo === "baja" || d.tipo === "sinbaja";
const etiqueta = (lista, v) => lista.find(([x]) => x === v)?.[1] || "";

export default {
  codigo: "F05",
  titulo: "Registro de accidente o incidente",
  async preparar(ctx) {
    ctx.empleados = await leerRegistros("hr.employee", [], ["name", "job_title"]);
  },
  inicial: (ctx) => ({ fecha_hora: ahoraIso().slice(0, 16), reportado_por: ctx.sesion.usuario?.nombre || "", persona_tipo: "empleado" }),
  pasos: [
    {
      titulo: "Tipo de evento",
      dibujar: (d, ctx) => campoOpciones(d, "tipo", "¿Qué pasó?", TIPOS, { requerido: true, alCambiar: () => ctx.refrescar() }),
      validar: (d) => (!d.tipo ? "Elegí el tipo de evento." : null)
    },
    {
      titulo: "Cuándo y dónde",
      dibujar: (d, ctx) => [
        campoTexto(d, "fecha_hora", "Fecha y hora del evento", { tipo: "datetime-local", requerido: true, max: ahoraIso().slice(0, 16) }),
        campoOpciones(d, "ambito", "Dónde", DONDE, { columnas: 3, requerido: true, alCambiar: () => ctx.refrescar() }),
        d.ambito === "obra" && selectorObra(d, "obra"),
        d.ambito === "fabrica" && campoSelect(d, "sector", "Sector de Fábrica", SECTORES_FABRICA, { requerido: true })],
      validar: (d) => !d.fecha_hora ? "Cargá la fecha y hora." : d.fecha_hora > ahoraIso().slice(0, 16) ? "La fecha no puede ser futura." :
        !d.ambito ? "Elegí dónde pasó." : d.ambito === "obra" && !d.obra ? "Elegí la obra." : d.ambito === "fabrica" && !d.sector ? "Elegí el sector." : null
    },
    {
      titulo: "Persona involucrada",
      dibujar: (d, ctx) => [
        campoOpciones(d, "persona_tipo", "¿Es empleado?", [["empleado", "Empleado"], ["externo", "Externo / tercero"], ["nadie", "Nadie"]], { columnas: 3, alCambiar: () => ctx.refrescar() }),
        d.persona_tipo === "empleado" && campoSelect(d, "persona_id", "Persona", ctx.empleados.map((e) => [e.id, e.name])),
        d.persona_tipo === "externo" && campoTexto(d, "persona_externa", "Nombre (subcontratista, tercero)")]
    },
    {
      titulo: "Lesión",
      visible: esAccidente,
      dibujar: (d) => [
        aviso("Con lesión: avisá YA por teléfono a HyS.", "error"),
        campoOpciones(d, "lesion_parte", "Parte lesionada", LESIONES, { columnas: 2, requerido: true }),
        campoArea(d, "atencion", "Atención recibida", { requerido: true, filas: 2 }),
        d.tipo === "baja" && campoTexto(d, "dias_baja", "Días de baja estimados", { tipo: "number", min: 1, requerido: true }),
        campoOpciones(d, "aviso_telefonico", "¿Se avisó por teléfono a HyS?", [[true, "Sí, avisé"], [false, "Todavía no"]], { columnas: 2, requerido: d.tipo === "baja" })],
      validar: (d) => !d.lesion_parte ? "Elegí la parte lesionada." : !d.atencion?.trim() ? "Contá qué atención recibió." :
        d.tipo === "baja" && !(d.dias_baja >= 1) ? "Los días de baja tienen que ser 1 o más." :
          d.tipo === "baja" && d.aviso_telefonico !== true ? "Con baja, primero avisá por teléfono a HyS y marcalo." : null
    },
    {
      titulo: "Qué pasó",
      dibujar: (d) => [campoArea(d, "que_paso", "Qué pasó", { requerido: true, filas: 4 }), campoArea(d, "testigos", "Testigos (opcional)", { filas: 2 })],
      validar: (d) => (!d.que_paso?.trim() ? "Contá qué pasó." : null)
    },
    {
      titulo: "Foto y quién reporta",
      dibujar: (d) => [campoFoto(d, "foto", "Foto (opcional)"), campoTexto(d, "reportado_por", "Quién lo reporta", { requerido: true })],
      validar: (d) => (!d.reportado_por?.trim() ? "Falta quién lo reporta." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Tipo", etiqueta(TIPOS, d.tipo)],
    ["Fecha y hora", d.fecha_hora?.replace("T", " ")],
    ["Dónde", d.ambito === "obra" ? d.obra?.name : d.ambito === "fabrica" ? `Fábrica · ${etiqueta(SECTORES_FABRICA, d.sector)}` : "Oficina"],
    ["Persona", d.persona_tipo === "empleado" ? ctx.empleados.find((e) => e.id === d.persona_id)?.name : d.persona_externa],
    ...(esAccidente(d) ? [["Lesión", `${etiqueta(LESIONES, d.lesion_parte)}${d.tipo === "baja" ? ` · ${d.dias_baja} días de baja` : ""}`]] : []),
    ["Qué pasó", d.que_paso],
    ["Foto", d.foto ? "Sí" : "No"],
    ["Reporta", d.reportado_por]],
  armar: (d, auto) => ({
    operacion: "crear",
    modelo: "x_hys_evento",
    valores: {
      x_tipo: d.tipo,
      x_fecha_hora: `${d.fecha_hora}:00${CONFIG.ZONA_HORARIA}`,
      x_ambito: d.ambito,
      x_ot_id: d.ambito === "obra" ? d.obra.id : false,
      x_sector: d.ambito === "fabrica" ? d.sector : false,
      x_persona_id: d.persona_tipo === "empleado" ? d.persona_id || false : false,
      x_persona_externa: d.persona_tipo === "externo" ? d.persona_externa || false : false,
      x_lesion_parte: esAccidente(d) ? d.lesion_parte : false,
      x_atencion: esAccidente(d) ? d.atencion : false,
      x_dias_baja: d.tipo === "baja" ? Number(d.dias_baja) : false,
      x_aviso_telefonico: d.aviso_telefonico === true,
      x_que_paso: d.que_paso,
      x_testigos: d.testigos || false,
      x_foto: d.foto || false,
      x_reportado_por: d.reportado_por,
      x_estado: "registrado",
      ...camposControl(auto)
    }
  })
};
