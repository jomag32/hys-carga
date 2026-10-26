// HYS-F07 · Cierre de desvío → write sobre x_hys_desvio (diseño §2.10, §3.6, §5.5 F07, Anexo B).
// «Sin foto, no está cerrado»: la foto de la corrección es obligatoria (y Odoo lo vuelve a
// bloquear con R-CIE-1). Si el cierre llegó en plazo lo calcula Odoo.
// Envío real (2026-10-25.7): GET /api/v1/desvios (abiertos) y POST /api/v1/desvios/:id/cierre (solo HyS),
// con la cola sin conexión como los demás formularios.

import { h } from "../componentes/util.js";
import { campoArea, campoFoto, aviso } from "../componentes/campos.js";
import { leerDesvios } from "../api/odoo.js";
import { leerSesion } from "../componentes/sesion.js";
import { listarCola } from "../api/cola.js";

const GRAV = { critico: "Crítico", mayor: "Mayor", menor: "Menor" };
const lugar = (dv) => (dv.ot ? dv.ot.nombre : ({ fabrica: "Fábrica", oficina: "Oficina", deposito: "Depósito Central", logistica: "Logística y Mant.", obra: "Obra" }[dv.ambito] || dv.ambito || ""));
const vence = (dv) => (dv.vence ? new Date(dv.vence.replace(" ", "T") + "Z").toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");

export default {
  codigo: "F07",
  titulo: "Cierre de desvío",
  async preparar(ctx) {
    // Los que ya tienen un cierre esperando en la cola no se ofrecen de nuevo.
    const enCola = new Set(listarCola().filter((e) => e.formulario === "F07" && e.estado === "pendiente").flatMap((e) => e.ids));
    ctx.desvios = ((await leerDesvios()).desvios || []).filter((dv) => !enCola.has(dv.id));
  },
  pasos: [
    {
      titulo: "Desvío",
      dibujar: (d, ctx) => !ctx.desvios.length ? aviso("No hay desvíos abiertos.", "info") :
        h("div", { class: "lista-botones" }, ctx.desvios.map((dv) => h("button", {
          type: "button", class: `btn-lista ${d.desvio_id === dv.id ? "elegida" : ""}`,
          onclick: () => { d.desvio_id = dv.id; ctx.refrescar(); }
        }, h("b", {}, `${dv.nombre} · ${GRAV[dv.gravedad] || dv.gravedad}`), h("br"), dv.descripcion, h("br"),
          h("small", {}, `${lugar(dv)} · vence ${vence(dv)}${dv.vencido ? " · VENCIDO" : ""}`)))),
      validar: (d) => (!d.desvio_id ? "Elegí el desvío que arreglaste." : null)
    },
    {
      titulo: "Qué se hizo",
      dibujar: (d) => campoArea(d, "que_se_hizo", "Qué se hizo", { requerido: true, filas: 4 }),
      validar: (d) => (!d.que_se_hizo?.trim() ? "Contá qué se hizo." : null)
    },
    {
      titulo: "Foto de la corrección",
      dibujar: (d) => [campoFoto(d, "foto_cierre", "Foto de la corrección", { requerido: true }), aviso("Sin foto, no está cerrado.", "alerta")],
      validar: (d) => (!d.foto_cierre ? "Sin foto del arreglo, el desvío no está cerrado." : null)
    }
  ],
  resumen: (d, ctx) => {
    const dv = ctx.desvios.find((x) => x.id === d.desvio_id);
    return [["Desvío", dv ? `${dv.nombre} · ${dv.descripcion}` : ""], ["Vence", dv ? vence(dv) : ""], ["Lugar", dv ? lugar(dv) : ""], ["Qué se hizo", d.que_se_hizo], ["Foto", d.foto_cierre ? "Sí" : "No"]];
  },
  // Envío real: POST /api/v1/desvios/:id/cierre (el backend escribe x_hys_desvio con MIA).
  armar: (d, auto) => {
    const yo = leerSesion().usuario;
    const g = auto.gps || {};
    return {
      operacion: "enviar", endpoint: `/desvios/${Number(d.desvio_id)}/cierre`, ids: [d.desvio_id],
      auth: { inspector_id: yo?.id ?? null, token: yo?.token || null },
      cuerpo: { formulario: "F07", idempotency_key: auto.idempotency_key, odoo: { model: "x_hys_desvio", method: "write" },
        que_se_hizo: d.que_se_hizo, foto_cierre: d.foto_cierre,
        control: { fecha_hora_control: auto.fecha_hora_control, gps_lat: g.lat ?? null, gps_lon: g.lon ?? null, gps_precision_m: g.precision ?? null,
          gps_fecha: g.fecha || null, gps_estado: g.estado || "no_disponible" } }
    };
  }
};
