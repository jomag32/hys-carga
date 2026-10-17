// HYS-F07 · Cierre de desvío → write sobre x_hys_desvio (diseño §2.10, §3.6, §5.5 F07, Anexo B).
// «Sin foto, no está cerrado»: la foto de la corrección es obligatoria (y Odoo lo vuelve a
// bloquear con R-CIE-1). Si el cierre llegó en plazo lo calcula Odoo.
// Esqueleto: lista todos los desvíos abiertos; en producción el backend devuelve solo los del
// responsable (o todos para Gerencia de HyS).

import { h, nombreM2o } from "../componentes/util.js";
import { campoArea, campoFoto, aviso } from "../componentes/campos.js";
import { camposControl } from "../componentes/campos-auto.js";
import { leerRegistros } from "../api/odoo.js";
import { listarCola } from "../api/cola.js";

const GRAV = { critico: "Crítico", mayor: "Mayor", menor: "Menor" };
const lugar = (dv) => (dv.x_ot_id ? nombreM2o(dv.x_ot_id) : ({ fabrica: "Fábrica", oficina: "Oficina", deposito: "Depósito Central", logistica: "Logística y Mant." }[dv.x_ambito] || dv.x_ambito));

export default {
  codigo: "F07",
  titulo: "Cierre de desvío",
  async preparar(ctx) {
    // Los que ya tienen un cierre esperando en la cola no se ofrecen de nuevo.
    const enCola = new Set(listarCola().filter((e) => e.formulario === "F07" && e.estado === "pendiente").flatMap((e) => e.ids));
    ctx.desvios = (await leerRegistros("x_hys_desvio", [["x_estado", "=", "abierto"]],
      ["x_name", "x_descripcion", "x_criticidad", "x_ot_id", "x_ambito", "x_fecha_deteccion", "x_responsable_id"]))
      .filter((dv) => !enCola.has(dv.id));
  },
  pasos: [
    {
      titulo: "Desvío",
      dibujar: (d, ctx) => !ctx.desvios.length ? aviso("No hay desvíos abiertos.", "info") :
        h("div", { class: "lista-botones" }, ctx.desvios.map((dv) => h("button", {
          type: "button", class: `btn-lista ${d.desvio_id === dv.id ? "elegida" : ""}`,
          onclick: () => { d.desvio_id = dv.id; ctx.refrescar(); }
        }, h("b", {}, `${dv.x_name} · ${GRAV[dv.x_criticidad]}`), h("br"), dv.x_descripcion, h("br"), h("small", {}, lugar(dv))))),
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
    return [["Desvío", dv ? `${dv.x_name} · ${dv.x_descripcion}` : ""], ["Lugar", dv ? lugar(dv) : ""], ["Qué se hizo", d.que_se_hizo], ["Foto", d.foto_cierre ? "Sí" : "No"]];
  },
  armar: (d, auto) => {
    // El desvío ya tiene sus datos de creación: los campos de control del CIERRE van con
    // prefijo x_cierre_ (x_cierre_idempotency_key está en el diseño; x_cierre_gps_*,
    // x_cierre_cargado_por_* son nuevos). La fecha y hora del control es x_fecha_cierre.
    const control = Object.fromEntries(Object.entries(camposControl(auto))
      .filter(([k]) => k !== "x_fecha_hora_control")
      .map(([k, v]) => [k.replace(/^x_/, "x_cierre_"), v]));
    return {
      operacion: "escribir",
      modelo: "x_hys_desvio",
      ids: [d.desvio_id],
      valores: {
        x_estado: "cerrado", x_que_se_hizo: d.que_se_hizo, x_foto_cierre: d.foto_cierre,
        x_fecha_cierre: auto.fecha_hora_control,
        ...control
      }
    };
  }
};
