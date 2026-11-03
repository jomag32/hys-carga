#!/usr/bin/env python3
"""HyS · Sector como tabla (x_hys_sector) en lugar de selection fija — alcance ATS (F08).

Modelos migrados: x_hys_turno, x_hys_ats, x_hys_ats_linea (related), x_hys_inspector.
Crea x_hys_sector (x_name, x_codigo, x_ambito, x_plantilla, x_requiere_ot, x_secuencia, x_active),
acceso, vistas, acción y menú «Higiene y Seguridad > Configuración > Sectores», siembra filas
desde la selection actual, agrega x_sector_id (many2one) al lado de x_sector, copia datos,
pasa vistas/filtros/reporte PDF a x_sector_id, deja x_sector oculto y no obligatorio
(sincronizado por automatización cuando el código existe en la selection vieja) y escribe un backup JSON.

Uso:
  python odoo-sector-tabla.py                 # --dry-run (por defecto): solo lee
  python odoo-sector-tabla.py --apply [--backup FILE]
  python odoo-sector-tabla.py --rollback FILE [--apply] [--force]
Entorno: ODOO_URL, ODOO_DB, ODOO_UID (2), ODOO_API_KEY (o ODOO_API_KEY_ADMIN_ARME). Nunca imprime secretos.
Idempotente: cada paso busca antes de crear."""
from __future__ import annotations
import json, os, re, sys, xmlrpc.client
from datetime import datetime

ARGS = sys.argv[1:]
APPLY = "--apply" in ARGS
FORCE = "--force" in ARGS
def arg(n):
    return next((ARGS[i + 1] for i, a in enumerate(ARGS) if a == n and i + 1 < len(ARGS)), None)
ROLLBACK = arg("--rollback")
BACKUP = arg("--backup") or f"backup-sector-tabla-{datetime.now():%Y%m%d-%H%M%S}.json"

U = os.environ.get("ODOO_URL", "https://cooperativa-de-trabajo-el-sol.odoo.com").rstrip("/")
D = os.environ.get("ODOO_DB", "cooperativa-de-trabajo-el-sol")
UID = int(os.environ.get("ODOO_UID", "2"))
K = os.environ.get("ODOO_API_KEY") or os.environ["ODOO_API_KEY_ADMIN_ARME"]
_m = xmlrpc.client.ServerProxy(U + "/xmlrpc/2/object", allow_none=True)
def c(mo, me, *a, **kw): return _m.execute_kw(D, UID, K, mo, me, list(a), kw)

PLAN: list[str] = []
def step(msg, fn=None):
    PLAN.append(msg); print(("APPLY  " if APPLY else "WOULD  ") + msg)
    return fn() if (APPLY and fn) else None

SECTOR = "x_hys_sector"
MODELOS = ["x_hys_turno", "x_hys_ats", "x_hys_inspector"]      # x_sector -> x_sector_id (copia)
RELATED = {"x_hys_ats_linea": "x_ats_id.x_sector_id"}             # related stored
PLANTILLA = {"deposito": "F08_DEP", "logistica": "F08_LOG", "obra": "F08_OBRA"}
MENU_CONFIG = 1354
ACL = {216: (1, 1, 1, 1), 218: (1, 1, 1, 0), 217: (1, 0, 0, 0), 219: (1, 0, 0, 0)}  # Desarrollo, HyS resp., API, Inspector
VISTAS = [8502, 8494, 8495, 8496, 8497, 8499, 8500, 8501, 8573, 8524]
AUTO_SYNC = "HyS · Sector: x_sector_id → x_sector (compat)"
AUTO_CODE = "HyS · Sector: código automático"

CODE_SYNC = """# HyS · mantiene el campo viejo x_sector (selection) alineado con x_sector_id, para rollback y lectores viejos.
for r in records:
    sel = [k for k, _ in r._fields['x_sector'].selection] if hasattr(r._fields['x_sector'], 'selection') else []
    cod = r.x_sector_id.x_codigo or False
    nuevo = cod if cod in sel else False
    if r.x_sector != nuevo:
        r.with_context(hys_sector_sync=True).write({'x_sector': nuevo})
"""
CODE_CODIGO = """# HyS · un sector creado al vuelo (quick-create) recibe código sec_<id>, plantilla F08_DEP y ámbito ATS.
for r in records:
    v = {}
    if not r.x_codigo: v['x_codigo'] = 'sec_%d' % r.id
    if not r.x_plantilla: v['x_plantilla'] = 'F08_DEP'
    if not r.x_ambito: v['x_ambito'] = 'ats'
    if v: r.write(v)
"""

