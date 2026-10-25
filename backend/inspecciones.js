// POST /api/v1/inspecciones → create de x_hys_inspeccion (+ x_linea_ids) en Odoo con MIA.
// Idempotente por x_idempotency_key: si ya existe, devuelve el registro existente (200) sin duplicar.
import { validarYFiltrar } from "./validar.js";
import { ErrorOdoo } from "./odoo.js";
import { textoInspector } from "./catalogos.js";
import { crearPlanta, reglasDe, periodoDe } from "./planta.js";

const CAMPOS_MS = 10 * 60 * 1000;
const PRESENCIAL_OBLIGATORIA = ["apertura", "hito_critico"];

/** Los encargados de sector (x_rol «encargado») solo cargan el ATS de turno. */
export const SOLO_F08 = "Los encargados de sector solo pueden cargar el ATS de turno (F08).";

export class ErrorEntrada extends Error {
  constructor(estado, mensaje, extra = {}) { super(mensaje); this.estado = estado; this.extra = extra; }
}

export function crearInspecciones(cliente, catalogos, { planta = crearPlanta(cliente) } = {}) {
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
  const crearNumerado = (vals, anio, clave) => enSerie(() => crearNumeradoYa(vals, anio, clave));
  /** Igual, pero ya dentro de enSerie. idExistente: completa ese registro (programada) en vez de crear. */
  async function crearNumeradoYa(vals, anio, clave, idExistente = null) {
    {
      let id = null;
      if (idExistente) {
        // Programada de la semana/mes: se completa con un solo write (datos + líneas + número).
        const numero = await siguienteNumero(anio);
        await cliente().ejecutar("x_hys_inspeccion", "write", [[idExistente], { ...vals, x_name: nombreCon(numero) }]);
        id = idExistente;
        if (!(await chocaCon(anio, numero, id))) {
          ultimoDado.set(anio, Math.max(ultimoDado.get(anio) || 0, numeroDe(numero, anio)));
          return { id, name: nombreCon(numero) };
        }
      }
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
    }
  }

  /** soloValidar (uso interno/pruebas, no expuesto por HTTP): arma los vals finales sin crear nada. */
  async function recibir(cuerpo, { claveCabecera, soloValidar = false, sesion = null } = {}) {
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
      if (inspector.x_rol === "encargado") throw new ErrorEntrada(422, "Un encargado de sector no puede figurar como inspector. Elegí un inspector HyS.");
      if (c.inspeccion.x_inspector_texto) vals.x_inspector_texto = textoInspector(inspector);

      // Quién carga: tiene que ser un inspector ACTIVO de x_hys_inspector (los únicos que pueden ingresar).
      // x_cargado_por lo arma el servidor con ese registro (no se confía en el texto del celular).
      // El id sale de la sesión verificada (token de POST /api/v1/ingreso), no del cuerpo.
      const ctxEnvio = cuerpo.contexto || {};
      const idCargador = sesion?.inspector_id;
      if (!Number.isInteger(idCargador)) throw new ErrorEntrada(401, "Tu sesión venció o cambió tu contraseña: tocá «Salir» y volvé a ingresar con tu contraseña.");
      const cargador = idCargador === inspector.id ? inspector : await catalogos.buscarInspector(idCargador);
      if (!cargador) throw new ErrorEntrada(422, "Quien carga ya no figura como inspector activo en Odoo (HyS > Inspectores). Avisá a HyS.");
      if (cargador.x_rol === "encargado") throw new ErrorEntrada(403, SOLO_F08);
      if (c.inspeccion.x_cargado_por) {
        const lugar = typeof ctxEnvio.lugar === "string" && ctxEnvio.lugar.trim() ? ctxEnvio.lugar.trim().slice(0, 60) : null;
        vals.x_cargado_por = [textoInspector(cargador), "Inspector HyS", lugar].filter(Boolean).join(" · ").slice(0, 250);
      }

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
      const reglas = reglasDe(vals.x_formulario, vals.x_lugar);
      let cfgPlanta = null;
      if (reglas) {
        // ---- Rama «planta» (F03/F04): ítems del catálogo, validador de config, sin obra.
        for (const k of ["x_ot_id", "x_hito_id", "x_ficha_hito_id"]) delete vals[k];
        const [cfgP, its] = await Promise.all([planta.config(), planta.leerItems(reglas.plantilla)]);
        cfgPlanta = cfgP;
        const activos = new Set(its.lista.map((x) => x.codigo));
        const vistos = new Set(), errores = [];
        for (const [, , l] of vals.x_linea_ids) {
          if (!activos.has(l.x_item_codigo)) errores.push({ campo: "x_item_codigo", mensaje: `Ítem que no es de ${reglas.plantilla}: ${l.x_item_codigo}` });
          else if (vistos.has(l.x_item_codigo)) errores.push({ campo: "x_item_codigo", mensaje: `Ítem repetido: ${l.x_item_codigo}` });
          vistos.add(l.x_item_codigo);
        }
        const faltan = [...activos].filter((k) => !vistos.has(k));
        if (faltan.length) errores.push({ campo: "x_linea_ids", mensaje: `Faltan ítems por responder: ${faltan.join(", ")}` });
        if (errores.length) throw new ErrorEntrada(422, errores.map((e) => e.mensaje).join(" · "), { errores, descartados });
        const validador = reglas.lugar === "oficina" ? cfgP.coo : cfgP.validador_fabrica;
        if (validador && ci.x_validador_id) vals.x_validador_id = validador.id;
        if (ci.x_validacion_estado) vals.x_validacion_estado = "pendiente";
        pon("x_modalidad", "presencial");
        if (ci.x_presencial_obligatoria && !ci.x_presencial_obligatoria.readonly) vals.x_presencial_obligatoria = false;
      }
      // Ficha F01 de la OT (leída de Odoo al recibir, sin caché): ficha, clase y motivo NO salen del celular.
      if (vals.x_ot_id) {
        const f = await catalogos.fichaDeOt(vals.x_ot_id, { fresca: true });
        if (f) pon("x_ficha_id", f.id);
        const clase = f?.clase || "A";
        if ((ci.x_clase_al_inspeccionar?.selection || []).some(([v]) => v === clase)) pon("x_clase_al_inspeccionar", clase);
        pon("x_clase_motivo", (f ? f.motivo || `Ficha ${f.nombre || f.id} (${f.estado})` : "Sin Ficha de Riesgos: se trata como Clase A").slice(0, 250));
        if (vals.x_tipo_programa === "hito_critico" && Number.isInteger(vals.x_ficha_hito_id)) {
          const hito = f?.hitos.find((x) => x.id === vals.x_ficha_hito_id);
          if (!hito) throw new ErrorEntrada(422, "El hito elegido no es de la Ficha de Riesgos activa de esta obra. Volvé a elegirlo.");
          if (!hito.critico) throw new ErrorEntrada(422, "El hito elegido no es de riesgo crítico. Elegí un hito crítico u otro tipo de inspección.");
        }
      }
      if (vals.x_tipo_programa !== "hito_critico") { delete vals.x_ficha_hito_id; delete vals.x_hito_id; }
      if (!reglas && ci.x_presencial_obligatoria && !ci.x_presencial_obligatoria.readonly) vals.x_presencial_obligatoria = PRESENCIAL_OBLIGATORIA.includes(vals.x_tipo_programa);
      const cantNo = vals.x_linea_ids.filter(([, , l]) => l.x_respuesta === "no").length;
      if (ci.x_cant_no && !ci.x_cant_no.readonly) vals.x_cant_no = cantNo;
      // Secuencia de las líneas si no vino.
      vals.x_linea_ids.forEach(([, , l], i) => { if (c.linea.x_secuencia && l.x_secuencia === undefined) l.x_secuencia = i + 1; });

      const anio = (vals.x_fecha_hora_control || ahora).slice(0, 4);
      if (reglas) {
        // Programa (D-01/D-02/decisión 7): vence el día configurado; si ya hay una realizada en el
        // período → fuera_programa (y se avisa); si hay una programada → se completa esa.
        const per = periodoDe(vals.x_fecha_hora_control, { periodo: reglas.periodo, diaVence: cfgPlanta.dia_vence, diaMes: cfgPlanta.dia_mes });
        const decidir = async () => {
          const extra = {};
          let idProgramada = null;
          if (vals.x_tipo_programa === "fuera_programa") vals.x_fecha_vencimiento = vals.x_fecha_hora_control;
          else {
            const regs = await planta.delPeriodo(vals.x_formulario, reglas, per);
            if (regs.some((r) => r.x_estado === "realizada")) {
              vals.x_tipo_programa = "fuera_programa";
              vals.x_fecha_vencimiento = vals.x_fecha_hora_control;
              extra.fuera_programa = true;
              extra.aviso = reglas.periodo === "semana"
                ? "Ya había una recorrida realizada esta semana: esta se registró como «fuera de programa»."
                : "Ya había un check realizado este mes en este lugar: este se registró como «fuera de programa».";
            } else {
              vals.x_fecha_vencimiento = per.vence;
              const prog = regs.find((r) => r.x_estado === "programada");
              if (prog) { idProgramada = prog.id; extra.programada_completada = prog.id; }
            }
          }
          extra.vence = vals.x_fecha_vencimiento;
          return { idProgramada, extra };
        };
        if (soloValidar) { const d = await decidir(); return { estado: 200, cuerpo: { simulado: true, vals, descartados, ...d.extra } }; }
        const { r, extra } = await enSerie(async () => {
          const ya2 = await buscarPorClave(clave);
          if (ya2) return { r: { id: ya2.id, name: ya2.x_name, repetido: true }, extra: {} };
          const d = await decidir();
          return { r: await crearNumeradoYa(vals, anio, clave, d.idProgramada), extra: d.extra };
        });
        return { estado: r.repetido ? 200 : 201, cuerpo: respuesta(r.id, r.name, { descartados, ...extra, ...(r.repetido ? { repetido: true } : {}) }) };
      }
      if (soloValidar) return { estado: 200, cuerpo: { simulado: true, vals, descartados } };

      const r = await crearNumerado(vals, anio, clave);
      return { estado: r.repetido ? 200 : 201, cuerpo: respuesta(r.id, r.name, { descartados, ...(r.repetido ? { repetido: true } : {}) }) };
    })().finally(() => enCurso.delete(clave));
    if (!soloValidar) enCurso.set(clave, p);
    return p;
  }

  return { recibir, leerCampos, catalogo: (f, l) => planta.catalogo(f, l) };
}

/** Número NNNNN de un nombre «…INS-AAAA-NNNNN…» (con o sin prefijo de prueba); null si no es de ese año. */
export function numeroDe(nombre, anio) {
  const m = String(nombre ?? "").match(new RegExp(`(?:^|[^A-Za-z0-9])INS-${anio}-(\\d+)(?!\\d)`, "i"));
  return m ? Number(m[1]) : null;
}
export const formatoNumero = (anio, n) => `INS-${anio}-${String(n).padStart(5, "0")}`;

const respuesta = (id, name, extra) => ({ odoo_model: "x_hys_inspeccion", odoo_id: id, id, name, ...extra });
