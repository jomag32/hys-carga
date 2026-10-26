#!/usr/bin/env python3
"""F07 + vistas en español (ARME, 25/10/2026). Admin: ODOO_UID (2) + ODOO_API_KEY. Sin datos: solo estructura HyS.
x_hys_desvio: estados en_curso/vencido, x_firma_cierre, x_ats_linea_id, x_item_codigo; R-DES-1 (vence por gravedad, parámetros
hys.desvio.plazo_*), R-CIE-1 (foto y «qué se hizo» para cerrar), acción diaria de vencidos; formularios/búsquedas en español para
x_hys_control_legal, x_hys_vencimiento_carga, x_hys_evento, x_hys_desvio; etiquetas es_419 de los campos técnicos (actividades, mensajes)."""
import os, sys, xmlrpc.client, json
U = os.environ.get("ODOO_URL", "https://cooperativa-de-trabajo-el-sol.odoo.com"); D = os.environ.get("ODOO_DB", "cooperativa-de-trabajo-el-sol")
UID, K = int(os.environ.get("ODOO_UID", "2")), os.environ["ODOO_API_KEY"]
m = xmlrpc.client.ServerProxy(U + "/xmlrpc/2/object", allow_none=True)
def c(mo, me, *a, **k): return m.execute_kw(D, UID, K, mo, me, list(a), k)
ES = {"lang": "es_419"}
OUT = {}
MS = ["x_hys_control_legal", "x_hys_vencimiento_carga", "x_hys_evento", "x_hys_desvio"]
mid = {x["model"]: x["id"] for x in c("ir.model", "search_read", [("model", "in", MS + ["x_hys_ats_linea"])], fields=["model"])}
def fid(mo, f): r = c("ir.model.fields", "search", [("model", "=", mo), ("name", "=", f)]); return r[0] if r else None
def campo(mo, f, vals):
    if fid(mo, f): return fid(mo, f)
    i = c("ir.model.fields", "create", {"model_id": mid[mo], "name": f, "state": "manual", **vals}); OUT.setdefault("campos", {})[f"{mo}.{f}"] = i; return i
def etiqueta(mo, f, txt, ayuda=None):
    i = fid(mo, f)
    if not i: return
    v = {"field_description": txt, **({"help": ayuda} if ayuda else {})}
    for lang in ("en_US", "es_419"): c("ir.model.fields", "write", [i], v, context={"lang": lang})

# ---------------------------------------------------------------- desvío: campos y estados
f_est = fid("x_hys_desvio", "x_estado")
sel = {s["value"]: s for s in c("ir.model.fields.selection", "search_read", [("field_id", "=", f_est)], fields=["value", "sequence"])}
for v, n, sq in [("abierto", "Abierto", 0), ("en_curso", "En curso", 1), ("vencido", "Vencido", 2), ("cerrado", "Cerrado", 3), ("anulado", "Anulado", 4)]:
    if v in sel: c("ir.model.fields.selection", "write", [sel[v]["id"]], {"name": n, "sequence": sq}, context=ES)
    else: OUT.setdefault("estados", []).append(c("ir.model.fields.selection", "create", {"field_id": f_est, "value": v, "name": n, "sequence": sq}))
campo("x_hys_desvio", "x_firma_cierre", {"ttype": "binary", "field_description": "Firma de quien cierra"})
campo("x_hys_desvio", "x_ats_linea_id", {"ttype": "many2one", "relation": "x_hys_ats_linea", "field_description": "Control del ATS", "on_delete": "set null"})
campo("x_hys_desvio", "x_item_codigo", {"ttype": "char", "field_description": "Código del ítem"})

# ---------------------------------------------------------------- parámetros de plazo (diseño §3.3)
for k, v in [("hys.desvio.plazo_critico_horas", "24"), ("hys.desvio.plazo_mayor_dias_habiles", "5"), ("hys.desvio.plazo_menor_dias", "15")]:
    if not c("ir.config_parameter", "search", [("key", "=", k)]): OUT.setdefault("parametros", []).append(c("ir.config_parameter", "create", {"key": k, "value": v}))

