// Genera el manual en Markdown desde componentes/manual-contenido.js: node scripts/manual-a-md.mjs > manual.md
import { MANUAL, MANUAL_GENERAL } from "../componentes/manual-contenido.js";
const li = (items, n = 0) => items.map((x) => Array.isArray(x) ? `${"  ".repeat(n)}- ${x[0]}\n${li(x[1], n + 1)}` : `${"  ".repeat(n)}- ${x}\n`).join("");
let o = `# Manual de uso · Fichas HyS (hys-carga)\n\n## ${MANUAL_GENERAL.titulo}\n\n`;
for (const [t, it] of MANUAL_GENERAL.secciones) o += `### ${t}\n\n${li(it)}\n`;
for (const [c, m] of Object.entries(MANUAL)) {
  o += `## ${c} · ${m.titulo}\n\n**Para qué sirve.** ${m.para}\n\n**Quién la carga y quién la ve.** ${m.quien}\n\n### Cómo cargarla\n\n`;
  o += m.pasos.map(([t, x], i) => `${i + 1}. **${t}:** ${x}`).join("\n") + "\n\n### Qué pasa después y cómo calcula\n\n" + li(m.despues) + "\n";
  if (m.faq?.length) o += "### Preguntas frecuentes\n\n" + m.faq.map(([p, r]) => `- **${p}** ${r}`).join("\n") + "\n\n";
}
process.stdout.write(o);
