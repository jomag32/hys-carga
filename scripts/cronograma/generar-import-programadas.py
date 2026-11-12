#!/usr/bin/env python3
"""Arma el Excel de importación de visitas programadas (NO las carga en Odoo).

Lee el cronograma de Fiama, saltea fechas anteriores al 12/11/2026, agrega los
viernes de fábrica que faltan (cuando no hay viaje a Chaco cada 15 días), marca
feriados y deja la OT para confirmar.

Uso:
  python3 generar-import-programadas.py [--excel ORIGEN.xlsx] [--salida FILE.xlsx]
"""
from __future__ import annotations
import argparse
from datetime import date, datetime, timedelta
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# --- criterios (hora de Argentina) ---
HOY = date(2026, 11, 12)
INSPECTOR_ID = 2
INSPECTOR = "MIÑOS FIAMA"
# OT sugeridas (a confirmar). Snaider: varias OT en curso, ninguna con F01.
OT = {
    "cambium": {"ot_id": 4146, "ot_nombre": "OT 4146 - CAMBIUM TIMBER SA", "estado_ot": "sugerida · F01 aprobada FR-2026-0009"},
    "unimaco": {"ot_id": 4184, "ot_nombre": "OT 4184 - UNIMACO", "estado_ot": "sugerida · F01 en borrador FR-2026-0008"},
    "snaider": {"ot_id": None, "ot_nombre": "", "estado_ot": "TBD · sin F01; hay varias OT (4081, 4188, 4189, …)"},
}
# Viernes de Chaco cada 15 días, ambos sitios el mismo viaje (lectura del plan).
# No se importa el 25/12 (feriado). El Excel original alternaba un sitio por viernes
# y no dejaba ningún viernes para depósito/logística.
CHACO_VIERNES = {date(2026, 11, 13), date(2026, 11, 27), date(2026, 12, 11)}
FABRICA_VIERNES = {date(2026, 11, 20), date(2026, 12, 4), date(2026, 12, 18)}
FERIADOS = {
    date(2026, 11, 20): "Posible feriado · Día de la Soberanía Nacional (confirmar)",
    date(2026, 12, 8): "Posible feriado · Inmaculada Concepción (confirmar)",
    date(2026, 12, 25): "Feriado · Navidad. Reprogramar.",
}

COLS = [
    "incluir", "motivo", "alerta", "fecha", "dia", "establecimiento", "formulario",
    "tipo_programa", "ambito", "lugar", "sector_visita", "sector_visita_nombre",
    "ot_id", "ot_nombre", "ot_estado", "inspector_id", "inspector",
    "estado", "origen", "validacion_estado", "x_fecha_vencimiento", "x_name",
    "tipo_visita_origen", "control_principal", "fuente",
]

def art_vence(d: date) -> str:
    # 23:59 hora de Argentina = día siguiente 02:59 UTC
    return f"{d + timedelta(days=1)} 02:59:00"

def dia_es(d: date) -> str:
    return ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][d.weekday()]

def base_row(**kw):
    r = {k: "" for k in COLS}
    r.update({
        "inspector_id": INSPECTOR_ID, "inspector": INSPECTOR,
        "estado": "programada", "origen": "programa", "validacion_estado": "no_aplica",
        "incluir": "sí",
    })
    r.update(kw)
    if r.get("fecha") and not r.get("dia"):
        r["dia"] = dia_es(r["fecha"] if isinstance(r["fecha"], date) else r["fecha"])
    if isinstance(r.get("fecha"), date):
        if not r.get("x_fecha_vencimiento"):
            r["x_fecha_vencimiento"] = art_vence(r["fecha"])
        r["fecha"] = r["fecha"].strftime("%d/%m/%Y")
    return r

def nombre(form, d, donde):
    return f"{form} programada · {donde} · {d.strftime('%d/%m/%Y')}"

