#!/usr/bin/env python3
"""Crea en Odoo los modelos de F05/F06 (x_hys_evento, x_hys_control_legal, x_hys_vencimiento_carga),
accesos, acciones y menús. Por defecto es SIMULACIÓN (solo lee y muestra lo que haría).
Para aplicar: ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY en el entorno y --aplicar. NO lo corras sin OK de Jorge.
Los 9 controles legales NO están acá: se cargan desde Odoo (sin datos reales en el repo)."""
import os, sys, xmlrpc.client
APLICAR = "--aplicar" in sys.argv
U, D, UID, K = os.environ["ODOO_URL"], os.environ["ODOO_DB"], int(os.environ.get("ODOO_UID", "2")), os.environ["ODOO_API_KEY"]
m = xmlrpc.client.ServerProxy(U + "/xmlrpc/2/object", allow_none=True)
def c(mo, me, *a, **k): return m.execute_kw(D, UID, K, mo, me, list(a), k)
SECT = [("corte_laser","Corte Láser"),("corte_plegado","Corte y Plegado"),("conformado","Conformado"),("estructura_soldadura","Estructura y Soldadura"),
        ("carpinteria","Carpintería Metálica"),("pintura","Pintura"),("aluminio","Aluminio"),("recepcion_deposito","Depósito Central")]
S = lambda *p: {"ttype": "selection", "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(p)]}
CTRL = [("x_gps_lat","float"),("x_gps_lon","float"),("x_idempotency_key","char"),("x_fecha_recepcion","datetime"),("x_cargado_por","char")]
MODELOS = {
 "x_hys_evento": ("HyS · Evento (F05)", {
  "x_tipo": S(("baja","Accidente con baja"),("sinbaja","Accidente sin baja"),("incidente","Incidente (daño material, sin lesión)"),("casi","Casi-accidente"),("condicion","Condición insegura")),
  "x_fecha_hora": "datetime", "x_ambito": S(("obra","Obra"),("fabrica","Fábrica"),("oficina","Oficina")),
  "x_ot_id": ("many2one","project.project"), "x_sector": S(*SECT), "x_persona_id": ("many2one","hr.employee"), "x_persona_externa": "char",
  "x_lesion_parte": S(("manos","Manos y dedos"),("ojos","Ojos"),("cabeza","Cabeza"),("espalda","Espalda"),("pies","Pies"),("otra","Otra")),
  "x_atencion": "text", "x_dias_baja": "integer", "x_aviso_telefonico": "boolean", "x_aviso_hora": "datetime", "x_aviso_a": "char",
  "x_que_paso": "text", "x_testigos": "text", "x_foto": "binary", "x_reportado_por": "char", "x_cargado_en_plazo": "boolean",
  "x_estado": S(("registrado","Registrado"),("en_investigacion","En investigación"),("investigado","Investigado")),
  "x_causa_inmediata": "text", "x_causa_raiz": "text", "x_accion_correctiva": "text", "x_vence_investigacion": "datetime"}),
 "x_hys_control_legal": ("HyS · Control legal (F06)", {
  "x_referencia": "char", "x_donde": "char", "x_periodicidad": S(("anual","Anual"),("5_anios","Cada 5 años"),("segun_norma","Según norma")),
  "x_prioridad": S(("1","1"),("2","2"),("3","3")), "x_estado": S(("vigente","Vigente"),("vencido","Vencido"),("sin_protocolo","Sin protocolo")),
  "x_fecha_servicio": "date", "x_fecha_vence": "date", "x_proveedor": "char", "x_responsable_id": ("many2one","res.users")}),
 "x_hys_vencimiento_carga": ("HyS · Carga de vencimiento (F06)", {
  "x_control_id": ("many2one","x_hys_control_legal"), "x_estado": S(("vigente","Vigente"),("vencido","Vencido"),("sin_protocolo","Sin protocolo")),
  "x_fecha_servicio": "date", "x_fecha_vence": "date", "x_proveedor": "char", "x_protocolo": "binary", "x_protocolo_nombre": "char"}),
}
# Accesos: (grupo xmlid o id, leer, escribir, crear, borrar)
USER = "base.group_user"
ACCESOS = {
 "x_hys_evento": [(USER,0,0,1,0), (219,0,0,1,0), (221,1,0,1,0), (218,1,1,1,0), (216,1,1,1,1)],  # salud: lee HyS/JP/Desarrollo
 "x_hys_control_legal": [(USER,1,0,0,0), (218,1,1,1,0), (216,1,1,1,1)],                           # F06 lectura para todos
 "x_hys_vencimiento_carga": [(USER,1,0,0,0), (218,1,1,1,0), (216,1,1,1,1)],
}
def gid(g): return g if isinstance(g, int) else c("ir.model.data", "check_object_reference", *g.split("."))[1]
def plan():
    for mo, (nombre, campos) in MODELOS.items():
        existe = c("ir.model", "search", [["model", "=", mo]])
        print(("EXISTE " if existe else "CREAR  ") + mo)
        if existe or not APLICAR: continue
        mid = c("ir.model", "create", {"model": mo, "name": nombre, "is_mail_thread": True,
              "field_id": [(0, 0, {"name": "x_name", "ttype": "char", "field_description": "Nombre", "required": True})]})
        for n, t in list(campos.items()) + CTRL:
            v = {"model_id": mid, "name": n, "field_description": n[2:].replace("_", " ").capitalize()}
            if isinstance(t, dict): v.update(t)
            elif isinstance(t, tuple): v.update({"ttype": t[0], "relation": t[1]})
            else: v["ttype"] = t
            c("ir.model.fields", "create", v)
        for g, r, w, cr, u in ACCESOS[mo]:
            c("ir.model.access", "create", {"name": f"{mo}_{g}", "model_id": mid, "group_id": gid(g), "perm_read": r, "perm_write": w, "perm_create": cr, "perm_unlink": u})
    print("MENÚ 1360 (F05) → acción lista de x_hys_evento, grupos 216/218/221; quitar «(próximamente)»")
    print("MENÚ 1361 (F06) → acción lista de x_hys_control_legal; agregar base.group_user a 1344, 1357 y 1361")
    print("Acción programada diaria: alertas 30/15/7/0 días y vencidos (actividad al responsable + HyS)")
    if not APLICAR: print("\nSIMULACIÓN: no se creó nada. Menús/acciones/cron se hacen en un segundo paso tras revisar.")
plan()