R_DES_1 = """# HyS · R-DES-1: vence según gravedad (diseño §3.3). Plazos en Ajustes › Técnico › Parámetros del sistema (hys.desvio.plazo_*).
P = env['ir.config_parameter'].sudo()
hc = int(P.get_param('hys.desvio.plazo_critico_horas', '24')); dh = int(P.get_param('hys.desvio.plazo_mayor_dias_habiles', '5')); dm = int(P.get_param('hys.desvio.plazo_menor_dias', '15'))
ACC = {'critico': 'Se detiene la tarea', 'mayor': 'Se corrige o se restringe', 'menor': 'Se registra y se programa'}
for d in records:
    det = d.x_fecha_deteccion or d.create_date
    g = d.x_criticidad or 'menor'
    if g == 'critico':
        v = det + datetime.timedelta(hours=hc)
    elif g == 'mayor':
        v = det; n = dh
        while n > 0:
            v = v + datetime.timedelta(days=1)
            if (v - datetime.timedelta(hours=3)).weekday() < 5:
                n -= 1
    else:
        v = det + datetime.timedelta(days=dm)
    vals = {}
    if d.x_fecha_vencimiento != v: vals['x_fecha_vencimiento'] = v
    if not d.x_fecha_deteccion: vals['x_fecha_deteccion'] = det
    if not d.x_accion_inmediata: vals['x_accion_inmediata'] = ACC.get(g)
    if vals: d.write(vals)
"""
R_CIE_1 = """# HyS · R-CIE-1: sin foto de la corrección y sin «Qué se hizo», el desvío no está cerrado (diseño §3.6).
for d in records:
    if not d.x_foto_cierre or not (d.x_que_se_hizo or '').strip():
        raise UserError('Sin foto de la corrección y sin «Qué se hizo», el desvío no está cerrado.')
    cierre = d.x_fecha_cierre or datetime.datetime.now()
    vals = {'x_vencido': False, 'x_cerrado_en_plazo': bool(not d.x_fecha_vencimiento or cierre <= d.x_fecha_vencimiento)}
    if not d.x_fecha_cierre: vals['x_fecha_cierre'] = cierre
    d.write(vals)
"""
VENCIDOS = """# HyS · desvíos vencidos sin cierre (diario 08:05 ART): pasan a «Vencido» y actividad al responsable (o a HyS, grupo 218).
ahora = datetime.datetime.now()
hys = env['res.groups'].sudo().browse(218).user_ids
for d in env['x_hys_desvio'].search([('x_estado', 'in', ['abierto', 'en_curso']), ('x_fecha_vencimiento', '<', ahora)]):
    d.write({'x_estado': 'vencido', 'x_vencido': True})
    d.message_post(body='Venció el %s sin cierre: pasa a «Vencido».' % (d.x_fecha_vencimiento - datetime.timedelta(hours=3)).strftime('%d/%m/%Y %H:%M'))
    for u in (d.x_responsable_id or hys):
        d.activity_schedule('mail.mail_activity_data_todo', user_id=u.id, date_deadline=datetime.date.today(),
            summary='Desvío vencido %s' % d.x_name, note='Cerrar con foto de la corrección (F07) o anular con motivo.')
"""
def automatizacion(nom, mo, trigger, code, campos=(), dominio=None):
    if c("base.automation", "search", [("name", "=", nom)]): return
    a = c("ir.actions.server", "create", {"name": nom + " (código)", "model_id": mid[mo], "state": "code", "usage": "base_automation", "code": code})
    v = {"name": nom, "model_id": mid[mo], "trigger": trigger, "action_server_ids": [(6, 0, [a])]}
    if campos: v["trigger_field_ids"] = [(6, 0, [fid(mo, f) for f in campos])]
    if dominio: v["filter_domain"] = dominio
    OUT.setdefault("automatizaciones", {})[nom] = [c("base.automation", "create", v), a]
automatizacion("HyS · R-DES-1 vencimiento del desvío por gravedad", "x_hys_desvio", "on_create_or_write", R_DES_1, ["x_criticidad", "x_fecha_deteccion"])
automatizacion("HyS · R-CIE-1 cierre de desvío con foto obligatoria", "x_hys_desvio", "on_create_or_write", R_CIE_1, ["x_estado"], "[('x_estado', '=', 'cerrado')]")
NC = "HyS · Desvíos vencidos sin cierre (diario 08:05 ART)"
if not c("ir.cron", "search", [("name", "=", NC)]):
    OUT["cron"] = c("ir.cron", "create", {"name": NC, "model_id": mid["x_hys_desvio"], "state": "code", "code": VENCIDOS, "interval_number": 1,
        "interval_type": "days", "nextcall": "2026-10-26 11:05:00", "user_id": UID, "active": True})