def model_id(mo):
    r = c("ir.model", "search", [["model", "=", mo]], limit=1); return r[0] if r else None
def field(mo, n):
    r = c("ir.model.fields", "search_read", [["model", "=", mo], ["name", "=", n]], fields=["id", "required", "ttype", "relation", "related"], limit=1)
    return r[0] if r else None
def selection(mo, n):
    return c(mo, "fields_get", [n], attributes=["selection"]).get(n, {}).get("selection") or []

def nuevo_arch(vid, arch):
    a = arch
    a = re.sub(r"\('x_sector'\s*,\s*'='\s*,\s*'(\w+)'\)", r"('x_sector_id.x_codigo','=','\1')", a)
    a = a.replace("[('x_sector','=',x_sector)]", "[('x_sector_id','=',x_sector_id)]")
    a = a.replace("invisible=\"x_sector != 'obra'\"", 'invisible="not x_sector_requiere_ot"')
    a = a.replace("required=\"x_sector == 'obra'\"", 'required="x_sector_requiere_ot"')
    a = a.replace("'group_by':'x_sector'", "'group_by':'x_sector_id'")
    a = a.replace('color="x_sector"', 'color="x_sector_id"')
    a = a.replace("field[@name='x_sector']", "field[@name='x_sector_id']")
    a = a.replace('t-field="o.x_sector"', 't-field="o.x_sector_id"')
    if vid == 8502:   # Turnos de ATS (editable): many2one con «Crear …» al vuelo
        a = a.replace('<field name="x_sector"/>', '<field name="x_sector_id" required="1" domain="[(\'x_ambito\',\'in\',[\'ats\',\'ambos\',False])]"/>')
    elif vid == 8494: # form ATS
        a = a.replace('<field name="x_sector"/>', '<field name="x_sector_id" options="{\'no_create\': True}"/><field name="x_sector_requiere_ot" invisible="1"/>')
    else:
        a = a.replace('<field name="x_sector"/>', '<field name="x_sector_id"/>')
    return a

def backup_snapshot():
    snap = {"fecha": datetime.now().isoformat(), "odoo": U, "db": D,
            "vistas": c("ir.ui.view", "read", VISTAS, fields=["id", "name", "arch_db"]),
            "campos_x_sector": {mo: field(mo, "x_sector") for mo in MODELOS + list(RELATED)},
            "datos": {mo: c(mo, "search_read", [], fields=["id", "x_sector"], context={"active_test": False}) for mo in MODELOS},
            "creado": {}}
    return snap

