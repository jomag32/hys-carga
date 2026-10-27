// Plantilla BORRADOR del ATS de obra (F08 · sector «obra» · formulario F08_OBRA).
// Propuesta 27/10/2026 para revisión de Jorge / HyS. Misma forma que F08_DEP / F08_LOG:
// 10 controles, ★ = crítico (no admite N/A), el resto admite N/A con justificación.
// NO está aplicada en Odoo todavía: ver /workspace/hys-ats-sector/odoo-cambios-ats-obra.md

export const FORMULARIO_OBRA = "F08_OBRA";
export const CODIGO_ATS_OBRA = "ATS-OBRA-001";
export const BLOQUE_OBRA = "Chequeo antes de empezar (ATS-OBRA-001) · BORRADOR";

/** Controles BORRADOR (secuencia 1..10). critico ⇒ no admite N/A. */
export const CONTROLES_OBRA = [
  { codigo: "F08O-01", nombre: "Personal instruido y tareas del turno informadas", critico: false },
  { codigo: "F08O-02", nombre: "EPP completo según la tarea (casco, calzado, guantes, anteojos; arnés si hay altura)", critico: true },
  { codigo: "F08O-03", nombre: "Trabajo en altura: andamios, escaleras, plataformas y línea de vida verificados", critico: true },
  { codigo: "F08O-04", nombre: "Izaje / hidrogrúa de terceros: operador habilitado, eslingas OK, área señalizada", critico: true },
  { codigo: "F08O-05", nombre: "Soldadura / corte / amolado: área despejada, pantallas y extintor a mano", critico: true },
  { codigo: "F08O-06", nombre: "Riesgo eléctrico: tableros, cables, fichas y herramientas en condiciones", critico: true },
  { codigo: "F08O-07", nombre: "Excavaciones / zanjas: taludes, apuntalamiento y accesos seguros (N/A si no hay)", critico: false },
  { codigo: "F08O-08", nombre: "Señalización y delimitación de la zona de trabajo (peatonal y vehicular)", critico: false },
  { codigo: "F08O-09", nombre: "Orden y limpieza: acopios estables, vías libres, sin materiales sueltos en altura", critico: false },
  { codigo: "F08O-10", nombre: "Permisos de trabajo / trabajo en caliente / aislamiento de energías, cuando aplique", critico: true }
];

export const CODIGOS_OBRA_SIN_NA = CONTROLES_OBRA.filter((c) => c.critico).map((c) => c.codigo);

/** Turno BORRADOR de obra (misma lógica que Depósito/Logística: Jornada lun–vie 07:00). */
export const TURNO_OBRA_BORRADOR = {
  codigo: "jornada", nombre: "Jornada", sector: "obra", hora_inicio: 7,
  dias: "0,1,2,3,4", codigo_ats: CODIGO_ATS_OBRA, secuencia: 10
};

/** Ítems listos para x_hys_item_plantilla / mock. */
export function itemsPlantillaObra({ idDesde = 91 } = {}) {
  return CONTROLES_OBRA.map((c, i) => ({
    id: idDesde + i,
    x_codigo: c.codigo,
    x_formulario: FORMULARIO_OBRA,
    x_bloque: BLOQUE_OBRA,
    x_riesgo_id: false,
    x_critico: c.critico,
    x_secuencia: i + 1,
    x_name: c.nombre,
    x_active: true,
    x_version: "BORRADOR 2026-10-27",
    x_admite_na: !c.critico
  }));
}