# ---------------------------------------------------------------- etiquetas en español
BASE = {"id": "ID", "display_name": "Nombre", "activity_ids": "Actividades", "activity_state": "Estado de la actividad", "activity_user_id": "Responsable de la actividad",
 "activity_type_id": "Tipo de la próxima actividad", "activity_type_icon": "Ícono del tipo de actividad", "activity_date_deadline": "Vencimiento de la próxima actividad",
 "my_activity_date_deadline": "Vencimiento de mi actividad", "activity_summary": "Resumen de la próxima actividad", "activity_exception_decoration": "Decoración de excepción",
 "activity_exception_icon": "Ícono", "activity_calendar_event_id": "Evento de calendario de la próxima actividad", "message_is_follower": "Es seguidor",
 "message_follower_ids": "Seguidores", "message_partner_ids": "Seguidores (contactos)", "message_ids": "Mensajes", "has_message": "Tiene mensajes",
 "message_needaction": "Requiere acción", "message_needaction_counter": "Cantidad de acciones", "message_has_error": "Error de entrega",
 "message_has_error_counter": "Cantidad de errores", "message_attachment_count": "Cantidad de adjuntos", "rating_ids": "Calificaciones",
 "website_message_ids": "Mensajes del sitio web", "message_has_sms_error": "Error de entrega de SMS", "create_uid": "Creado por", "create_date": "Creado el",
 "write_uid": "Última modificación por", "write_date": "Última modificación el", "x_name": "Número", "x_active": "Activo"}
for mo in MS:
    for f, t in BASE.items(): etiqueta(mo, f, t)
etiqueta("x_hys_control_legal", "x_name", "Control"); etiqueta("x_hys_control_legal", "x_referencia", "Referencia legal")
etiqueta("x_hys_control_legal", "x_fecha_servicio", "Fecha último servicio"); etiqueta("x_hys_control_legal", "x_protocolo", "Protocolo vigente")
etiqueta("x_hys_evento", "x_inv_vencimiento", "Fecha límite de investigación"); etiqueta("x_hys_evento", "x_ambito", "Ámbito")
etiqueta("x_hys_evento", "x_aviso_telefonico", "Aviso telefónico"); etiqueta("x_hys_evento", "x_cargado_en_plazo", "Cargado en plazo",
    "Se cargó dentro de las 24 h del evento.")
etiqueta("x_hys_desvio", "x_fecha_vencimiento", "Fecha límite", "Crítico +24 h · Mayor +5 días hábiles · Menor +15 días (parámetros hys.desvio.plazo_*).")
etiqueta("x_hys_desvio", "x_responsable_id", "Responsable"); etiqueta("x_hys_desvio", "x_fecha_deteccion", "Fecha de detección")
etiqueta("x_hys_desvio", "x_que_se_hizo", "Acción correctiva (qué se hizo)"); etiqueta("x_hys_desvio", "x_foto_cierre", "Foto de la corrección (evidencia)")
etiqueta("x_hys_desvio", "x_cerrado_por", "Cerrado por"); etiqueta("x_hys_desvio", "x_origen_formulario", "Ficha de origen")
etiqueta("x_hys_desvio", "x_linea_id", "Ítem de inspección"); etiqueta("x_hys_desvio", "x_descripcion", "Descripción")