def parse_fecha(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        return datetime.strptime(v.strip(), "%d/%m/%Y").date()
    return None

def leer_excel(path: Path):
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[0]:
            continue
        rows.append({
            "fila_origen": i,
            "fecha": parse_fecha(row[0]),
            "dia": row[1],
            "lugar": row[2],
            "tipo": row[3],
            "control": row[4],
        })
    return rows

def sector_de(lugar: str):
    t = (lugar or "").lower()
    if "carpinter" in t:
        return "carpinteria_estructura", "Carpintería metálica / Estructura"
    if "conformado" in t or "láser" in t or "laser" in t:
        return "conformado_corte_laser", "Conformado / Corte láser"
    if "depósito" in t or "deposito" in t or "logística" in t or "logistica" in t:
        return "deposito_logistica", "Depósito central / Logística y mantenimiento"
    return None, None

def obra_de(lugar: str):
    t = (lugar or "").lower()
    if "cambium" in t:
        return "cambium", "Cambium Timber"
    if "unimaco" in t:
        return "unimaco", "Unimaco"
    if "snaide" in t or "snaider" in t:
        return "snaider", "Chaco – Snaider"
    return None, lugar

def fila_f03(d, sector, sector_n, fuente, alerta="", control="", tipo_orig="Inspección sectorial"):
    return base_row(
        motivo="", alerta=alerta, fecha=d, establecimiento=f"Fábrica - {sector_n}",
        formulario="F03", tipo_programa="recorrida_semanal", ambito="fabrica", lugar="fabrica",
        sector_visita=sector, sector_visita_nombre=sector_n,
        ot_id="", ot_nombre="", ot_estado="no aplica (fábrica)",
        x_name=nombre("F03", d, sector_n),
        tipo_visita_origen=tipo_orig, control_principal=control, fuente=fuente,
    )

def fila_f02(d, clave, etiqueta, fuente, alerta="", control="", tipo_orig="Visita de obra"):
    ot = OT[clave]
    return base_row(
        motivo="", alerta=alerta, fecha=d, establecimiento=etiqueta,
        formulario="F02", tipo_programa="periodica", ambito="obra", lugar="",
        sector_visita="obra", sector_visita_nombre="Obra",
        ot_id=ot["ot_id"] if ot["ot_id"] else "", ot_nombre=ot["ot_nombre"], ot_estado=ot["estado_ot"],
        x_name=nombre("F02", d, etiqueta),
        tipo_visita_origen=tipo_orig, control_principal=control, fuente=fuente,
    )

def armar(origen: Path):
    original = leer_excel(origen)
    importar, no_imp = [], []
    # 1) Filas del Excel, con filtros
    for r in original:
        d, lugar = r["fecha"], r["lugar"]
        alerta = FERIADOS.get(d, "")
        sector, sector_n = sector_de(lugar)
        clave, etiqueta = obra_de(lugar)
        if d < HOY:
            row = (fila_f03(d, sector, sector_n, "excel", alerta, r["control"]) if sector
                   else fila_f02(d, clave, etiqueta, "excel", alerta, r["control"], r["tipo"]))
            row["incluir"] = "no"
            row["motivo"] = "Fecha anterior al 12/11/2026 (ya pasó)"
            no_imp.append(row)
            continue
        if d == date(2026, 12, 25):
            row = fila_f02(d, clave or "snaider", etiqueta or lugar, "excel", alerta, r["control"], r["tipo"])
            row["incluir"] = "no"
            row["motivo"] = "Feriado 25/12 · reprogramar (el Excel la tenía como Chaco – Snaide)"
            no_imp.append(row)
            continue
        # Viernes de Chaco del Excel que no quedan en la propuesta cada 15 días (ambos sitios):
        # se documentan como no importar (reemplazadas por el viaje quincenal o por fábrica).
        if d.weekday() == 4 and clave in ("snaider", "unimaco") and d not in CHACO_VIERNES:
            row = fila_f02(d, clave, etiqueta, "excel", alerta or FERIADOS.get(d, ""), r["control"], r["tipo"])
            row["incluir"] = "no"
            row["motivo"] = ("El plan dice viaje a Chaco cada 15 días (ambos sitios) y viernes de fábrica el resto. "
                             "Este viernes del Excel se reemplaza: ver «A importar».")
            no_imp.append(row)
            continue
        if d.weekday() == 4 and clave in ("snaider", "unimaco") and d in CHACO_VIERNES:
            # Se importan más abajo, ambos sitios el mismo día (no solo el del Excel).
            continue
        if sector:
            importar.append(fila_f03(d, sector, sector_n, "excel", alerta, r["control"]))
        else:
            importar.append(fila_f02(d, clave, etiqueta, "excel", alerta, r["control"], r["tipo"]))

    # 2) Viajes a Chaco cada 15 días: ambos sitios
    for d in sorted(CHACO_VIERNES):
        if d < HOY:
            continue
        importar.append(fila_f02(d, "snaider", "Chaco – Snaider", "propuesta_chaco_quincenal",
                                 FERIADOS.get(d, ""), "Inspección general, ATS y seguimiento de desvíos",
                                 "Visita quincenal propuesta"))
        importar.append(fila_f02(d, "unimaco", "Unimaco", "propuesta_chaco_quincenal",
                                 FERIADOS.get(d, ""), "Inspección general, ATS y seguimiento de desvíos",
                                 "Visita quincenal propuesta"))

    # 3) Viernes de fábrica faltantes
    for d in sorted(FABRICA_VIERNES):
        if d < HOY:
            continue
        importar.append(fila_f03(
            d, "deposito_logistica", "Depósito central / Logística y mantenimiento",
            "agregado_viernes_fabrica",
            FERIADOS.get(d, ""),
            "Estanterías, gases, autoelevadores, bloqueo de energías y ATS",
            "Inspección sectorial",
        ))

    importar.sort(key=lambda r: (datetime.strptime(r["fecha"], "%d/%m/%Y"), r["formulario"], r["establecimiento"]))
    no_imp.sort(key=lambda r: (datetime.strptime(r["fecha"], "%d/%m/%Y"), r["establecimiento"]))
    return importar, no_imp, original

def pintar(ws, rows, titulo):
    thin = Border(*(Side(style="thin", color="CCCCCC") for _ in range(4)))
    head_fill = PatternFill("solid", fgColor="1F4E3D")
    head_font = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
    alerta_fill = PatternFill("solid", fgColor="FFF3CD")
    no_fill = PatternFill("solid", fgColor="F8D7DA")
    add_fill = PatternFill("solid", fgColor="D4EDDA")
    ws["A1"] = titulo
    ws["A1"].font = Font(bold=True, size=14, name="Calibri")
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=8)
    headers = COLS
    for i, h in enumerate(headers, 1):
        cell = ws.cell(3, i, h)
        cell.fill = head_fill
        cell.font = head_font
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin
    for r, row in enumerate(rows, 4):
        for c, k in enumerate(headers, 1):
            val = row.get(k, "")
            cell = ws.cell(r, c, val if val is not None else "")
            cell.border = thin
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            if row.get("incluir") == "no":
                cell.fill = no_fill
            elif row.get("fuente") == "agregado_viernes_fabrica":
                cell.fill = add_fill
            elif row.get("alerta"):
                cell.fill = alerta_fill
    for i, h in enumerate(headers, 1):
        width = max(12, min(42, max(len(h), max((len(str(r.get(h, ""))) for r in rows), default=0))))
        ws.column_dimensions[get_column_letter(i)].width = min(width + 2, 40)
    ws.auto_filter.ref = f"A3:{get_column_letter(len(headers))}{3 + len(rows)}"
    ws.freeze_panes = "A4"
    ws.row_dimensions[3].height = 22

