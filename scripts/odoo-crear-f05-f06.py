#!/usr/bin/env python3
"""F05/F06/desvíos en Odoo (ARME). Crea, si no existen:
  modelos x_hys_evento (F05), x_hys_control_legal + x_hys_vencimiento_carga (F06), x_hys_desvio (F05 acción correctiva / F07);
  grupo «HyS / Lectura F05»; accesos; secuencias y numeración; vistas lista; acciones; menús; acción programada de alertas.
Por defecto SIMULACIÓN (solo lee). Aplicar: --aplicar. Entorno: ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY.
Usuarios a sumar al grupo de lectura F05: --lector-f05=<uid> (no se guardan en el repo).
Los 9 controles legales NO se cargan acá (sin datos reales en el repo)."""
import os, sys, json, xmlrpc.client
APLICAR = "--aplicar" in sys.argv
LECTORES = [int(a.split("=")[1]) for a in sys.argv if a.startswith("--lector-f05=")]
U, D, UID, K = os.environ["ODOO_URL"], os.environ["ODOO_DB"], int(os.environ.get("ODOO_UID", "2")), os.environ["ODOO_API_KEY"]
m = xmlrpc.client.ServerProxy(U + "/xmlrpc/2/object", allow_none=True)
def c(mo, me, *a, **k): return m.execute_kw(D, UID, K, mo, me, list(a), k)
CREADO = {}
def hacer(que, fn):
    print(("APLICA " if APLICAR else "HARÍA  ") + que)
    if APLICAR:
        r = fn(); CREADO.setdefault(que.split(" ")[0], []).append(r); return r

G_DESA, G_HYS, G_INSP, G_JP, G_VAL, G_API = 216, 218, 219, 221, 222, 217
def xid(x): return c("ir.model.data", "check_object_reference", *x.split("."))[1]
G_USER = xid("base.group_user")

SECT = [("corte_laser","Corte Láser"),("corte_plegado","Corte y Plegado"),("conformado","Conformado"),("estructura_soldadura","Estructura y Soldadura"),
        ("carpinteria","Carpintería Metálica"),("pintura","Pintura"),("aluminio","Aluminio"),("recepcion_deposito","Depósito Central")]