def migrate():
    snap = backup_snapshot()
    creado = snap["creado"]
    def reg(k, v):
        if v: creado.setdefault(k, []).append(v)
        return v
    # 1 · modelo
    mid = model_id(SECTOR)
    if mid: print("EXISTS model", SECTOR, mid)
    else:
        mid = reg("model", step(f"create model {SECTOR} (x_name, x_codigo, x_ambito, x_plantilla, x_requiere_ot, x_secuencia, x_active)", lambda: c("ir.model", "create", {
            "model": SECTOR, "name": "HyS · Sectores", "state": "manual", "order": "x_secuencia, id",
            "field_id": [(0, 0, {"name": "x_name", "ttype": "char", "field_description": "Sector", "required": True, "translate": False}),
                         (0, 0, {"name": "x_codigo", "ttype": "char", "field_description": "Código", "copied": False}),
                         (0, 0, {"name": "x_ambito", "ttype": "selection", "field_description": "Ámbito",
                                 "selection_ids": [(0, 0, {"value": "ats", "name": "ATS / turnos", "sequence": 1}),
                                                   (0, 0, {"value": "fabrica", "name": "Fábrica (F03/F05/desvíos)", "sequence": 2}),
                                                   (0, 0, {"value": "ambos", "name": "Ambos", "sequence": 3})]}),
                         (0, 0, {"name": "x_plantilla", "ttype": "selection", "field_description": "Plantilla F08",
                                 "selection_ids": [(0, 0, {"value": "F08_DEP", "name": "F08 planta (Depósito)", "sequence": 1}),
                                                   (0, 0, {"value": "F08_LOG", "name": "F08 Logística", "sequence": 2}),
                                                   (0, 0, {"value": "F08_OBRA", "name": "F08 Obra", "sequence": 3})]}),
                         (0, 0, {"name": "x_requiere_ot", "ttype": "boolean", "field_description": "Pide OF (obra)"}),
                         (0, 0, {"name": "x_secuencia", "ttype": "integer", "field_description": "Orden"}),
                         (0, 0, {"name": "x_active", "ttype": "boolean", "field_description": "Activo"})]})))
    # 2 · accesos
    for g, (r, w, cr, u) in ACL.items():
        if APPLY and mid and c("ir.model.access", "search", [["model_id", "=", mid], ["group_id", "=", g]]): continue
        reg("access", step(f"access {SECTOR} group {g} r{r}w{w}c{cr}u{u}", lambda g=g, r=r, w=w, cr=cr, u=u: c("ir.model.access", "create", {
            "name": f"{SECTOR} g{g}", "model_id": mid, "group_id": g, "perm_read": bool(r), "perm_write": bool(w), "perm_create": bool(cr), "perm_unlink": bool(u)})))
    # 3 · semillas desde la selection actual (x_hys_turno ∪ x_hys_ats)
    vals = {}
    for mo in ("x_hys_turno", "x_hys_ats", "x_hys_inspector"):
        for k, lbl in selection(mo, "x_sector"): vals.setdefault(k, lbl)
    existentes = {r["x_codigo"]: r["id"] for r in c(SECTOR, "search_read", [], fields=["x_codigo"], context={"active_test": False})} if model_id(SECTOR) else {}
    ids = dict(existentes)
    for i, (k, lbl) in enumerate(vals.items()):
        if k in existentes: print("EXISTS sector", k, existentes[k]); continue
        ids[k] = reg("sector", step(f"seed sector code={k!r} name={lbl!r} plantilla={PLANTILLA.get(k, 'F08_DEP')} requiere_ot={k == 'obra'}",
            lambda k=k, lbl=lbl, i=i: c(SECTOR, "create", {"x_name": lbl, "x_codigo": k, "x_ambito": "ats", "x_plantilla": PLANTILLA.get(k, "F08_DEP"),
                                                         "x_requiere_ot": k == "obra", "x_secuencia": (i + 1) * 10, "x_active": True})))
    # 4 · vistas / acción / menú de Sectores
    if not (APPLY and c("ir.ui.view", "search", [["model", "=", SECTOR], ["type", "=", "list"]])):
        reg("view", step(f"list view {SECTOR} (editable)", lambda: c("ir.ui.view", "create", {"name": f"{SECTOR}.list.hys", "model": SECTOR, "type": "list",
            "arch": '<list editable="bottom"><field name="x_secuencia" widget="handle"/><field name="x_name"/><field name="x_codigo"/><field name="x_ambito"/>'
                    '<field name="x_plantilla"/><field name="x_requiere_ot"/><field name="x_active" widget="boolean_toggle"/></list>'})))
    if not (APPLY and c("ir.ui.view", "search", [["model", "=", SECTOR], ["type", "=", "search"]])):
        reg("view", step(f"search view {SECTOR}", lambda: c("ir.ui.view", "create", {"name": f"{SECTOR}.search.hys", "model": SECTOR, "type": "search",
            "arch": '<search><field name="x_name"/><field name="x_codigo"/><filter name="ats" string="ATS" domain="[(\'x_ambito\',\'in\',[\'ats\',\'ambos\'])]"/>'
                    '<filter name="archivados" string="Archivados" domain="[(\'x_active\',\'=\',False)]"/></search>'})))
    act = c("ir.actions.act_window", "search", [["res_model", "=", SECTOR]], limit=1)
    act = act[0] if act else reg("action", step("action «Sectores»", lambda: c("ir.actions.act_window", "create", {"name": "Sectores", "res_model": SECTOR, "view_mode": "list,form"})))
    if not (APPLY and c("ir.ui.menu", "search", [["parent_id", "=", MENU_CONFIG], ["name", "=", "Sectores"]])):
        reg("menu", step(f"menu Higiene y Seguridad > Configuración > Sectores (parent {MENU_CONFIG}, seq 35)", lambda: c("ir.ui.menu", "create", {
            "name": "Sectores", "parent_id": MENU_CONFIG, "action": f"ir.actions.act_window,{act}", "sequence": 35})))
    if not c("base.automation", "search", [["name", "=", AUTO_CODE]]):
        def a_code():
            s = c("ir.actions.server", "create", {"name": AUTO_CODE + " (código)", "model_id": mid, "state": "code", "usage": "base_automation", "code": CODE_CODIGO})
            reg("server_action", s)
            return c("base.automation", "create", {"name": AUTO_CODE, "model_id": mid, "trigger": "on_create", "action_server_ids": [(6, 0, [s])]})
        reg("automation", step(f"automation «{AUTO_CODE}» (on_create {SECTOR})", a_code))
    # 5 · campos nuevos
    for mo in MODELOS:
        if field(mo, "x_sector_id"): print("EXISTS field", mo, "x_sector_id"); continue
        reg("field", step(f"field {mo}.x_sector_id many2one {SECTOR} (ondelete restrict)", lambda mo=mo: c("ir.model.fields", "create", {
            "model_id": model_id(mo), "name": "x_sector_id", "ttype": "many2one", "relation": SECTOR, "field_description": "Sector",
            "on_delete": "restrict", "tracking": 1 if mo != "x_hys_inspector" else 0})))
    for mo, rel in RELATED.items():
        if field(mo, "x_sector_id"): print("EXISTS field", mo, "x_sector_id"); continue
        reg("field", step(f"field {mo}.x_sector_id related {rel} (stored, readonly)", lambda mo=mo, rel=rel: c("ir.model.fields", "create", {
            "model_id": model_id(mo), "name": "x_sector_id", "ttype": "many2one", "relation": SECTOR, "field_description": "Sector",
            "related": rel, "store": True, "readonly": True})))
    if not field("x_hys_ats", "x_sector_requiere_ot"):
        reg("field", step("field x_hys_ats.x_sector_requiere_ot related x_sector_id.x_requiere_ot (not stored)", lambda: c("ir.model.fields", "create", {
            "model_id": model_id("x_hys_ats"), "name": "x_sector_requiere_ot", "ttype": "boolean", "field_description": "Sector pide OF",
            "related": "x_sector_id.x_requiere_ot", "store": False, "readonly": True})))
    # 6 · copiar datos
    for mo in MODELOS:
        por = {}
        for r in snap["datos"][mo]:
            if r["x_sector"]: por.setdefault(r["x_sector"], []).append(r["id"])
        for k, rid in por.items():
            step(f"copy {mo}: {len(rid)} rows x_sector={k!r} → x_sector_id={ids.get(k, '<new ' + k + '>')}",
                 lambda mo=mo, rid=rid, k=k: c(mo, "write", rid, {"x_sector_id": ids[k]}, context={"active_test": False, "tracking_disable": True}))
    # 7 · x_sector viejo: no obligatorio + automatización de sincronía
    for mo in ("x_hys_turno", "x_hys_ats"):
        f = field(mo, "x_sector")
        if f and f["required"]:
            step(f"{mo}.x_sector required → False (kept, hidden from views)", lambda f=f: c("ir.model.fields", "write", [f["id"]], {"required": False}))
        nom = f"{AUTO_SYNC} [{mo}]"
        if not c("base.automation", "search", [["name", "=", nom]]):
            def a_sync(mo=mo, nom=nom):
                s = c("ir.actions.server", "create", {"name": nom + " (código)", "model_id": model_id(mo), "state": "code", "usage": "base_automation", "code": CODE_SYNC})
                reg("server_action", s)
                fid = field(mo, "x_sector_id")["id"]
                return c("base.automation", "create", {"name": nom, "model_id": model_id(mo), "trigger": "on_create_or_write",
                                                      "trigger_field_ids": [(6, 0, [fid])], "action_server_ids": [(6, 0, [s])]})
            reg("automation", step(f"automation «{nom}» (on_create_or_write x_sector_id)", a_sync))
    # 8 · vistas (si los campos nuevos ya existen; en dry-run se muestra el diff)
    for v in snap["vistas"]:
        new = nuevo_arch(v["id"], v["arch_db"])
        if new == v["arch_db"]: print("UNCHANGED view", v["id"], v["name"]); continue
        diff = [(a.strip()[:160], b.strip()[:160]) for a, b in zip(v["arch_db"].splitlines(), new.splitlines()) if a != b]
        step(f"view {v['id']} {v['name']}: {len(diff)} line(s) x_sector → x_sector_id", lambda v=v, new=new: c("ir.ui.view", "write", [v["id"]], {"arch_db": new}))
        for a, b in diff: print("        -", a, "\n        +", b)
    # 9 · comprobación
    if APPLY:
        for mo in MODELOS:
            sin = c(mo, "search_count", [["x_sector", "!=", False], ["x_sector_id", "=", False]], context={"active_test": False})
            print(f"CHECK {mo}: rows with old sector but no x_sector_id = {sin}")
    return snap