# ---------------------------------------------------------------- vistas
CH = "<chatter/>"
FORM = {
"x_hys_control_legal": """<form string="Control legal"><header><field name="x_estado" widget="statusbar"/></header><sheet>
<div class="oe_title"><label for="x_name"/><h1><field name="x_name" placeholder="Ej.: Medición de puesta a tierra"/></h1></div>
<group><group><field name="x_referencia"/><field name="x_donde"/><field name="x_periodicidad"/><field name="x_prioridad"/></group>
<group><field name="x_fecha_servicio"/><field name="x_fecha_vence"/><field name="x_proveedor"/><field name="x_responsable_id"/></group></group>
<notebook><page string="Historial de cargas" name="cargas"><field name="x_carga_ids" readonly="1"><list><field name="x_name"/><field name="x_estado"/>
<field name="x_fecha_servicio"/><field name="x_fecha_vence"/><field name="x_proveedor"/><field name="x_cargado_por"/></list></field></page></notebook>
</sheet>%s</form>""" % CH,
"x_hys_vencimiento_carga": """<form string="Carga de vencimiento legal"><header><field name="x_estado" widget="statusbar"/></header><sheet>
<div class="oe_title"><label for="x_name"/><h1><field name="x_name" readonly="1"/></h1></div>
<group><group><field name="x_control_id"/><field name="x_fecha_servicio"/><field name="x_fecha_vence"/><field name="x_proveedor"/></group>
<group><field name="x_protocolo" filename="x_protocolo_nombre"/><field name="x_protocolo_nombre" invisible="1"/><field name="x_cargado_por" readonly="1"/><field name="x_fecha_recepcion" readonly="1"/></group></group>
</sheet>%s</form>""" % CH,
"x_hys_evento": """<form string="Registro de accidentes"><header><field name="x_estado" widget="statusbar"/></header><sheet>
<div class="oe_title"><label for="x_name"/><h1><field name="x_name" readonly="1"/></h1></div>
<group><group><field name="x_fecha_hora"/><field name="x_tipo"/><field name="x_ambito"/>
<field name="x_ot_id" invisible="x_ambito != 'obra'" required="x_ambito == 'obra'"/><field name="x_sector"/><field name="x_persona_id"/></group>
<group><field name="x_aviso_telefonico" required="x_tipo in ('baja', 'sinbaja')"/><field name="x_aviso_hora" required="x_tipo in ('baja', 'sinbaja')"/>
<field name="x_cargado_en_plazo" readonly="1"/><field name="x_inv_vencimiento"/></group></group>
</sheet>%s</form>""" % CH,
"x_hys_desvio": """<form string="Desvío"><header><field name="x_estado" widget="statusbar" statusbar_visible="abierto,en_curso,vencido,cerrado"/></header><sheet>
<div class="oe_title"><label for="x_name"/><h1><field name="x_name" readonly="1"/></h1></div>
<group string="Detección"><group><field name="x_origen_formulario"/><field name="x_inspeccion_id" invisible="not x_inspeccion_id"/><field name="x_linea_id" invisible="not x_linea_id"/>
<field name="x_ats_id" invisible="not x_ats_id"/><field name="x_ats_linea_id" invisible="not x_ats_linea_id"/><field name="x_evento_id" invisible="not x_evento_id"/>
<field name="x_item_codigo"/><field name="x_ambito"/><field name="x_ot_id" invisible="x_ambito != 'obra'"/><field name="x_sector" invisible="x_ambito != 'fabrica'"/></group>
<group><field name="x_criticidad"/><field name="x_accion_inmediata"/><field name="x_fecha_deteccion"/><field name="x_fecha_vencimiento" readonly="1"/>
<field name="x_responsable_id"/><field name="x_vencido" readonly="1"/></group></group>
<group><field name="x_descripcion"/><field name="x_foto_deteccion" widget="image" options="{'size': [240, 240]}"/></group>
<group string="Cierre (F07)"><group><field name="x_que_se_hizo" required="x_estado == 'cerrado'"/><field name="x_foto_cierre" widget="image" options="{'size': [240, 240]}" required="x_estado == 'cerrado'"/>
<field name="x_firma_cierre" widget="signature"/></group>
<group><field name="x_fecha_cierre"/><field name="x_cerrado_por"/><field name="x_cerrado_en_plazo" readonly="1"/><field name="x_verificado_hys"/><field name="x_verificado_el"/>
<field name="x_motivo_anulacion" invisible="x_estado != 'anulado'" required="x_estado == 'anulado'"/></group></group>
</sheet>%s</form>""" % CH}
SEARCH = {
"x_hys_control_legal": """<search string="Buscar controles"><field name="x_name"/><field name="x_referencia"/><field name="x_responsable_id"/>
<filter name="vigente" string="Vigentes" domain="[('x_estado', '=', 'vigente')]"/><filter name="vencido" string="Vencidos" domain="[('x_estado', '=', 'vencido')]"/>
<filter name="sin" string="Sin estado o sin protocolo" domain="[('x_estado', 'in', ['sin_estado', 'sin_protocolo'])]"/>
<group><filter name="g_estado" string="Estado" context="{'group_by': 'x_estado'}"/><filter name="g_prio" string="Prioridad" context="{'group_by': 'x_prioridad'}"/></group></search>""",
"x_hys_vencimiento_carga": """<search string="Buscar cargas"><field name="x_name"/><field name="x_control_id"/><field name="x_proveedor"/>
<group><filter name="g_control" string="Control" context="{'group_by': 'x_control_id'}"/></group></search>""",
"x_hys_evento": """<search string="Buscar eventos"><field name="x_name"/><field name="x_persona_id"/><field name="x_ot_id"/>
<filter name="lesion" string="Con lesión" domain="[('x_tipo', 'in', ['baja', 'sinbaja'])]"/><filter name="abiertos" string="Sin investigar" domain="[('x_estado', '!=', 'investigado')]"/>
<group><filter name="g_tipo" string="Tipo" context="{'group_by': 'x_tipo'}"/><filter name="g_amb" string="Ámbito" context="{'group_by': 'x_ambito'}"/></group></search>""",
"x_hys_desvio": """<search string="Buscar desvíos"><field name="x_name"/><field name="x_descripcion"/><field name="x_ot_id"/><field name="x_responsable_id"/>
<filter name="pendientes" string="Pendientes" domain="[('x_estado', 'in', ['abierto', 'en_curso', 'vencido'])]"/>
<filter name="vencidos" string="Vencidos" domain="[('x_estado', '=', 'vencido')]"/><filter name="criticos" string="Críticos" domain="[('x_criticidad', '=', 'critico')]"/>
<filter name="cerrados" string="Cerrados" domain="[('x_estado', '=', 'cerrado')]"/>
<group><filter name="g_estado" string="Estado" context="{'group_by': 'x_estado'}"/><filter name="g_origen" string="Ficha de origen" context="{'group_by': 'x_origen_formulario'}"/>
<filter name="g_grav" string="Gravedad" context="{'group_by': 'x_criticidad'}"/></group></search>"""}
LIST_DES = """<list string="Desvíos" decoration-danger="x_estado == 'vencido'" decoration-muted="x_estado in ('cerrado', 'anulado')"><field name="x_name"/><field name="x_origen_formulario"/>
<field name="x_ambito"/><field name="x_ot_id" optional="show"/><field name="x_descripcion"/><field name="x_criticidad"/><field name="x_responsable_id"/>
<field name="x_fecha_vencimiento"/><field name="x_estado" widget="badge"/></list>"""
ACC = {"x_hys_evento": 2614, "x_hys_control_legal": 2615, "x_hys_vencimiento_carga": 2616, "x_hys_desvio": 2617}
for mo in MS:
    for t, arch in (("form", FORM[mo]), ("search", SEARCH[mo])):
        nom = f"{mo}.{t}.hys"; ya = c("ir.ui.view", "search", [("name", "=", nom)])
        if ya: c("ir.ui.view", "write", ya, {"arch": arch}); i = ya[0]
        else: i = c("ir.ui.view", "create", {"name": nom, "model": mo, "type": t, "arch": arch, "priority": 10}); OUT.setdefault("vistas", {})[nom] = i
        if t == "search": c("ir.actions.act_window", "write", [ACC[mo]], {"search_view_id": i})
