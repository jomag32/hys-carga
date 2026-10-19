// HYS-F01 · Ficha de Riesgos de Obra → x_hys_ficha + x_hys_ficha_hito (diseño §2.5 y Anexo B).
// Desde el 18/10/2026 22:12 (decisión de Jorge) llega a Odoo de verdad: POST /api/v1/fichas del backend,
// con la cola sin conexión y reintentos igual que F02. Se crea SIEMPRE en BORRADOR: la app no aprueba;
// la aprobación la hace HyS en Odoo. Una sola Ficha activa por OT (el backend responde 409 si ya hay).
// Obras: NO INICIADAS, EN PROGRESO o PAUSADO (la Ficha se carga al crear la OT, antes de arrancar).
// Clase de riesgo, frecuencia, modalidad y número FR los calcula Odoo (§3.1): acá no se eligen.

import { h, nombreM2o } from "../componentes/util.js";
import { campoTexto, campoArea, campoOpciones, campoCasillas, aviso } from "../componentes/campos.js";
import { selectorObra } from "../componentes/selector-obra.js";
import { camposControl, obraCorta } from "../componentes/campos-auto.js";
import { leerRiesgosF01, leerFichasF01, aFormatoOdoo } from "../api/odoo.js";
import { leerSesion } from "../componentes/sesion.js";

const fichaDe = (d, ctx) => (ctx.fichas || []).find((f) => f.ot === d.obra?.id);
const PREDIOS = [["terreno_cliente", "Terreno del cliente"], ["planta_terceros", "Planta de terceros"], ["via_publica", "Vía pública"]];
// Obra de la sesión (la elegida al ingresar). «Planta» no es una OT: ahí se sigue pidiendo la obra.
const obraSesion = (ctx) => (ctx.sesion?.obra && ctx.sesion.obra.id !== "planta" ? ctx.sesion.obra : null);
// El paso «Obra» se saltea si la obra ya viene de la sesión, salvo que se toque «Cambiar» o que esa OT
// ya tenga Ficha (ahí se muestra el selector con el aviso y no deja seguir).
const pasoObraVisible = (d, ctx) => !d.obra || !!d.cambiar_obra || !!fichaDe(d, ctx);
const textoFicha = (f) => `${f.nombre || `id ${f.id}`}${f.estado ? `, ${f.estado}` : ""}`;

function campoHitos(d, ctx, refrescar) {
  d.hitos = d.hitos || [];
  const elegidos = ctx.riesgos.filter((r) => d.riesgo_ids.includes(r.id));
  return [
    ...d.hitos.map((hh, i) => h("div", { class: "item hito-f01" },
      h("p", { class: "item-texto" }, `Hito ${i + 1}`),
      campoTexto(hh, "nombre", "Nombre del hito", { requerido: true, autocomplete: "off" }),
      campoTexto(hh, "inicio", "Inicio previsto", { tipo: "date" }),
      elegidos.length ? campoCasillas(hh, "riesgo_ids", "Riesgos de este hito", elegidos.map((r) => [r.id, r.nombre, r.gravedad === "critico" ? "· Crítico" : "· Medio"])) : "",
      h("button", { type: "button", class: "btn chico", onclick: () => { d.hitos.splice(i, 1); refrescar(); } }, "Quitar hito"))),
    h("button", { type: "button", class: "btn secundario", id: "btn-agregar-hito", onclick: () => { d.hitos.push({ nombre: "", inicio: "", riesgo_ids: [] }); refrescar(); } }, "+ Agregar hito"),
    aviso("Opcional: los hitos del Gantt (montaje, hormigonado, zinguería…). Odoo los usa para la clase de riesgo y las inspecciones de inicio de hito crítico. Se pueden completar después en Odoo.", "info")];
}