def escribir(path: Path, importar, no_imp, original):
    wb = Workbook()
    ws = wb.active
    ws.title = "A importar"
    pintar(ws, importar, "Visitas programadas a importar (NO cargadas en Odoo · falta OK de Jorge)")
    ws2 = wb.create_sheet("No importar")
    pintar(ws2, no_imp, "Filas que no se importan (fechas pasadas, 25/12 o viernes de Chaco reemplazados)")
    ws3 = wb.create_sheet("Notas")
    notas = [
        "Archivo de preparación — no importar a Odoo hasta que Jorge lo apruebe.",
        "",
        "Criterios",
        "· Destino: x_hys_inspeccion, estado Programada, origen Programa, inspectora MIÑOS FIAMA (id 2).",
        "· F02 = obras (Cambium, Snaider, Unimaco). F03 = fábrica, con x_sector_visita.",
        "· Se saltean fechas anteriores al 12/11/2026 (hora de Argentina). El 12/11 (Cambium) sí entra.",
        "· El 25/12 es feriado: no se importa; hay que reprogramar.",
        "· Se marcan el 20/11 (Soberanía Nacional) y el 8/12 (Inmaculada Concepción) para confirmar si se trabaja.",
        "",
        "Viernes (ajuste respecto del Excel de Fiama)",
        "· El plan dice: viernes en fábrica (depósito / logística / mantenimiento).",
        "· Cada 15 días, un viaje a Chaco (Snaide y Unimaco) reemplaza esa recorrida.",
        "· El Excel ocupó los 7 viernes alternando un solo sitio y nunca dejó un viernes de fábrica.",
        "· Propuesta: Chaco ambos sitios el 13/11, 27/11 y 11/12; fábrica el 20/11, 4/12 y 18/12; 25/12 se reprograma.",
        "",
        "OT (columna a confirmar, no se asume como definitiva)",
        "· Cambium: se sugiere OT 4146 (única con F01 aprobada; las F02 y ATS de obra de hoy están ahí).",
        "  Hay otras OT de Cambium en curso (4164, 4167–4170, 4174, 4181, 4196, …).",
        "· Unimaco: se sugiere OT 4184 (F01 en borrador FR-2026-0008; hay que aprobarla).",
        "· Snaider: sin F01 en ninguna OT. En Odoo el cliente es Transporte Snaider S.R.L. (el Excel dice «Snaide»).",
        "  OT en curso: 4081, 4188, 4189, entre otras. Queda TBD.",
        "",
        "Cómo cargar después (cuando haya OK)",
        "· Primero aplicar en Odoo el script scripts/odoo-sector-visita-inspeccion.py (campo x_sector_visita).",
        "· Completar ot_id de Snaider y confirmar las OT sugeridas.",
        "· Importar solo la hoja «A importar» (incluir = sí) como x_hys_inspeccion, sin tocar las F03 semanales",
        "  automáticas que ya crea el cron (recorrida de toda la fábrica, sin sector).",
        "· x_fecha_vencimiento es 23:59 hora de Argentina de ese día (UTC = día siguiente 02:59:00).",
        "",
        f"Totales de esta generación: a importar {len(importar)}; no importar {len(no_imp)}; filas del Excel original {len(original)}.",
        f"Generado el {datetime.now():%Y-%m-%d %H:%M} (hora de Argentina, America/Cordoba).",
    ]
    ws3["A1"] = "Notas para la carga del cronograma"
    ws3["A1"].font = Font(bold=True, size=14)
    for i, line in enumerate(notas, 3):
        ws3.cell(i, 1, line)
        if line.startswith("·") or line.startswith("Criterios") or line.startswith("Viernes") or line.startswith("OT") or line.startswith("Cómo"):
            ws3.cell(i, 1).alignment = Alignment(wrap_text=True)
    ws3.column_dimensions["A"].width = 120
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", default="/home/box/agent-data/agents/a45946c4-cbba-47e4-bd3b-3e8b9960cff7/attachments/5105865b9683621af394b59d2241bb513de8aebdb1cbbeb469389583cf1c9c5c.xlsx")
    ap.add_argument("--salida", default=str(Path(__file__).resolve().parents[2] / "docs" / "cronograma-nov-dic-2026-programadas.xlsx"))
    args = ap.parse_args()
    origen = Path(args.excel)
    importar, no_imp, original = armar(origen)
    dest = escribir(Path(args.salida), importar, no_imp, original)
    c_form = Counter(r["formulario"] for r in importar)
    c_fuente = Counter(r["fuente"] for r in importar)
    print(f"escrito {dest}")
    print(f"a importar: {len(importar)}  (F02={c_form.get('F02',0)} F03={c_form.get('F03',0)})  fuentes={dict(c_fuente)}")
    print(f"no importar: {len(no_imp)}")
    print("alertas en a importar:")
    for r in importar:
        if r["alerta"]:
            print(" ", r["fecha"], r["establecimiento"], "—", r["alerta"])

if __name__ == "__main__":
    main()
