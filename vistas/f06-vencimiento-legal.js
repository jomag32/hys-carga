// HYS-F06 · Carga de vencimiento legal → x_hys_vencimiento_carga (diseño §2.12, §5.5 F06, Anexo B).
// La carga la Gerencia de HyS al recibir cada protocolo. El estado vigente de los 9 controles
// (x_hys_control_legal) lo actualiza Odoo/backend a partir de esta carga.

import { campoOpciones, campoSelect, campoTexto, campoFoto, aviso } from "../componentes/campos.js";
import { camposControl, hoyIso } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";

const ESTADOS = [["vigente", "Vigente", { clase: "verde" }], ["vencido", "Vencido", { clase: "rojo" }], ["sin_protocolo", "Sin protocolo"]];
const PERIODICIDAD = { anual: "Anual", "5_anios": "Cada 5 años", segun_norma: "Según norma" };

export default {
  codigo: "F06",
  titulo: "Carga de vencimiento legal",
  async preparar(ctx) {
    ctx.controles = await leerRegistros("x_hys_control_legal", [], ["x_name", "x_referencia", "x_donde", "x_periodicidad", "x_prioridad"]);
  },
  pasos: [
    {
      titulo: "Control",
      dibujar: (d, ctx) => {
        const c = ctx.controles.find((x) => x.id === d.control_id);
        return [campoSelect(d, "control_id", "Control legal", ctx.controles.map((x) => [x.id, `${x.x_prioridad === "1" ? "⚠ " : ""}${x.x_name}`]), { requerido: true, alCambiar: () => ctx.refrescar() }),
          c && aviso(`${c.x_referencia} · ${c.x_donde} · ${PERIODICIDAD[c.x_periodicidad]} · Prioridad ${c.x_prioridad}`, "info")];
      },
      validar: (d) => (!d.control_id ? "Elegí el control." : null)
    },
    {
      titulo: "Estado",
      dibujar: (d) => campoOpciones(d, "estado", "Estado", ESTADOS, { columnas: 3, requerido: true }),
      validar: (d) => (!d.estado ? "Elegí el estado." : null)
    },
    {
      titulo: "Fechas y proveedor",
      dibujar: (d) => [
        campoTexto(d, "fecha_servicio", "Fecha de medición o servicio", { tipo: "date" }),
        campoTexto(d, "fecha_vence", "Vence", { tipo: "date", requerido: d.estado === "vigente" }),
        campoTexto(d, "proveedor", "Profesional o proveedor")],
      validar: (d) => {
        if (d.estado !== "vigente") return null;
        if (!d.fecha_vence) return "Si está vigente, la fecha de vencimiento es obligatoria.";
        if (d.fecha_servicio && d.fecha_vence <= d.fecha_servicio) return "El vencimiento tiene que ser posterior a la fecha de servicio.";
        if (d.fecha_vence <= hoyIso()) return "Esa fecha ya pasó: cargalo como «Vencido».";
        return null;
      }
    },
    {
      titulo: "Protocolo",
      dibujar: (d) => [campoFoto(d, "protocolo", "Protocolo (PDF o foto)", { aceptar: "application/pdf,image/*", requerido: d.estado === "vigente" }),
        aviso("Máximo 2 MB por archivo en este esqueleto.", "info")],
      validar: (d) => (d.estado === "vigente" && !d.protocolo ? "Si está vigente, el protocolo es obligatorio." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Control", ctx.controles.find((x) => x.id === d.control_id)?.x_name],
    ["Estado", ESTADOS.find(([v]) => v === d.estado)?.[1]],
    ["Servicio", d.fecha_servicio], ["Vence", d.fecha_vence], ["Proveedor", d.proveedor],
    ["Protocolo", d.protocolo ? d.protocolo_nombre || "Adjunto" : "No"]],
  armar: (d, auto) => ({
    operacion: "crear",
    modelo: "x_hys_vencimiento_carga",
    valores: {
      x_control_id: d.control_id, x_estado: d.estado,
      x_fecha_servicio: d.fecha_servicio || false, x_fecha_vence: d.fecha_vence || false,
      x_proveedor: d.proveedor || false, x_protocolo: d.protocolo || false, x_protocolo_nombre: d.protocolo_nombre || false,
      ...camposControl(auto)
    }
  })
};
