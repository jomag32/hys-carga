# Propuesta: acceso al manual desde cada ficha

## App hys-carga (implementado en la rama `manual-fichas`, sin deploy)
- Botón redondo «?» arriba a la derecha del título de CADA ficha (F01–F08, en el motor común `componentes/asistente.js`).
  Abre una ventana encima con la sección de esa ficha (para qué sirve, quién, pasos, qué pasa después/cálculos, preguntas). Cerrar ✕ vuelve al mismo paso sin perder nada.
- Botón «📖 Manual de uso de las fichas» en el inicio → `#/manual` (todas las fichas plegables + «Cómo funciona la app»). `#/manual/f05` abre directo en F05. Se puede leer sin ingresar y sin señal (va en el service worker).
- Fuente única del texto: `componentes/manual-contenido.js`; `node scripts/manual-a-md.mjs` genera el .md (`docs/manual-fichas-hys.md`).
- Deploy (con OK): merge a main → Render publica el sitio. Versión 2026-10-26.1 (sw.js + version.js). No toca el backend ni Odoo. Esfuerzo: hecho; revisar textos ~30 min.

## Odoo (propuesta, NO aplicada: requiere escribir en Odoo)
Opción A (recomendada, ~1 h): en cada acción de ventana de Fichas poner el campo `help` (HTML) con un resumen de 3–4 líneas y el enlace al manual:
`https://<sitio hys-carga>/#/manual/f0X`. Se ve cuando la lista está vacía. Acciones: F01 2565, F02 2549, F03 2601, F04 2602, F05 2614, F06 2615, F07 2617, F08 2573.
Opción B (~2–3 h, mejor): vista heredada de cada formulario (x_hys_ficha, x_hys_inspeccion, x_hys_evento, x_hys_control_legal/x_hys_vencimiento_carga, x_hys_desvio, x_hys_ats) con una pestaña «Manual» en el notebook (o un `<div class="alert alert-info">` arriba) con las reglas de cálculo y el botón/enlace «Abrir manual completo». Con script tipo `scripts/odoo-f07-vistas-es.py` (idempotente, con rollback).
Opción C (~30 min): menú «📖 Manual de uso» bajo Higiene y Seguridad › Fichas (menú 1357) con una acción `ir.actions.act_url` a `/#/manual` (target nueva pestaña).
Recomiendo A + C ahora y B después.