lista = c("ir.ui.view", "search", [("name", "=", "x_hys_desvio.list.hys")])
c("ir.ui.view", "write", lista, {"arch": LIST_DES})
AYUDA = {2614: "<p class='o_view_nocontent_smiling_face'>Todavía no hay eventos registrados</p><p>Se cargan desde la app hys-carga (F05).</p>",
         2615: "<p class='o_view_nocontent_smiling_face'>Cargá los controles legales</p><p>Cada control tiene su periodicidad; las cargas F06 actualizan su estado.</p>",
         2616: "<p class='o_view_nocontent_smiling_face'>Todavía no hay cargas</p><p>Se cargan desde la app hys-carga (F06).</p>",
         2617: "<p class='o_view_nocontent_smiling_face'>No hay desvíos</p><p>Cada «No» de F02, F03, F04 y F08 genera uno; se cierran con F07.</p>"}
for a, h in AYUDA.items(): c("ir.actions.act_window", "write", [a], {"help": h}, context=ES)
c("ir.actions.act_window", "write", [2617], {"context": "{'default_x_estado': 'abierto', 'search_default_pendientes': 1}"})
c("ir.ui.menu", "write", [1362], {"name": "F07 · Cierre de desvío"}, context=ES); c("ir.ui.menu", "write", [1362], {"name": "F07 · Cierre de desvío"})
print(json.dumps(OUT, ensure_ascii=False))
