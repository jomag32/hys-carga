#!/usr/bin/env python3
"""HyS · Campo x_sector_visita en x_hys_inspeccion (encabezado de la visita).

Agrega la selection de sectores del plan de visitas (nov-dic 2026) y la pone en las
vistas lista/formulario de la inspección. No crea inspecciones ni importa el cronograma.

Uso:
  python3 odoo-sector-visita-inspeccion.py                  # dry-run (por defecto): solo lee
  python3 odoo-sector-visita-inspeccion.py --apply [--backup FILE]
  python3 odoo-sector-visita-inspeccion.py --rollback FILE  # dry-run del rollback
  python3 odoo-sector-visita-inspeccion.py --rollback FILE --apply

Entorno: ODOO_URL, ODOO_DB, ODOO_UID (2), ODOO_API_KEY (o ODOO_API_KEY_ADMIN_ARME).
Nunca imprime secretos. Idempotente: busca el campo y las vistas antes de crear.
NO ejecutar en producción sin OK de Jorge.
"""
from __future__ import annotations
import json, os, re, sys
from datetime import datetime
import xmlrpc.client

ARGS = sys.argv[1:]
APPLY = "--apply" in ARGS or "--execute" in ARGS
FORCE = "--force" in ARGS

def arg(n):
    return next((ARGS[i + 1] for i, a in enumerate(ARGS) if a == n and i + 1 < len(ARGS)), None)

ROLLBACK = arg("--rollback")
BACKUP = arg("--backup") or f"backup-sector-visita-inspeccion-{datetime.now():%Y%m%d-%H%M%S}.json"

U = os.environ.get("ODOO_URL", "https://cooperativa-de-trabajo-el-sol.odoo.com").rstrip("/")
D = os.environ.get("ODOO_DB", "cooperativa-de-trabajo-el-sol")
UID = int(os.environ.get("ODOO_UID", "2"))
K = os.environ.get("ODOO_API_KEY") or os.environ.get("ODOO_API_KEY_ADMIN_ARME")
if not K:
    sys.exit("Falta ODOO_API_KEY o ODOO_API_KEY_ADMIN_ARME")
_m = xmlrpc.client.ServerProxy(U + "/xmlrpc/2/object", allow_none=True)

def c(mo, me, *a, **kw):
    return _m.execute_kw(D, UID, K, mo, me, list(a), kw)

MODELO = "x_hys_inspeccion"
CAMPO = "x_sector_visita"
SELECTION = [
    ("carpinteria", "Carpintería metálica"),
    ("estructura", "Estructura"),
    ("conformado", "Conformado"),
    ("corte_laser", "Corte láser"),
    ("deposito", "Depósito central"),
    ("logistica", "Logística y mantenimiento"),
    ("carpinteria_estructura", "Carpintería metálica / Estructura"),
    ("conformado_corte_laser", "Conformado / Corte láser"),
    ("deposito_logistica", "Depósito central / Logística y mantenimiento"),
    ("obra", "Obra"),
]
HELP = ("Sector o par de sectores de la visita del cronograma. En F03 distingue una "
        "inspección sectorial de la recorrida semanal oficial (sin sector). En F02 se usa «Obra».")

PLAN: list[str] = []

def step(msg, fn=None):
    PLAN.append(msg)
    print(("APPLY  " if APPLY else "WOULD  ") + msg)
    return fn() if (APPLY and fn) else None


def model_id(mo):
    r = c("ir.model", "search", [["model", "=", mo]], limit=1)
    return r[0] if r else None


def field_info():
    r = c("ir.model.fields", "search_read",
          [["model", "=", MODELO], ["name", "=", CAMPO]],
          fields=["id", "ttype", "field_description", "required", "state"], limit=1)
    return r[0] if r else None


def vistas():
    return c("ir.ui.view", "search_read",
             [["model", "=", MODELO], ["type", "in", ["form", "list", "tree", "search"]]],
             fields=["id", "name", "type", "arch_db"], order="id")


def arch_con_campo(arch: str) -> str:
    if CAMPO in arch:
        return arch
    # Después de la OT, o del ámbito, o al final del primer grupo de fields.
    for pat in (r'(<field name="x_ot_id"[^/]*/>)', r'(<field name="x_ambito"[^/]*/>)'):
        if re.search(pat, arch):
            return re.sub(pat, r'\1\n                            <field name="%s"/>' % CAMPO, arch, count=1)
    return arch.replace("</sheet>", '                                <field name="%s"/>\n                        </sheet>' % CAMPO, 1) if "</sheet>" in arch else arch