def S(etq, *p, req=False): return {"ttype": "selection", "field_description": etq, "required": req,
    "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(p)]}
def F(etq, t, rel=None, req=False, **kw): return {"ttype": t, "field_description": etq, "required": req, **({"relation": rel} if rel else {}), **kw}
GPS = {"x_gps_lat": F("GPS latitud", "float"), "x_gps_lon": F("GPS longitud", "float"), "x_gps_precision_m": F("GPS precisión (m)", "float"),
       "x_gps_fecha": F("GPS capturado el", "datetime"),
       "x_gps_estado": S("GPS", ("ok","Capturado"),("denegado","Permiso denegado"),("sin_posicion","Sin posición / tiempo agotado"),("no_disponible","Navegador sin geolocalización")),
       "x_fecha_hora_control": F("Enviado desde el celular", "datetime"), "x_fecha_recepcion": F("Recibido en Odoo", "datetime"),
       "x_cargado_por": F("Cargado por", "char"), "x_idempotency_key": F("Clave de envío", "char", index="btree")}
EST_VEN = [("vigente","Vigente"),("vencido","Vencido"),("sin_protocolo","Sin protocolo")]
MODELOS = [
 ("x_hys_evento", "HyS · Evento (accidente / incidente) F05", {
  "x_tipo": S("Tipo de evento", ("baja","Accidente con baja"),("sinbaja","Accidente sin baja"),("incidente","Incidente (daño material, sin lesión)"),("casi","Casi-accidente (pudo pasar y no pasó)"),("condicion","Condición insegura"), req=True),
  "x_fecha_hora": F("Fecha y hora del evento", "datetime", req=True),
  "x_ambito": S("Dónde", ("obra","Obra"),("fabrica","Fábrica"),("oficina","Oficina"), req=True),
  "x_ot_id": F("OT", "many2one", "project.project"), "x_sector": S("Sector de Fábrica", *SECT),
  "x_persona_id": F("Persona involucrada", "many2one", "hr.employee"), "x_persona_externa": F("Persona (si no es empleado)", "char"),
  "x_lesion_parte": S("Lesión", ("manos","Manos y dedos"),("ojos","Ojos"),("cabeza","Cabeza"),("espalda","Espalda"),("pies","Pies"),("otra","Otra")),
  "x_atencion": F("Atención recibida", "text"), "x_dias_baja": F("Días de baja estimados", "integer"),
  "x_aviso_telefonico": F("Se avisó por teléfono a HyS", "boolean"), "x_aviso_hora": F("Hora del aviso telefónico", "datetime"), "x_aviso_a": F("A quién se avisó", "char"),
  "x_que_paso": F("Qué pasó", "text", req=True), "x_testigos": F("Testigos", "text"), "x_foto": F("Foto", "binary"),
  "x_reportado_por": F("Quién lo reporta", "char", req=True), "x_cargado_en_plazo": F("Cargado dentro de 24 h", "boolean"),
  "x_estado": S("Estado", ("registrado","Registrado"),("investigacion","En investigación"),("investigado","Investigado"), req=True),
  "x_inv_vencimiento": F("Investigar antes de", "datetime"), "x_inv_causa_inmediata": F("Causa inmediata", "text"),
  "x_inv_causa_raiz": F("Causa raíz", "text"), "x_inv_accion_correctiva": F("Acción correctiva", "text"),
  "x_inv_fecha": F("Investigado el", "datetime"), "x_inv_por_id": F("Investigado por", "many2one", "res.users"), **GPS}),
 ("x_hys_control_legal", "HyS · Control legal (vencimientos) F06", {
  "x_referencia": F("Referencia", "char"), "x_donde": F("Dónde", "char"),
  "x_periodicidad": S("Periodicidad", ("anual","Anual"),("5_anios","Cada 5 años"),("segun_norma","Según norma")),
  "x_periodicidad_meses": F("Meses", "integer"),
  "x_prioridad": S("Prioridad", ("1","1 · Riesgo vital"),("2","2"),("3","3")),
  "x_estado": S("Estado", ("sin_estado","Sin estado cargado"), *EST_VEN),
  "x_fecha_servicio": F("Fecha de medición o servicio", "date"), "x_fecha_vence": F("Vence", "date"),
  "x_proveedor": F("Profesional o proveedor", "char"), "x_protocolo": F("Protocolo", "binary"), "x_protocolo_nombre": F("Nombre del archivo", "char"),
  "x_responsable_id": F("Responsable", "many2one", "res.users")}),
 ("x_hys_vencimiento_carga", "HyS · Carga de vencimiento legal F06", {
  "x_control_id": F("Control", "many2one", "x_hys_control_legal", req=True, on_delete="restrict"), "x_estado": S("Estado", *EST_VEN, req=True),
  "x_fecha_servicio": F("Fecha de medición o servicio", "date"), "x_fecha_vence": F("Vence", "date"),
  "x_proveedor": F("Profesional o proveedor", "char"), "x_protocolo": F("Protocolo (PDF o foto)", "binary"),
  "x_protocolo_nombre": F("Nombre del archivo", "char"), **GPS}),
 ("x_hys_desvio", "HyS · Desvío y cierre (F07)", {
  "x_origen_formulario": S("Origen", ("F02","F02"),("F03","F03"),("F04","F04"),("F08","F08"),("F05","F05 · Acción correctiva de evento"),("manual","Manual (HyS)"), req=True),
  "x_inspeccion_id": F("Inspección", "many2one", "x_hys_inspeccion"), "x_linea_id": F("Ítem de inspección", "many2one", "x_hys_inspeccion_linea"),
  "x_ats_id": F("ATS de turno", "many2one", "x_hys_ats"), "x_evento_id": F("Evento", "many2one", "x_hys_evento"),
  "x_ambito": S("Ámbito", ("obra","Obra"),("fabrica","Fábrica"),("oficina","Oficina"),("deposito","Depósito Central"),("logistica","Logística y Mant."), req=True),
  "x_ot_id": F("OT", "many2one", "project.project"), "x_sector": S("Sector", *SECT),
  "x_descripcion": F("Qué está mal", "char", req=True),
  "x_criticidad": S("Gravedad", ("critico","Crítico"),("mayor","Mayor"),("menor","Menor"), req=True),
  "x_accion_inmediata": F("Acción inmediata", "char"), "x_foto_deteccion": F("Foto del problema", "binary"),
  "x_fecha_deteccion": F("Detectado el", "datetime"), "x_fecha_vencimiento": F("Vence", "datetime"),
  "x_responsable_id": F("Lo arregla", "many2one", "res.users"),
  "x_estado": S("Estado", ("abierto","Abierto"),("cerrado","Cerrado"),("anulado","Anulado"), req=True),
  "x_motivo_anulacion": F("Motivo de anulación", "char"), "x_vencido": F("Vencido sin cierre", "boolean"),
  "x_que_se_hizo": F("Qué se hizo", "text"), "x_foto_cierre": F("Foto de la corrección", "binary"),
  "x_fecha_cierre": F("Cerrado el", "datetime"), "x_cerrado_por": F("Cerrado por", "char"), "x_cerrado_en_plazo": F("Cerrado en plazo", "boolean"),
  "x_cierre_idempotency_key": F("Clave de envío del cierre", "char"), "x_verificado_hys": F("Verificado por HyS", "boolean"),
  "x_verificado_el": F("Verificado el", "datetime"), "x_idempotency_key": F("Clave de envío", "char", index="btree")}),
]
# Relaciones inversas (después de crear los 4)
EXTRA = [
 ("x_hys_evento", "x_desvio_ids", F("Acciones correctivas (desvíos)", "one2many", "x_hys_desvio", relation_field="x_evento_id")),
 ("x_hys_control_legal", "x_carga_ids", F("Historial de cargas", "one2many", "x_hys_vencimiento_carga", relation_field="x_control_id")),
 ("x_hys_control_legal", "x_ultima_carga_id", F("Última carga", "many2one", "x_hys_vencimiento_carga")),
]
SEQ = {"x_hys_evento": ("EV-%(year)s-", 4), "x_hys_vencimiento_carga": ("VEN-%(year)s-", 4), "x_hys_desvio": ("D-", 5)}
# Accesos: grupo → (leer, escribir, crear, borrar)
def accesos(g_lect):
    return {
     "x_hys_evento": {G_USER: (0,0,1,0), G_INSP: (0,0,1,0), G_API: (1,1,1,0), G_HYS: (1,1,1,0), G_JP: (1,0,0,0), G_DESA: (1,1,1,1), g_lect: (1,0,0,0)},
     "x_hys_control_legal": {G_USER: (1,0,0,0), G_API: (1,1,0,0), G_HYS: (1,1,1,0), G_DESA: (1,1,1,1)},
     "x_hys_vencimiento_carga": {G_USER: (1,0,0,0), G_API: (1,1,1,0), G_HYS: (1,1,1,0), G_DESA: (1,1,1,1)},
     "x_hys_desvio": {G_API: (1,1,1,0), G_HYS: (1,1,1,0), G_INSP: (1,1,1,0), G_JP: (1,0,0,0), G_VAL: (1,0,0,0), G_DESA: (1,1,1,1), g_lect: (1,0,0,0)},
    }
LISTAS = {
 "x_hys_evento": "x_name x_fecha_hora x_tipo x_ambito x_ot_id x_sector x_persona_id x_aviso_telefonico x_aviso_hora x_cargado_en_plazo x_inv_vencimiento x_estado",
 "x_hys_control_legal": "x_name x_referencia x_donde x_periodicidad x_prioridad x_estado x_fecha_servicio x_fecha_vence x_proveedor x_responsable_id",
 "x_hys_vencimiento_carga": "x_name x_control_id x_estado x_fecha_servicio x_fecha_vence x_proveedor x_cargado_por x_fecha_recepcion",
 "x_hys_desvio": "x_name x_origen_formulario x_evento_id x_ambito x_descripcion x_criticidad x_responsable_id x_fecha_vencimiento x_estado",
}
CODIGO_NUMERO = """# HyS · numeración al crear (%(m)s). Escribe: x_name.
for r in records:
    if not r.x_name or r.x_name in ('/', 'Nuevo'):
        r.write({'x_name': env['ir.sequence'].sudo().next_by_code('%(m)s') or '/'})
"""
CODIGO_EVENTO = """# HyS · R-EVE-1 · F05 al crear: vence la investigación a 72 h y actividad «Investigar evento» a HyS (grupo 218).
hys = env['res.groups'].sudo().browse(218).user_ids
for r in records:
    if not r.x_inv_vencimiento:
        r.write({'x_inv_vencimiento': (r.create_date or datetime.datetime.now()) + datetime.timedelta(hours=72)})
    tipo = dict(r._fields['x_tipo'].selection).get(r.x_tipo, r.x_tipo)
    for u in hys:
        r.activity_schedule('mail.mail_activity_data_todo', user_id=u.id, date_deadline=(r.x_inv_vencimiento - datetime.timedelta(hours=3)).date(),
            summary='Investigar evento %s (%s)' % (r.x_name, tipo), note='Causa inmediata, causa raíz y acción correctiva dentro de las 72 h.')
"""
CODIGO_ALERTAS = """# HyS · F06 alertas de vencimiento legal (diario 08:00 ART). Actividad al responsable del control y a HyS (grupo 218)
# a 30, 15, 7 y 0 días del vencimiento; si venció: pasa a «Vencido» y alerta (una sola actividad abierta por persona).
hoy = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).date()
hys = env['res.groups'].sudo().browse(218).user_ids
for ctl in env['x_hys_control_legal'].search([('x_estado', 'in', ['vigente', 'vencido']), ('x_fecha_vence', '!=', False)]):
    d = (ctl.x_fecha_vence - hoy).days
    if d < 0 and ctl.x_estado == 'vigente':
        ctl.write({'x_estado': 'vencido'})
        ctl.message_post(body='Venció el %s: pasa a «Vencido».' % ctl.x_fecha_vence.strftime('%d/%m/%Y'))
    if d in (30, 15, 7, 0):
        resumen = 'Vence %s: %s' % ('HOY' if d == 0 else 'en %s días' % d, ctl.x_name)
    elif d < 0:
        resumen = 'VENCIDO: %s' % ctl.x_name
    else:
        continue
    for u in (ctl.x_responsable_id | hys):
        ya = env['mail.activity'].search_count([('res_model', '=', 'x_hys_control_legal'), ('res_id', '=', ctl.id), ('user_id', '=', u.id), ('summary', '=', resumen)])
        if not ya:
            ctl.activity_schedule('mail.mail_activity_data_todo', user_id=u.id, date_deadline=ctl.x_fecha_vence if d >= 0 else hoy,
                summary=resumen, note='Cargá el nuevo protocolo con F06 (hys-carga) al recibirlo.')
"""

def backup():
    datos = {"menus": c("ir.ui.menu", "read", [1344, 1357, 1360, 1361, 1362], fields=["name", "parent_id", "action", "group_ids", "sequence"]),
             "grupos": c("res.groups", "read", [G_DESA, G_HYS, G_INSP, G_JP, G_VAL, G_API], fields=["name", "user_ids"]),
             "modelos_existentes": c("ir.model", "search_read", [["model", "in", [x[0] for x in MODELOS]]], fields=["model"])}
    ruta = os.environ.get("BACKUP_JSON")
    if ruta:
        json.dump(datos, open(ruta, "w"), ensure_ascii=False, indent=1); print("backup →", ruta)

def main():
    backup()
    g = c("res.groups", "search", [["name", "=", "HyS / Lectura F05"]])
    g_lect = g[0] if g else hacer("grupo «HyS / Lectura F05»", lambda: c("res.groups", "create", {"name": "HyS / Lectura F05",
        "comment": "Lectura de eventos F05 (datos de salud) fuera de HyS/JP/Desarrollo. Alta: COO."}))
    if LECTORES and g_lect:
        hacer(f"usuarios {LECTORES} → «HyS / Lectura F05»", lambda: c("res.groups", "write", [g_lect], {"user_ids": [(4, u) for u in LECTORES]}))
    ids = {}
    for mo, nombre, campos in MODELOS:
        ex = c("ir.model", "search", [["model", "=", mo]])
        if ex: print("EXISTE", mo, ex[0]); ids[mo] = ex[0]; continue
        ids[mo] = hacer(f"modelo {mo} ({len(campos)} campos)", lambda: c("ir.model", "create", {"model": mo, "name": nombre, "state": "manual",
            "is_mail_thread": True, "is_mail_activity": True,
            "field_id": [(0, 0, {"name": "x_name", "ttype": "char", "field_description": "Número" if mo != "x_hys_control_legal" else "Control", "required": True})]
                        + [(0, 0, {"name": n, **v}) for n, v in campos.items()]}))
    for mo, n, v in EXTRA:
        if not APLICAR or not c("ir.model.fields", "search", [["model", "=", mo], ["name", "=", n]]):
            hacer(f"campo {mo}.{n}", lambda: c("ir.model.fields", "create", {"model_id": ids[mo], "name": n, **v}))
    for mo, perm in accesos(g_lect or 0).items():
        for gr, (r, w, cr, u) in perm.items():
            if APLICAR and c("ir.model.access", "search", [["model_id", "=", ids[mo]], ["group_id", "=", gr]]): continue
            hacer(f"acceso {mo} grupo {gr} r{r}w{w}c{cr}u{u}", lambda: c("ir.model.access", "create", {"name": f"{mo}_g{gr}", "model_id": ids[mo], "group_id": gr,
                "perm_read": bool(r), "perm_write": bool(w), "perm_create": bool(cr), "perm_unlink": bool(u)}))
    # numeración
    for mo, (pre, pad) in SEQ.items():
        if not c("ir.sequence", "search", [["code", "=", mo]]):
            hacer(f"secuencia {mo} {pre}", lambda: c("ir.sequence", "create", {"name": f"HyS · {mo}", "code": mo, "prefix": pre, "padding": pad}))
        nom = f"HyS · Número {mo} (secuencia)"
        if not c("base.automation", "search", [["name", "=", nom]]):
            def auto(mo=mo, nom=nom):
                a = c("ir.actions.server", "create", {"name": nom + " (código)", "model_id": ids[mo], "state": "code", "usage": "base_automation", "code": CODIGO_NUMERO % {"m": mo}})
                return c("base.automation", "create", {"name": nom, "model_id": ids[mo], "trigger": "on_create", "action_server_ids": [(6, 0, [a])]})
            hacer(f"automatización {nom}", auto)
    nom = "HyS · R-EVE-1 F05 investigación 72 h + aviso a HyS"
    if not c("base.automation", "search", [["name", "=", nom]]):
        def auto_ev():
            a = c("ir.actions.server", "create", {"name": nom + " (código)", "model_id": ids["x_hys_evento"], "state": "code", "usage": "base_automation", "code": CODIGO_EVENTO})
            return c("base.automation", "create", {"name": nom, "model_id": ids["x_hys_evento"], "trigger": "on_create", "action_server_ids": [(6, 0, [a])]})
        hacer(f"automatización {nom}", auto_ev)
    # vistas lista y acciones
    acc = {}
    TIT = {"x_hys_evento": "Eventos (accidentes e incidentes)", "x_hys_control_legal": "Controles legales", "x_hys_vencimiento_carga": "Cargas de vencimientos", "x_hys_desvio": "Desvíos"}
    for mo, cols in LISTAS.items():
        if not c("ir.ui.view", "search", [["model", "=", mo], ["type", "=", "list"]]):
            arch = "<list>" + "".join(f'<field name="{f}"/>' for f in cols.split()) + "</list>"
            hacer(f"vista lista {mo}", lambda: c("ir.ui.view", "create", {"name": f"{mo}.list.hys", "model": mo, "type": "list", "arch": arch}))
        a = c("ir.actions.act_window", "search", [["res_model", "=", mo], ["name", "=", TIT[mo]]])
        acc[mo] = a[0] if a else hacer(f"acción {TIT[mo]}", lambda: c("ir.actions.act_window", "create", {"name": TIT[mo], "res_model": mo, "view_mode": "list,form",
            "context": "{'default_x_estado': 'registrado'}" if mo == "x_hys_evento" else "{'default_x_estado': 'abierto'}" if mo == "x_hys_desvio" else "{}"}))
    # menús existentes
    ref = lambda mo: f"ir.actions.act_window,{acc.get(mo)}"
    hacer("menú 1360 → Eventos; nombre sin «(próximamente)»; grupos 216/218/221/Lectura F05",
          lambda: c("ir.ui.menu", "write", [1360], {"name": "F05 · Registro de accidente o incidente", "action": ref("x_hys_evento"),
              "group_ids": [(6, 0, [G_DESA, G_HYS, G_JP, g_lect])]}))
    hacer("menús 1344/1357: + grupo Lectura F05 (para que vea el camino a 1360; NO se abre a todos)",
          lambda: c("ir.ui.menu", "write", [1344, 1357], {"group_ids": [(4, g_lect)]}))
    hacer("menú 1361 → Controles legales; nombre sin «(próximamente)»",
          lambda: c("ir.ui.menu", "write", [1361], {"name": "F06 · Carga de vencimiento legal", "action": ref("x_hys_control_legal")}))
    if not c("ir.ui.menu", "search", [["name", "=", "Desvíos"], ["parent_id", "=", 1362]]):
        hacer("menú Desvíos bajo 1362 (F07)", lambda: c("ir.ui.menu", "create", {"name": "Desvíos", "parent_id": 1362, "action": ref("x_hys_desvio"), "sequence": 10}))
    # menú propio F06 para todos los internos
    raiz = c("ir.ui.menu", "search", [["name", "=", "Vencimientos legales"], ["parent_id", "=", False]])
    if not raiz:
        def menu_ven():
            r = c("ir.ui.menu", "create", {"name": "Vencimientos legales", "sequence": 95, "group_ids": [(6, 0, [G_USER])], "web_icon": "base,static/description/icon.png"})
            c("ir.ui.menu", "create", {"name": "Controles legales", "parent_id": r, "action": ref("x_hys_control_legal"), "sequence": 1})
            c("ir.ui.menu", "create", {"name": "Historial de cargas", "parent_id": r, "action": ref("x_hys_vencimiento_carga"), "sequence": 2})
            return r
        hacer("menú raíz «Vencimientos legales» (base.group_user) + Controles + Historial", menu_ven)
    # acción programada
    if not c("ir.cron", "search", [["name", "=", "HyS · F06 alertas de vencimiento legal (diario 08:00 ART)"]]):
        hacer("cron alertas F06 diario 08:00 ART", lambda: c("ir.cron", "create", {"name": "HyS · F06 alertas de vencimiento legal (diario 08:00 ART)",
            "model_id": ids["x_hys_control_legal"], "state": "code", "code": CODIGO_ALERTAS, "interval_number": 1, "interval_type": "days",
            "nextcall": "2026-10-26 11:00:00", "user_id": UID, "active": True}))
    print("\nIDs:", json.dumps({"modelos": ids, "grupo_lectura_f05": g_lect, "acciones": acc, "creado": CREADO}, default=str))
    if not APLICAR: print("SIMULACIÓN: no se creó nada.")
main()
