# Cronograma HyS nov–dic 2026 (programadas)

Prepara la importación de las visitas del plan de Fiama como `x_hys_inspeccion` en estado **Programada**. **No carga nada en Odoo.**

- Origen: Excel de Fiama (cronograma + controles por sector).
- Salida: `docs/cronograma-nov-dic-2026-programadas.xlsx`.
- Regenerar: `python3 scripts/cronograma/generar-import-programadas.py --excel RUTA.xlsx`.

Antes de importar (hace falta OK de Jorge):

1. Aplicar en Odoo `scripts/odoo-sector-visita-inspeccion.py` (campo `x_sector_visita`). El script es dry-run por defecto; `--apply` escribe. El rollback también es dry-run salvo `--apply`.
2. Confirmar las OT (Cambium 4146 y Unimaco 4184 están sugeridas; Snaider queda TBD) y si se trabaja el 20/11 y el 8/12.
3. Importar solo la hoja «A importar». No tocar las F03 semanales automáticas (recorrida de toda la fábrica, sin sector).
