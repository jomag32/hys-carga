#!/usr/bin/env python3
"""HyS · campo x_hys_password ('Contraseña app') en x_hys_inspector.

Agrega un Char en el modelo Inspector HyS y lo muestra en la vista form
(widget password), visible/editable solo para el grupo «HyS responsable»
(studio_customization.grupo_hys_responsable). La restricción va en la VISTA
(no a nivel de campo) para que MIA / grupo 217 «HYS servicio api» pueda
LEER el valor por API y validar el login de la app.

Uso:
  python3 odoo-contrasena-inspector.py --host https://coop-prueba.odoo.com --db coop-prueba revisar
  python3 odoo-contrasena-inspector.py --host https://coop-prueba.odoo.com --db coop-prueba aplicar
  python3 odoo-contrasena-inspector.py --host https://coop-prueba.odoo.com --db coop-prueba revertir --backup FILE
  Producción exige además --confirmo-produccion.

Credenciales: ODOO_API_KEY_ADMIN_ARME (uid 2). Nunca imprime secretos.
Idempotente: busca el campo y el fragmento en el arch antes de crear/escribir.
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
FIELD = "x_hys_password"
FIELD_LABEL = "Contraseña app"
FORM_NAME = "x_hys_inspector.form.hys"
# Solo HyS responsable (gerencia/personal HyS). No poner groups en ir.model.fields:
# eso bloquearía la lectura API de MIA (grupo 217, solo lectura del modelo).
GROUPS_ATTR = 'groups="studio_customization.grupo_hys_responsable"'
FIELD_XML = (
    f'<field name="{FIELD}" password="True" widget="password" '
    f'{GROUPS_ATTR} placeholder="Contraseña de la app de inspectores"/>'
)
# Ancla estable del form actual: se inserta justo antes de x_notas.
ANCLA = '<field name="x_notas" placeholder="Notas (matrícula, alcance, contacto…)"/>'
INSERT = FIELD_XML + "\n    " + ANCLA

a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
a.add_argument("--host", required=True, help="URL Odoo, p.ej. https://coop-prueba.odoo.com")
a.add_argument("--db", required=True, help="Nombre de la base")
a.add_argument("modo", choices=["revisar", "aplicar", "revertir"])
a.add_argument("--backup", help="Ruta del JSON de backup (obligatorio en revertir; en aplicar se crea si falta)")
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


def field_rec():
    rows = r(
        "ir.model.fields",
        "search_read",
        [["model", "=", MODEL], ["name", "=", FIELD]],
        fields=["id", "name", "field_description", "ttype", "state", "groups"],
        limit=1,
    )
    return rows[0] if rows else None


def form_view():
    rows = r(
        "ir.ui.view",
        "search_read",
        [["model", "=", MODEL], ["name", "=", FORM_NAME], ["type", "=", "form"]],
        fields=["id", "name", "arch_db", "write_date"],
        limit=1,
    )
    if not rows:
        # fallback: cualquier form del modelo
        rows = r(
            "ir.ui.view",
            "search_read",
            [["model", "=", MODEL], ["type", "=", "form"], ["mode", "=", "primary"]],
            fields=["id", "name", "arch_db", "write_date"],
            order="priority,id",
            limit=1,
        )
    return rows[0] if rows else None


def model_id():
    rows = r("ir.model", "search", [["model", "=", MODEL]], limit=1)
    return rows[0] if rows else None


def snapshot():
    f = field_rec()
    v = form_view()
    return {
        "fecha": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "host": HOST,
        "db": DB,
        "model": MODEL,
        "model_id": model_id(),
        "field": f,
        "view": None
        if not v
        else {"id": v["id"], "name": v["name"], "arch_db": v["arch_db"], "write_date": v.get("write_date")},
        "groups_xmlid": "studio_customization.grupo_hys_responsable",
        "nota": (
            "Restricción de visibilidad en la vista (groups=), no en ir.model.fields.groups, "
            "para que MIA (HYS servicio api, grupo 217) lea x_hys_password por API."
        ),
    }


def default_backup_path():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    base = Path(__file__).resolve().parent / "backups"
    base.mkdir(parents=True, exist_ok=True)
    host_tag = "coop-prueba" if "coop-prueba" in HOST or DB == "coop-prueba" else (
        "prod" if PROD in HOST or PROD in DB else "odoo"
    )
    return base / f"backup-contrasena-inspector-{host_tag}-{stamp}.json"


def save_backup(path: Path, snap: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def arch_tiene_campo(arch: str) -> bool:
    return f'name="{FIELD}"' in (arch or "")


def aplicar():
    mid = model_id()
    if not mid:
        sys.exit(f"No existe el modelo {MODEL} en {HOST}/{DB}")
    v = form_view()
    if not v:
        sys.exit(f"No hay vista form de {MODEL}")
    arch = v["arch_db"] or ""

    bak_path = Path(o.backup) if o.backup else default_backup_path()
    if not bak_path.exists():
        snap = snapshot()
        save_backup(bak_path, snap)
        print("backup:", bak_path)
    else:
        print("backup (existente):", bak_path)

    f = field_rec()
    if f:
        print(f"EXISTS field {FIELD} id={f['id']} ttype={f['ttype']} label={f.get('field_description')!r}")
        if f["ttype"] != "char":
            sys.exit(f"El campo {FIELD} existe pero no es char ({f['ttype']}): aborto")
        # Asegura etiqueta
        if f.get("field_description") != FIELD_LABEL:
            print(f"  write field_description → {FIELD_LABEL!r}")
            r("ir.model.fields", "write", [f["id"]], {"field_description": FIELD_LABEL})
        field_id = f["id"]
    else:
        print(f"CREATE field {FIELD} ({FIELD_LABEL}) on {MODEL}")
        field_id = r(
            "ir.model.fields",
            "create",
            {
                "name": FIELD,
                "model_id": mid,
                "model": MODEL,
                "ttype": "char",
                "field_description": FIELD_LABEL,
                "state": "manual",
                "copied": False,
                # sin groups= a nivel campo → MIA puede leerlo
            },
        )
        print(f"  created field id={field_id}")

    if arch_tiene_campo(arch):
        print(f"EXISTS view arch ya incluye {FIELD} (view id={v['id']})")
        # Si está pero sin groups / widget, no reescribimos a ciegas: reportar.
        if GROUPS_ATTR not in arch or 'widget="password"' not in arch:
            print("  AVISO: el arch menciona el campo pero puede faltar groups= o widget=password; revisar a mano.")
    else:
        if ANCLA not in arch:
            sys.exit(
                f"Ancla {ANCLA!r} no encontrada en la vista {v['id']}. "
                "No se modifica el arch a ciegas."
            )
        nuevo = arch.replace(ANCLA, INSERT, 1)
        if nuevo == arch or not arch_tiene_campo(nuevo):
            sys.exit("No se pudo insertar el field en el arch")
        print(f"WRITE view id={v['id']} insertando {FIELD} con {GROUPS_ATTR}")
        r("ir.ui.view", "write", [v["id"]], {"arch_db": nuevo})

    # Verificación final
    f2 = field_rec()
    v2 = form_view()
    print("OK field", f2 and f2["id"], "view", v2 and v2["id"], "arch_has_field", arch_tiene_campo(v2["arch_db"] if v2 else ""))
    return {"field_id": f2["id"], "view_id": v2["id"], "backup": str(bak_path)}


def revertir():
    if not o.backup:
        sys.exit("revertir requiere --backup FILE")
    bak = json.loads(Path(o.backup).read_text(encoding="utf-8"))
    if bak.get("db") != DB or bak.get("host") != HOST:
        sys.exit(f"Backup es de {bak.get('host')}/{bak.get('db')}, no de {HOST}/{DB}")

    v = form_view()
    if v and bak.get("view") and bak["view"].get("arch_db") is not None:
        print(f"RESTORE view id={v['id']} arch desde backup (view backup id={bak['view'].get('id')})")
        r("ir.ui.view", "write", [v["id"]], {"arch_db": bak["view"]["arch_db"]})
    else:
        print("SKIP restore view (sin arch en backup o sin vista)")

    f = field_rec()
    # Solo borramos el campo si el backup dice que NO existía antes.
    if f and not bak.get("field"):
        print(f"UNLINK field {FIELD} id={f['id']} (no existía antes del apply)")
        r("ir.model.fields", "unlink", [f["id"]])
    elif f and bak.get("field"):
        print(f"KEEP field {FIELD} id={f['id']} (ya existía antes; no se borra)")
    else:
        print(f"SKIP unlink field (no está)")

    f2 = field_rec()
    v2 = form_view()
    print("OK post-revert field", f2, "arch_has_field", arch_tiene_campo(v2["arch_db"] if v2 else ""))


def revisar():
    snap = snapshot()
    bak_path = Path(o.backup) if o.backup else default_backup_path()
    save_backup(bak_path, snap)
    f = snap["field"]
    v = snap["view"]
    print("host:", HOST, "db:", DB)
    print("model_id:", snap["model_id"])
    print("field:", None if not f else f"id={f['id']} {f['name']} {f['ttype']} {f.get('field_description')!r}")
    print("view:", None if not v else f"id={v['id']} {v['name']} arch_has_field={arch_tiene_campo(v['arch_db'])}")
    print("backup:", bak_path)
    print("nota:", snap["nota"])


if o.modo == "revisar":
    revisar()
elif o.modo == "aplicar":
    aplicar()
elif o.modo == "revertir":
    revertir()
