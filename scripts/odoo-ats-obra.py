#!/usr/bin/env python3
"""ATS de obra (F08 · sector obra + x_ot_id + plantilla F08_OBRA + turno).
Por defecto SIMULA. Aplicar: --aplicar. Backup: --backup FILE. Rollback: --rollback FILE --aplicar.
NO ejecutar hasta que Jorge revise los controles BORRADOR y autorice el cambio en Odoo.
Entorno: ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY."""
from __future__ import annotations
import json, os, sys, xmlrpc.client
from datetime import datetime, timezone

APLICAR = "--aplicar" in sys.argv
BACKUP = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--backup"), None)
ROLLBACK = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--rollback"), None)

U = os.environ["ODOO_URL"]
D = os.environ["ODOO_DB"]
UID = int(os.environ.get("ODOO_UID", "2"))
K = os.environ["ODOO_API_KEY"]
m = xmlrpc.client.ServerProxy(U.rstrip("/") + "/xmlrpc/2/object", allow_none=True)

def c(mo, me, *a, **kw):
    return m.execute_kw(D, UID, K, mo, me, list(a), kw)

def log(msg):
    print(("APLICA " if APLICAR else "HARÍA  ") + msg)

CONTROLES = [
    ("F08O-01", "Personal instruido y tareas del turno informadas", False),
    ("F08O-02", "EPP completo según la tarea (casco, calzado, guantes, anteojos; arnés si hay altura)", True),
    ("F08O-03", "Trabajo en altura: andamios, escaleras, plataformas y línea de vida verificados", True),
    ("F08O-04", "Izaje / hidrogrúa de terceros: operador habilitado, eslingas OK, área señalizada", True),
    ("F08O-05", "Soldadura / corte / amolado: área despejada, pantallas y extintor a mano", True),
    ("F08O-06", "Riesgo eléctrico: tableros, cables, fichas y herramientas en condiciones", True),
    ("F08O-07", "Excavaciones / zanjas: taludes, apuntalamiento y accesos seguros (N/A si no hay)", False),
    ("F08O-08", "Señalización y delimitación de la zona de trabajo (peatonal y vehicular)", False),
    ("F08O-09", "Orden y limpieza: acopios estables, vías libres, sin materiales sueltos en altura", False),
    ("F08O-10", "Permisos de trabajo / trabajo en caliente / aislamiento de energías, cuando aplique", True),
]
BLOQUE = "Chequeo antes de empezar (ATS-OBRA-001) · BORRADOR"
VERSION = "BORRADOR 2026-10-27"

def model_id(name):
    ids = c("ir.model", "search", [["model", "=", name]], limit=1)
    if not ids:
        raise SystemExit(f"No está el modelo {name}")
    return ids[0]

def field_id(model, name):
    ids = c("ir.model.fields", "search", [["model", "=", model], ["name", "=", name]], limit=1)
    return ids[0] if ids else None

def selection_values(model, field):
    fg = c(model, "fields_get", [field], attributes=["selection"])
    return list(fg.get(field, {}).get("selection") or [])

def ensure_selection_value(model, field_name, value, label, sequence=90):
    """Agrega un valor a un selection de Studio (ir.model.fields.selection) si falta."""
    cur = selection_values(model, field_name)
    if any(v == value for v, _ in cur):
        log(f"selection {model}.{field_name} ya tiene «{value}»")
        return None
    fid = field_id(model, field_name)
    if not fid:
        raise SystemExit(f"Falta el campo {model}.{field_name}")
    log(f"agregar selection {model}.{field_name} = {value} ({label})")
    if not APLICAR:
        return None
    return c("ir.model.fields.selection", "create", [{
        "field_id": fid, "value": value, "name": label, "sequence": sequence
    }])

def ensure_ot_id():
    if field_id("x_hys_ats", "x_ot_id"):
        log("x_hys_ats.x_ot_id ya existe")
        return field_id("x_hys_ats", "x_ot_id")
    mid = model_id("x_hys_ats")
    log("crear x_hys_ats.x_ot_id many2one → project.project")
    if not APLICAR:
        return None
    return c("ir.model.fields", "create", [{
        "name": "x_ot_id", "model_id": mid, "model": "x_hys_ats",
        "field_description": "OF / Proyecto", "ttype": "many2one",
        "relation": "project.project", "on_delete": "set null",
        "copied": False, "required": False,
    }])

def ensure_items():
    creados = []
    for i, (cod, nombre, critico) in enumerate(CONTROLES, 1):
        ya = c("x_hys_item_plantilla", "search", [
            ["x_formulario", "=", "F08_OBRA"], ["x_codigo", "=", cod]
        ], limit=1)
        if ya:
            log(f"ítem {cod} ya existe id={ya[0]}")
            creados.append(ya[0])
            continue
        vals = {
            "x_codigo": cod, "x_formulario": "F08_OBRA", "x_bloque": BLOQUE,
            "x_name": nombre, "x_critico": critico, "x_secuencia": i * 10,
            "x_active": True, "x_version": VERSION,
        }
        # x_admite_na si el campo existe
        fg = c("x_hys_item_plantilla", "fields_get", ["x_admite_na"], attributes=["type"])
        if "x_admite_na" in fg:
            vals["x_admite_na"] = not critico
        log(f"crear ítem {cod} ★={critico}")
        if APLICAR:
            creados.append(c("x_hys_item_plantilla", "create", [vals]))
        else:
            creados.append(None)
    return creados