def backup_estado():
    fld = field_info()
    sel = []
    if fld:
        sel = (c(MODELO, "fields_get", [CAMPO], {"attributes": ["selection"]}).get(CAMPO) or {}).get("selection") or []
    return {
        "cuando": datetime.now().isoformat(timespec="seconds"),
        "host": U, "db": D, "modelo": MODELO, "campo": CAMPO,
        "campo_existia": bool(fld),
        "campo": fld,
        "selection": sel,
        "vistas": [{"id": v["id"], "name": v["name"], "type": v["type"], "arch_db": v["arch_db"]} for v in vistas()],
    }


def aplicar():
    mid = model_id(MODELO)
    if not mid:
        sys.exit("No está el modelo x_hys_inspeccion")
    fld = field_info()
    if fld:
        step(f"campo {CAMPO} ya existe (id {fld['id']}, {fld['ttype']})")
    else:
        def crear():
            vals = {
                "model_id": mid, "name": CAMPO, "ttype": "selection",
                "field_description": "Sector de la visita",
                "state": "manual", "required": False, "copied": True, "store": True,
                "help": HELP,
                "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i * 10}) for i, (v, n) in enumerate(SELECTION)],
            }
            return c("ir.model.fields", "create", vals)
        i = step(f"crear ir.model.fields {MODELO}.{CAMPO} (selection, no obligatorio)", crear)
        if i:
            print("  → field id", i)
    tocadas = []
    for v in vistas():
        nuevo = arch_con_campo(v["arch_db"] or "")
        if nuevo == (v["arch_db"] or ""):
            if CAMPO in (v["arch_db"] or ""):
                step(f"vista {v['id']} {v['type']} «{v['name']}» ya tiene {CAMPO}")
            else:
                step(f"vista {v['id']} {v['type']} «{v['name']}» sin lugar claro para insertar (revisar a mano)")
            continue
        def escribir(vid=v["id"], arch=nuevo):
            c("ir.ui.view", "write", [vid], {"arch_db": arch})
            return vid
        step(f"agregar {CAMPO} a vista {v['id']} {v['type']} «{v['name']}»", escribir)
        tocadas.append(v["id"])
    return tocadas


def rollback(data, apply=False):
    """Restaura arches de vistas y, si el campo no existía y no hay datos, lo borra."""
    for v in data.get("vistas") or []:
        actual = c("ir.ui.view", "read", [v["id"]], {"fields": ["arch_db"]})
        arch_act = (actual[0]["arch_db"] if actual else "") or ""
        if arch_act == v["arch_db"]:
            step(f"vista {v['id']} ya está como en el backup")
            continue
        def rest(vid=v["id"], arch=v["arch_db"]):
            c("ir.ui.view", "write", [vid], {"arch_db": arch})
        step(f"restaurar arch de vista {v['id']} {v['type']} «{v['name']}»", rest if apply else None)
    if data.get("campo_existia"):
        step(f"el campo {CAMPO} ya existía antes: no se borra")
        return
    fld = field_info()
    if not fld:
        step(f"campo {CAMPO} no está: nada que borrar")
        return
    n = c(MODELO, "search_count", [[CAMPO, "!=", False]])
    if n and not FORCE:
        step(f"NO se borra {CAMPO}: hay {n} inspecciones con valor (usá --force si corresponde)")
        return
    def borrar(fid=fld["id"]):
        c("ir.model.fields", "unlink", [fid])
    step(f"borrar ir.model.fields id {fld['id']} ({CAMPO})", borrar if apply else None)


def main():
    print(f"{'APPLY' if APPLY else 'DRY-RUN'} · {U} · db={D} · uid={UID}")
    if ROLLBACK:
        data = json.load(open(ROLLBACK, encoding="utf-8"))
        print(f"rollback desde {ROLLBACK} (campo existía: {data.get('campo_existia')})")
        rollback(data, apply=APPLY)
        print("listo." if APPLY else "dry-run del rollback: nada se escribió. Para aplicar: --rollback FILE --apply")
        return
    data = backup_estado()
    path = BACKUP
    if APPLY or True:
        # El backup se escribe siempre (solo lectura del estado actual, no es un write a Odoo).
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"backup: {path} ({len(data['vistas'])} vistas, campo existía={data['campo_existia']})")
    aplicar()
    print("listo." if APPLY else "dry-run: nada se escribió en Odoo. Para aplicar: --apply --backup FILE")


if __name__ == "__main__":
    main()