def rollback(path):
    snap = json.load(open(path))
    cr = snap.get("creado", {})
    # bloquear si hay datos con sectores que no existen en la selection vieja (se perderían)
    for mo in ("x_hys_turno", "x_hys_ats"):
        if field(mo, "x_sector_id"):
            n = c(mo, "search_count", [["x_sector_id", "!=", False], ["x_sector", "=", False]], context={"active_test": False})
            if n and not FORCE: raise SystemExit(f"{mo}: {n} rows use a sector not present in the old selection. Reassign them or pass --force.")
    for v in snap["vistas"]:
        step(f"restore view {v['id']} {v['name']}", lambda v=v: c("ir.ui.view", "write", [v["id"]], {"arch_db": v["arch_db"]}))
    for mo, f in snap["campos_x_sector"].items():
        if f and f.get("required"):
            step(f"{mo}.x_sector required → True", lambda f=f: c("ir.model.fields", "write", [f["id"]], {"required": True}))
    for mo, rows in snap["datos"].items():   # el campo viejo nunca se tocó; se re-escribe por seguridad
        por = {}
        for r in rows: por.setdefault(r["x_sector"], []).append(r["id"])
        for k, rid in por.items():
            if k: step(f"restore {mo}.x_sector={k!r} on {len(rid)} rows", lambda mo=mo, rid=rid, k=k: c(mo, "write", rid, {"x_sector": k}, context={"active_test": False}))
    for key, model in (("automation", "base.automation"), ("server_action", "ir.actions.server"), ("menu", "ir.ui.menu"),
                       ("action", "ir.actions.act_window"), ("view", "ir.ui.view")):
        for i in cr.get(key, []):
            step(f"unlink {model} {i}", lambda model=model, i=i: c(model, "unlink", [i]))
    for i in reversed(cr.get("field", [])):   # related primero (creados después)
        step(f"unlink ir.model.fields {i}", lambda i=i: c("ir.model.fields", "unlink", [i]))
    for i in cr.get("access", []):
        step(f"unlink ir.model.access {i}", lambda i=i: c("ir.model.access", "unlink", [i]))
    for i in cr.get("model", []):
        step(f"unlink ir.model {i} ({SECTOR}, drops its rows)", lambda i=i: c("ir.model", "unlink", [i]))

if __name__ == "__main__":
    print(f"mode={'ROLLBACK' if ROLLBACK else 'MIGRATE'} {'APPLY' if APPLY else 'DRY-RUN'} · {U} db={D} uid={UID}")
    if ROLLBACK:
        rollback(ROLLBACK)
    else:
        snap = migrate()
        if APPLY:
            json.dump(snap, open(BACKUP, "w"), ensure_ascii=False, indent=1, default=str); print("backup →", BACKUP)
        else:
            out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dry-run-snapshot.json")
            json.dump(snap, open(out, "w"), ensure_ascii=False, indent=1, default=str); print("dry-run snapshot (pre-change state) →", out)
    print(f"{len(PLAN)} step(s) {'applied' if APPLY else 'planned (nothing written)'}")
