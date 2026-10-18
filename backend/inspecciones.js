// POST /api/v1/inspecciones → create de x_hys_inspeccion (+ x_linea_ids) en Odoo con MIA.
// Idempotente por x_idempotency_key: si ya existe, devuelve el registro existente (200) sin duplicar.
import { validarYFiltrar } from "./validar.js";
import { ErrorOdoo } from "./odoo.js";
import { textoInspector } from "./catalogos.js";

const CAMPOS_MS = 10 * 60 * 1000;
const PRESENCIAL_OBLIGATORIA = ["apertura", "hito_critico"];

export class ErrorEntrada extends Error {
  constructor(estado, mensaje, extra = {}) { super(mensaje); this.estado = estado; this.extra = extra; }
}

export function crearInspecciones(cliente, catalogos) {
  let campos = null, camposHasta = 0;
  const enCurso = new Map(); // clave → promesa (dos envíos simultáneos con la misma clave = uno solo)

  async function leerCampos() {
    if (campos && Date.now() < camposHasta) return campos;
    const attrs = { attributes: ["type", "readonly", "required", "selection", "relation"] };
    const [inspeccion, linea] = await Promise.all([
      cliente().ejecutar("x_hys_inspeccion", "fields_get", [], attrs),
      cliente().ejecutar("x_hys_inspeccion_linea", "fields_get", [], attrs)]);
    campos = { inspeccion, linea };
    camposHasta = Date.now() + CAMPOS_MS;
    return campos;
  }

  async function buscarPorClave(clave) {
    const r = await cliente().ejecutar("x_hys_inspeccion", "search_read", [[["x_idempotency_key", "=", clave]]],
      { fields: ["id", "x_name"], limit: 1 });
    return r[0] || null;
  }

  // ---- Numeración INS-AAAA-NNNNN ----
  // · Máximo (no conteo) de los números del año que existen en Odoo, leyendo TODOS los nombres que
  //   contienen «INS-AAAA-» (también los de prueba con prefijo «PRUEBA - borrar (INS-…)» y archivados
  //   si algún día el modelo tiene active). Comparación numérica, no de texto.
  // · Nunca por debajo del último número que dio este proceso (por si Odoo tarda en mostrarlo).
  // · Asignación + create en serie dentro del proceso (una sola instancia en Render).
  // · Después del create se verifica que nadie más tenga ese número (otro proceso, prueba local,
  //   carga a mano); si choca, el registro más nuevo (id mayor) se renumera.
  // Los números de registros borrados pueden volver a usarse (solo se mira lo que existe).
  const ultimoDado = new Map(); // año → último número asignado por este proceso
  let cola = Promise.resolve();
  function enSerie(fn) {
    const p = cola.then(fn, fn);
    cola = p.catch(() => {});
    return p;
  }

  async function leerUsados(anio, numero = null) {
    const pref = `INS-${anio}-`;
    const r = await cliente().ejecutar("x_hys_inspeccion", "search_read", [[["x_name", "ilike", numero || pref]]],
      { fields: ["id", "x_name"], context: { active_test: false } });
    return (r || []).map((x) => ({ id: x.id, n: numeroDe(x.x_name, anio) })).filter((x) => x.n !== null);
  }

  async function siguienteNumero(anio) {
    const usados = await leerUsados(anio);
    const max = Math.max(0, ultimoDado.get(anio) || 0, ...usados.map((x) => x.n));
    return formatoNumero(anio, max + 1);
  }

  /** ¿Algún registro con id menor tiene el mismo número? (el de id menor se queda con él). */
  async function chocaCon(anio, numero, id) {
    const n = numeroDe(numero, anio);
    const iguales = (await leerUsados(anio, numero)).filter((x) => x.n === n);
    return iguales.some((x) => x.id < id);
  }

  const nombreCon = (numero) => {
    const prefijo = process.env.INSPECCION_PREFIJO_PRUEBA; // solo pruebas: «PRUEBA - borrar (INS-…)»
    return prefijo ? `${prefijo} (${numero})` : numero;
  };

  /** Crea con número único; devuelve {id, name}. Corre en serie. */
  function crearNumerado(vals, anio, clave) {
    return enSerie(async () => {
      let id = null;
      for (let intento = 0; intento < 5; intento++) {
        const numero = await siguienteNumero(anio);
        const nombre = nombreCon(numero);
        if (id === null) {
          vals.x_name = nombre;
          try {
            const r = await cliente().ejecutar("x_hys_inspeccion", "create", [[vals]]);
            id = Array.isArray(r) ? r[0] : r;
          } catch (e) {
            // ¿Otro envío con la misma clave entró justo antes? → devolver ese.
            const otro = await buscarPorClave(clave).catch(() => null);
            if (otro) return { id: otro.id, name: otro.x_name, repetido: true };
            if (e instanceof ErrorOdoo && /unique|duplicate|ya existe/i.test(e.detalle || "")) continue; // número tomado
            throw e;
          }
        } else {
          await cliente().ejecutar("x_hys_inspeccion", "write", [[id], { x_name: nombre }]);
        }
        if (!(await chocaCon(anio, numero, id))) {
          ultimoDado.set(anio, Math.max(ultimoDado.get(anio) || 0, numeroDe(numero, anio)));
          return { id, name: nombre };
        }
        // Choque: otro registro más viejo ya tiene este número → renumerar el nuestro.
      }
      throw new ErrorOdoo("No se pudo asignar un número de inspección único; reintentá en un momento");
    });
  }

  /** soloValidar (uso interno/pruebas, no expuesto por HTTP): arma los vals finales sin crear nada. */
  async function recibir(cuerpo, { claveCabecera, soloValidar = false } = {}) {
    const c = await leerCampos();
    const { errores, vals, descartados } = validarYFiltrar(cuerpo, c, { claveCabecera });
    if (errores.length) throw new ErrorEntrada(422, errores.map((e) => e.mensaje).join(" · "), { errores, descartados });
    const clave = vals.x_idempotency_key;
    if (!soloValidar && enCurso.has(clave)) return enCurso.get(clave);
    const p = (async () => {
      const ya = await buscarPorClave(clave);
      if (ya) return { estado: 200, cuerpo: respuesta(ya.id, ya.x_name, { repetido: true, descartados }) };

      // Inspector: de la lista propia de HyS (x_hys_inspector), activo. Se guarda el vínculo y una
      // copia en texto («Legajo N · Nombre»). x_inspector_id (empleado) ya no se completa.
      const inspector = await catalogos.buscarInspector(vals.x_inspector_hys_id);
      if (!inspector) throw new ErrorEntrada(422, "El inspector elegido no existe o está archivado en Odoo (HyS > Inspectores). Elegí otro.");
      if (c.inspeccion.x_inspector_texto) vals.x_inspector_texto = textoInspector(inspector);

      // Campos que pone el servidor (si existen en el modelo).
      const ci = c.inspeccion;
      const pon = (k, x) => { if (ci[k] && !ci[k].readonly && x !== undefined && x !== null && x !== false) vals[k] = x; };
      const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
      if (vals.x_origen === undefined) pon("x_origen", "formulario");
      if (vals.x_estado === undefined) pon("x_estado", "realizada");
      if (!vals.x_fecha_vencimiento) pon("x_fecha_vencimiento", vals.x_fecha_hora_control); // fuera de programa: vence al hacerse
      pon("x_fecha_recepcion", ahora);
      const ctx = cuerpo.contexto || {};
      if (ctx.modalidad && (ci.x_modalidad?.selection || []).some(([v]) => v === ctx.modalidad)) pon("x_modalidad", ctx.modalidad);
      if ((ci.x_clase_al_inspeccionar?.selection || []).some(([v]) => v === ctx.clase_al_inspeccionar)) pon("x_clase_al_inspeccionar", ctx.clase_al_inspeccionar);
      if (typeof ctx.clase_motivo === "string") pon("x_clase_motivo", ctx.clase_motivo.slice(0, 250));
      if (ci.x_presencial_obligatoria && !ci.x_presencial_obligatoria.readonly) vals.x_presencial_obligatoria = PRESENCIAL_OBLIGATORIA.includes(vals.x_tipo_programa);
      const cantNo = vals.x_linea_ids.filter(([, , l]) => l.x_respuesta === "no").length;
      if (ci.x_cant_no && !ci.x_cant_no.readonly) vals.x_cant_no = cantNo;
      // Secuencia de las líneas si no vino.
      vals.x_linea_ids.forEach(([, , l], i) => { if (c.linea.x_secuencia && l.x_secuencia === undefined) l.x_secuencia = i + 1; });

      if (soloValidar) return { estado: 200, cuerpo: { simulado: true, vals, descartados } };

      const anio = (vals.x_fecha_hora_control || ahora).slice(0, 4);
      const r = await crearNumerado(vals, anio, clave);
      return { estado: r.repetido ? 200 : 201, cuerpo: respuesta(r.id, r.name, { descartados, ...(r.repetido ? { repetido: true } : {}) }) };
    })().finally(() => enCurso.delete(clave));
    if (!soloValidar) enCurso.set(clave, p);
    return p;
  }

  return { recibir, leerCampos };
}

/** Número NNNNN de un nombre «…INS-AAAA-NNNNN…» (con o sin prefijo de prueba); null si no es de ese año. */
export function numeroDe(nombre, anio) {
  const m = String(nombre ?? "").match(new RegExp(`(?:^|[^A-Za-z0-9])INS-${anio}-(\\d+)(?!\\d)`, "i"));
  return m ? Number(m[1]) : null;
}
export const formatoNumero = (anio, n) => `INS-${anio}-${String(n).padStart(5, "0")}`;

const respuesta = (id, name, extra) => ({ odoo_model: "x_hys_inspeccion", odoo_id: id, id, name, ...extra });