export default {
  codigo: "F01",
  titulo: "Ficha de Riesgos de Obra",
  async preparar(ctx) {
    [ctx.riesgos, ctx.fichas] = await Promise.all([leerRiesgosF01(), leerFichasF01()]);
  },
  inicial: (ctx) => ({ riesgo_ids: [], hitos: [], ...(obraSesion(ctx) ? { obra: obraSesion(ctx) } : {}) }),
  // Borrador viejo: sin obra → la de la sesión; riesgos que ya no existen (ids de ejemplo) se quitan.
  retomar: (d, ctx) => {
    if (!d.obra && obraSesion(ctx)) d.obra = obraSesion(ctx);
    const ok = new Set(ctx.riesgos.map((r) => r.id));
    d.riesgo_ids = (d.riesgo_ids || []).filter((id) => ok.has(id));
    d.hitos = (d.hitos || []).map((hh) => ({ ...hh, riesgo_ids: (hh.riesgo_ids || []).filter((id) => ok.has(id)) }));
    delete d.aprobar; delete d.firma;
  },
  // Encabezado compacto «Obra: X · Cambiar» cuando el paso «Obra» está salteado.
  cabecera: (d, ctx) => (pasoObraVisible(d, ctx) ? null : h("div", { class: "aviso info cabecera-obra", id: "cabecera-obra" },
    h("span", {}, "Obra: ", h("b", {}, d.obra.name)), " · ",
    h("button", { type: "button", class: "btn chico", id: "btn-cambiar-obra", onclick: () => { d.cambiar_obra = true; ctx.irA(0); } }, "Cambiar"))),
  pasos: [
    {
      titulo: "Obra",
      visible: pasoObraVisible,
      dibujar: (d, ctx) => [selectorObra(d, "obra", { para: "f01", etiqueta: "Obra (OT) · no iniciadas, en curso o pausadas", alCambiar: () => { d.cambiar_obra = true; ctx.refrescar(); } }),
        fichaDe(d, ctx) ? aviso(`Esta OT ya tiene Ficha (${textoFicha(fichaDe(d, ctx))}). Una sola Ficha por OT: los cambios se hacen en Odoo.`, "alerta")
          : aviso("Cliente y Director de Obra vienen solos desde la OT.", "info")],
      validar: (d, ctx) => (!d.obra ? "Elegí la obra." : fichaDe(d, ctx) ? "Esta OT ya tiene Ficha de Riesgos." : null)
    },
    {
      titulo: "Lugar",
      dibujar: (d) => [
        campoTexto(d, "distancia_km", "Distancia a Posadas (km)", { tipo: "number", min: 0, requerido: true, ayuda: "Más de 50 km: alterna inspección presencial y remota." }),
        campoOpciones(d, "tipo_predio", "Tipo de predio", PREDIOS, { requerido: true }),
        aviso("La ubicación (GPS) se toma sola al abrir el formulario.", "info")],
      validar: (d) => (d.distancia_km === "" || d.distancia_km == null ? "Cargá la distancia." : Number(d.distancia_km) < 0 ? "La distancia no puede ser negativa." : !d.tipo_predio ? "Elegí el tipo de predio." : null)
    },
    {
      titulo: "Riesgos aplicables",
      dibujar: (d, ctx) => [
        campoCasillas(d, "riesgo_ids", "Marcá los riesgos de esta obra", ctx.riesgos.map((r) => [r.id, r.nombre, r.gravedad === "critico" ? "· Crítico" : "· Medio"]), { requerido: true }),
        aviso("La clase de riesgo (A/B/C) la calcula Odoo con estos riesgos y los hitos.", "info")],
      validar: (d) => (!d.riesgo_ids.length ? "Marcá al menos un riesgo." : null)
    },
    {
      titulo: "Hitos",
      dibujar: (d, ctx) => campoHitos(d, ctx, () => ctx.refrescar()),
      validar: (d) => ((d.hitos || []).some((hh) => !String(hh.nombre || "").trim()) ? "A un hito le falta el nombre (o quitalo)." : null)
    },
    {
      titulo: "Controles y documentación",
      dibujar: (d) => [
        campoArea(d, "epp", "EPP y controles específicos"),
        campoArea(d, "doc_cliente", "Documentación que exige el cliente")]
    },
    {
      titulo: "Centro de salud",
      dibujar: (d) => [campoArea(d, "centro_salud", "Centro de salud más cercano y teléfonos", { requerido: true }),
        aviso("La Ficha se guarda en Odoo como BORRADOR. La aprueba HyS en Odoo.", "info")],
      validar: (d) => (!d.centro_salud?.trim() ? "El centro de salud es obligatorio." : null)
    }
  ],
  resumen: (d, ctx) => [
    ["Obra", d.obra?.name],
    ["Cliente", nombreM2o(d.obra?.partner_id)],
    ["Distancia", `${d.distancia_km} km`],
    ["Predio", PREDIOS.find(([v]) => v === d.tipo_predio)?.[1]],
    ["Riesgos", ctx.riesgos.filter((r) => d.riesgo_ids.includes(r.id)).map((r) => r.nombre).join(", ")],
    ["Hitos", (d.hitos || []).length ? d.hitos.map((hh) => hh.nombre + (hh.inicio ? ` (${hh.inicio})` : "")).join(", ") : "—"],
    ["Centro de salud", d.centro_salud],
    ["Estado en Odoo", "Borrador (la aprueba HyS)"]
  ],
  armar: (d, auto) => {
    const vals = aFormatoOdoo({
      x_ot_id: d.obra.id,
      x_distancia_km: Number(d.distancia_km),
      x_tipo_predio: d.tipo_predio,
      x_riesgo_ids: [[6, 0, d.riesgo_ids]],
      x_epp_controles: d.epp?.trim() || false,
      x_doc_cliente: d.doc_cliente?.trim() || false,
      x_centro_salud: d.centro_salud.trim(),
      ...camposControl(auto), // GPS (+ clave y fecha, que el backend descarta si el modelo no los tiene)
      x_hito_ids: (d.hitos || []).map((hh) => [0, 0, { x_name: hh.nombre.trim(), x_inicio_previsto: hh.inicio || false, x_riesgo_ids: [[6, 0, hh.riesgo_ids || []]] }])
    });
    const yo = leerSesion().usuario;
    return {
      operacion: "enviar",
      endpoint: "/fichas",
      auth: { inspector_id: yo?.id ?? null, token: yo?.token || null }, // el backend saca «quién carga» del token
      cuerpo: {
        formulario: "F01",
        idempotency_key: auto.idempotency_key,
        odoo: { model: "x_hys_ficha", method: "create", vals },
        contexto: { obra: d.obra.name, lugar: obraCorta(leerSesion().obra), app: "hys-carga web" }
      }
    };
  }
};
