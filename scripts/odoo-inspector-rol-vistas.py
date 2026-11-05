#!/usr/bin/env python3
"""HyS · mostrar Rol y Sector en la lista/form de x_hys_inspector.

Los campos ya existen en producción:
  - x_rol (selection: inspector | encargado) id 43312
  - x_sector_id (many2one x_hys_sector) id 44866
  - x_sector (selection vieja deposito|logistica) id 43314 — se deja, la app prefiere x_sector_id

Pero las vistas list 8475 y form 8476 NO los muestran: por eso en Odoo no se
ve quién es encargado. Este script SOLO edita el arch de esas vistas.

Uso:
  python3 odoo-inspector-rol-vistas.py --host https://coop-prueba.odoo.com --db coop-prueba revisar
  python3 odoo-inspector-rol-vistas.py --host https://coop-prueba.odoo.com --db coop-prueba aplicar
  python3 odoo-inspector-rol-vistas.py --host … --db … revertir --backup FILE
  Producción exige además --confirmo-produccion.

Credenciales: ODOO_API_KEY_ADMIN_ARME (uid 2). Nunca imprime secretos.
Idempotente: si el arch ya tiene name="x_rol" / name="x_sector_id", no reescribe.
NO crea campos nuevos (reusa x_rol; no agrega boolean x_hys_encargado).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import xmlrpc.client as x
from pathlib import Path

PROD = "cooperativa-de-trabajo-el-sol"
MODEL = "x_hys_inspector"
LIST_ID = 8475
FORM_ID = 8476

# Fragmentos a insertar (idempotentes por name=).
LIST_INSERT_AFTER = '<field name="x_tipo"/>'
LIST_FRAGMENT = (
    '<field name="x_tipo"/>'
    '<field name="x_rol"/>'
    '<field name="x_sector_id" optional="show"/>'
)
a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
a.add_argument("--host", required=True)
a.add_argument("--db", required=True)
a.add_argument("modo", choices=["revisar", "aplicar", "revertir"])
a.add_argument("--backup")
a.add_argument("--confirmo-produccion", action="store_true")
o = a.parse_args()

HOST = o.host.rstrip("/").removesuffix("/odoo")
DB = o.db
if (PROD in HOST or PROD in DB) and not o.confirmo_produccion:
    sys.exit("Producción: falta --confirmo-produccion. No se hizo nada.")

KEY = os.environ["ODOO_API_KEY_ADMIN_ARME"]
UID = 2
m = x.ServerProxy(HOST + "/xmlrpc/2/object", allow_none=True)
EXPECTED_HOST = HOST.split("://", 1)[1]


def chk():
    assert m._ServerProxy__host == EXPECTED_HOST and DB == o.db, (m._ServerProxy__host, DB)


def r(mo, me, *args, **kw):
    chk()
    return m.execute_kw(DB, UID, KEY, mo, me, list(args), kw)


def view(vid):
    rows = r(
        "ir.ui.view",
        "search_read",
        [["id", "=", vid]],
        fields=["id", "name", "type", "model", "arch_db", "write_date"],
        limit=1,
    )
    return rows[0] if rows else None


def fields_exist():
    rows = r(
        "ir.model.fields",
        "search_read",
        [["model", "=", MODEL], ["name", "in", ["x_rol", "x_sector_id", "x_sector"]]],
        fields=["id", "name", "field_description", "ttype"],
    )
    return {f["name"]: f for f in rows}


def snapshot():
    return {
        "fecha": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "host": HOST,
        "db": DB,
        "model": MODEL,
        "fields": fields_exist(),
        "views": {
            "list": view(LIST_ID),
            "form": view(FORM_ID),
        },
        "nota": (
            "Solo edita arch de vistas 8475/8476 para mostrar x_rol y x_sector_id. "
            "No crea campos. Revertir restaura arch_db del backup."
        ),
    }


def default_backup_path():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    base = Path(__file__).resolve().parent / "backups"
    base.mkdir(parents=True, exist_ok=True)
    host_tag = (
        "coop-prueba" if "coop-prueba" in HOST or DB == "coop-prueba"
        else ("prod" if PROD in HOST or PROD in DB else "odoo")
    )
    return base / f"backup-inspector-rol-vistas-{host_tag}-{stamp}.json"


def save_backup(path: Path, snap: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    # No guardar arch enormes? sí, hace falta para revertir.
    path.write_text(json.dumps(snap, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return path


def patch_list(arch: str) -> str:
    if 'name="x_rol"' in arch and 'name="x_sector_id"' in arch:
        return arch  # ya está
    if LIST_INSERT_AFTER not in arch:
        raise SystemExit(f"Ancla list {LIST_INSERT_AFTER!r} no encontrada")
    # Inserta rol + sector_id justo después de x_tipo (una sola vez).
    return arch.replace(
        LIST_INSERT_AFTER,
        '<field name="x_tipo"/><field name="x_rol" string="Rol"/><field name="x_sector_id" string="Sector" optional="show"/>',
        1,
    )


def patch_form(arch: str) -> str:
    if 'name="x_rol"' in arch and 'name="x_sector_id"' in arch:
        return arch
    # Inserta un grupo Rol en la app después del grupo que tiene x_active.
    marker = '<field name="x_active" widget="boolean_toggle"/></group>'
    if marker not in arch:
        # variante con espacios/newlines
        import re
        m = re.search(
            r'(<field name="x_active"[^/]*/>)\s*</group>',
            arch,
        )
        if not m:
            raise SystemExit("Ancla form x_active</group> no encontrada; no se modifica a ciegas")
        insert = (
            m.group(1)
            + "</group>\n"
            + '    <group string="Rol en la app">'
            + '<field name="x_rol" string="Rol" widget="radio" options="{\'horizontal\': true}"/>'
            + '<field name="x_sector_id" string="Sector" invisible="x_rol != \'encargado\'" '
            + 'required="x_rol == \'encargado\'"/>'
            + "</group>"
        )
        return arch[: m.start()] + insert + arch[m.end() :]
    insert = (
        '<field name="x_active" widget="boolean_toggle"/></group>\n'
        '    <group string="Rol en la app">'
        '<field name="x_rol" string="Rol" widget="radio" options="{\'horizontal\': true}"/>'
        '<field name="x_sector_id" string="Sector" invisible="x_rol != \'encargado\'" '
        'required="x_rol == \'encargado\'"/>'
        "</group>"
    )
    return arch.replace(marker, insert, 1)


def aplicar():
    fs = fields_exist()
    if "x_rol" not in fs or "x_sector_id" not in fs:
        sys.exit(f"Faltan campos en {HOST}/{DB}: {sorted(fs)}")
    lv, fv = view(LIST_ID), view(FORM_ID)
    if not lv or not fv:
        sys.exit(f"Faltan vistas {LIST_ID}/{FORM_ID}")

    bak_path = Path(o.backup) if o.backup else default_backup_path()
    if not bak_path.exists():
        save_backup(bak_path, snapshot())
        print("backup:", bak_path)
    else:
        print("backup (existente):", bak_path)

    new_list = patch_list(lv["arch_db"] or "")
    if new_list != lv["arch_db"]:
        print(f"WRITE list view id={LIST_ID} (+ x_rol, x_sector_id)")
        r("ir.ui.view", "write", [LIST_ID], {"arch_db": new_list})
    else:
        print(f"EXISTS list view id={LIST_ID} ya tiene x_rol/x_sector_id")

    new_form = patch_form(fv["arch_db"] or "")
    if new_form != fv["arch_db"]:
        print(f"WRITE form view id={FORM_ID} (+ grupo Rol en la app)")
        r("ir.ui.view", "write", [FORM_ID], {"arch_db": new_form})
    else:
        print(f"EXISTS form view id={FORM_ID} ya tiene x_rol/x_sector_id")

    lv2, fv2 = view(LIST_ID), view(FORM_ID)
    print(
        "OK list_has_rol", 'name="x_rol"' in (lv2["arch_db"] or ""),
        "form_has_rol", 'name="x_rol"' in (fv2["arch_db"] or ""),
        "backup", bak_path,
    )


def revertir():
    if not o.backup:
        sys.exit("revertir requiere --backup FILE")
    bak = json.loads(Path(o.backup).read_text(encoding="utf-8"))
    if bak.get("db") != DB or bak.get("host") != HOST:
        sys.exit(f"Backup es de {bak.get('host')}/{bak.get('db')}, no de {HOST}/{DB}")
    for key, vid in (("list", LIST_ID), ("form", FORM_ID)):
        v = (bak.get("views") or {}).get(key) or {}
        if v.get("arch_db") is None:
            print(f"SKIP restore {key} (sin arch en backup)")
            continue
        print(f"RESTORE {key} view id={vid}")
        r("ir.ui.view", "write", [vid], {"arch_db": v["arch_db"]})
    print("OK revertido")


def revisar():
    snap = snapshot()
    bak_path = Path(o.backup) if o.backup else default_backup_path()
    save_backup(bak_path, snap)
    print("host:", HOST, "db:", DB)
    print("fields:", {k: f"id={v['id']} {v['ttype']}" for k, v in snap["fields"].items()})
    for key, vid in (("list", LIST_ID), ("form", FORM_ID)):
        v = snap["views"][key]
        arch = (v or {}).get("arch_db") or ""
        print(
            f"view {key} id={vid}:",
            None if not v else f"name={v['name']} has_rol={'name=\"x_rol\"' in arch} "
            f"has_sector_id={'name=\"x_sector_id\"' in arch}",
        )
    print("backup:", bak_path)
    print("nota:", snap["nota"])


if o.modo == "revisar":
    revisar()
elif o.modo == "aplicar":
    aplicar()
elif o.modo == "revertir":
    revertir()