def ensure_turno():
    ya = c("x_hys_turno", "search", [
        ["x_sector", "=", "obra"], ["x_codigo_ats", "=", "ATS-OBRA-001"]
    ], limit=1)
    if ya:
        log(f"turno obra ya existe id={ya[0]}")
        return ya[0]
    vals = {
        "x_name": "Jornada", "x_codigo": "jornada", "x_sector": "obra",
        "x_hora_inicio": 7.0, "x_dias": "0,1,2,3,4",
        "x_codigo_ats": "ATS-OBRA-001", "x_secuencia": 10, "x_active": True,
    }
    log("crear turno Jornada sector=obra ATS-OBRA-001")
    if not APLICAR:
        return None
    return c("x_hys_turno", "create", [vals])

def patch_views():
    """Inserta x_ot_id en form/tree si no está. Best-effort sobre vistas Studio."""
    views = c("ir.ui.view", "search_read", [
        ["model", "=", "x_hys_ats"], ["type", "in", ["form", "tree", "list"]]
    ], fields=["id", "name", "type", "arch_db"], limit=20)
    for v in views:
        arch = v.get("arch_db") or ""
        if "x_ot_id" in arch:
            log(f"vista {v['id']} {v['name']} ya menciona x_ot_id")
            continue
        if v["type"] in ("tree", "list"):
            # No poner x_ot_id en la lista: Owl ListRenderer rompe si la columna
            # aparece sin meta del campo (New→descartar). La OF va solo en el form.
            log(f"vista lista {v['id']} {v['name']}: se deja sin x_ot_id (solo form)")
            continue
        else:
            # form: después de x_sector
            if 'name="x_sector"' in arch:
                nuevo = arch.replace(
                    'name="x_sector"',
                    'name="x_sector"/><field name="x_ot_id" '
                    'invisible="x_sector != \'obra\'" '
                    'required="x_sector == \'obra\'"',
                    1,
                )
            else:
                log(f"vista form {v['id']}: no se encontró x_sector; revisar a mano")
                continue
        log(f"actualizar vista {v['id']} {v['name']} (+ x_ot_id)")
        if APLICAR:
            c("ir.ui.view", "write", [v["id"]], {"arch_db": nuevo})

def do_backup(path):
    data = {
        "cuando": datetime.now(timezone.utc).isoformat(),
        "x_hys_ats.x_sector": selection_values("x_hys_ats", "x_sector"),
        "x_hys_turno.x_sector": selection_values("x_hys_turno", "x_sector"),
        "x_ot_id": bool(field_id("x_hys_ats", "x_ot_id")),
        "items_obra": c("x_hys_item_plantilla", "search_read",
            [["x_formulario", "=", "F08_OBRA"]],
            fields=["id", "x_codigo", "x_name", "x_active"]),
        "turnos_obra": c("x_hys_turno", "search_read",
            [["x_sector", "=", "obra"]],
            fields=["id", "x_name", "x_codigo_ats", "x_active"]),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Backup escrito en {path}")

def do_rollback(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # Archivar ítems/turno obra creados después del backup
    ids_items_bak = {x["id"] for x in data.get("items_obra") or []}
    ids_turnos_bak = {x["id"] for x in data.get("turnos_obra") or []}
    items = c("x_hys_item_plantilla", "search", [["x_formulario", "=", "F08_OBRA"]])
    turnos = c("x_hys_turno", "search", [["x_sector", "=", "obra"]])
    borrar_i = [i for i in items if i not in ids_items_bak]
    borrar_t = [i for i in turnos if i not in ids_turnos_bak]
    log(f"archivar ítems obra nuevos {borrar_i}")
    log(f"archivar turnos obra nuevos {borrar_t}")
    if APLICAR:
        if borrar_i:
            c("x_hys_item_plantilla", "write", borrar_i, {"x_active": False})
        if borrar_t:
            c("x_hys_turno", "write", borrar_t, {"x_active": False})
        # Quitar selection «obra» si no estaba en el backup
        for model in ("x_hys_ats", "x_hys_turno"):
            prev = {v for v, _ in data.get(f"{model}.x_sector") or []}
            if "obra" in prev:
                continue
            fid = field_id(model, "x_sector")
            sels = c("ir.model.fields.selection", "search", [
                ["field_id", "=", fid], ["value", "=", "obra"]
            ])
            log(f"borrar selection obra de {model}: {sels}")
            if sels:
                c("ir.model.fields.selection", "unlink", [sels])
        # No borramos x_ot_id (puede haber datos); solo avisar
        print("Nota: x_ot_id no se elimina automáticamente (puede haber ATS con OF).")

def main():
    if BACKUP:
        do_backup(BACKUP)
        return
    if ROLLBACK:
        do_rollback(ROLLBACK)
        return
    print("=== ATS obra · Odoo (simulación)" if not APLICAR else "=== ATS obra · APLICANDO ===")
    print("x_sector ATS hoy:", selection_values("x_hys_ats", "x_sector"))
    print("x_sector turno hoy:", selection_values("x_hys_turno", "x_sector"))
    print("x_ot_id existe:", bool(field_id("x_hys_ats", "x_ot_id")))
    ensure_selection_value("x_hys_ats", "x_sector", "obra", "Obra", 30)
    ensure_selection_value("x_hys_turno", "x_sector", "obra", "Obra", 30)
    ensure_selection_value("x_hys_item_plantilla", "x_formulario", "F08_OBRA", "ATS Obra", 25)
    ensure_ot_id()
    ensure_items()
    ensure_turno()
    patch_views()
    print("Listo. Sin --aplicar no se escribió nada." if not APLICAR else "Cambios aplicados.")
    print("Backend: con fields_get verá obra+x_ot_id y habilitará el sector; o HYS_ATS_OBRA=1.")

if __name__ == "__main__":
    main()
