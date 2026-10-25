// HYS-F06 · Carga de vencimiento legal → x_hys_vencimiento_carga (diseño §2.12, §5.5 F06, Anexo B).
// La carga la Gerencia de HyS al recibir cada protocolo. El estado vigente de los 9 controles
// (x_hys_control_legal) lo actualiza Odoo/backend a partir de esta carga.

import { campoOpciones, campoSelect, campoTexto, campoFoto, aviso } from "../componentes/campos.js";
import { hoyIso } from "../componentes/campos-auto.js";
import { leerVencimientos } from "../api/odoo.js";
import { leerSesion } from "../componentes/sesion.js";

const ESTADOS = [["vigente", "Vigente", { clase: "verde" }], ["vencido", "Vencido", { clase: "rojo" }], ["sin_protocolo", "Sin protocolo"]];
const PERIODICIDAD = { anual: "Anual", "5_anios": "Cada 5 años", segun_norma: "Según norma" };

export default {
  codigo: "F06",
  titulo: "Carga de vencimiento legal",
  async preparar(ctx) {
    // Mismo listado que #/vencimientos (backend). Se adapta a los nombres x_ que usa esta vista.
    ctx.controles = ((await leerVencimientos()).controles || []).map((c) => ({ id: c.id, x_name: c.nombre, x_referencia: c.referencia,
      x_donde: c.donde, x_periodicidad: c.periodicidad, x_prioridad: c.prioridad }));
  },
  pasos: [
    {
      titulo: "Control",
      dibujar: (d, ctx) => {
        const c = ctx.controles.find((x) => x.id === d.control_id);
        if (!ctx.controles.length) return aviso("Todavía no hay controles legales cargados en Odoo (Vencimientos legales › Controles legales). Pedile a HyS que los dé de alta.", "alerta");
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
        aviso("PDF o foto. Si pesa mucho, sacá una foto en vez de escanear.", "info")],
      validar: (d) => (d.estado === "vigente" && !d.protocolo ? "Si está vigente, el protocolo es obligatorio." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Control", ctx.controles.find((x) => x.id === d.control_id)?.x_name],
    ["Estado", ESTADOS.find(([v]) => v === d.estado)?.[1]],
    ["Servicio", d.fecha_servicio], ["Vence", d.fecha_vence], ["Proveedor", d.proveedor],
    ["Protocolo", d.protocolo ? d.protocolo_nombre || "Adjunto" : "No"]],
  // Envío real: POST /api/v1/vencimientos (solo inspectores HyS; el backend actualiza el control legal).
  armar: (d, auto) => {
    const yo = leerSesion().usuario;
    const g = auto.gps || {};
    return {
      operacion: "enviar", endpoint: "/vencimientos",
      auth: { inspector_id: yo?.id ?? null, token: yo?.token || null },
      cuerpo: { formulario: "F06", idempotency_key: auto.idempotency_key, odoo: { model: "x_hys_vencimiento_carga", method: "create" },
        datos: { control_id: Number(d.control_id), estado: d.estado, fecha_servicio: d.fecha_servicio || null, fecha_vence: d.fecha_vence || null,
          proveedor: d.proveedor || null, protocolo: d.protocolo || null, protocolo_nombre: d.protocolo_nombre || null },
        control: { fecha_hora_control: auto.fecha_hora_control, gps_lat: g.lat ?? null, gps_lon: g.lon ?? null, gps_precision_m: g.precision ?? null,
          gps_fecha: g.fecha || null, gps_estado: g.estado || "no_disponible" } }
    };
  }
};
