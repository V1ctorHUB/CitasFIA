// Dashboard BI: filtros cruzados estilo Power BI. Elegir un valor en un gráfico filtra a todos los demás;
// cada gráfico se calcula con los filtros de las OTRAS dimensiones para seguir mostrando sus alternativas.
import { GENDER_LABELS } from "./registration-form.mjs";

const ASISTENCIA_LABEL = { ASISTIO: "Asistió", NO_ASISTIO: "No asistió", POR_REALIZAR: "Por realizar" };

export const DIMENSIONES = {
  genero: { titulo: "Género", valor: (c) => c.genero, etiqueta: (v) => GENDER_LABELS[v] ?? v },
  asistencia: {
    titulo: "Asistencia",
    valor: (c) => (c.estado === "ASISTIO" || c.estado === "NO_ASISTIO" ? c.estado : "POR_REALIZAR"),
    etiqueta: (v) => ASISTENCIA_LABEL[v] ?? v,
  },
  facultad: { titulo: "Facultad", valor: (c) => c.facultad, etiqueta: (v) => v },
  carrera: { titulo: "Carrera", valor: (c) => c.carrera, etiqueta: (v) => v },
  proyecto: { titulo: "Proyecto", valor: (c) => c.proyecto, etiqueta: (v) => v },
  egreso: { titulo: "Ciclo de egreso", valor: (c) => c.ciclo_egreso, etiqueta: (v) => v },
};

/** Citas que cumplen todos los filtros, ignorando opcionalmente los de la dimensión `excepto`. */
export function aplicarFiltros(citas, filtros, excepto = null) {
  const activos = Object.entries(filtros).filter(([dim, valores]) => dim !== excepto && valores.length > 0);
  return citas.filter((cita) => activos.every(([dim, valores]) => valores.includes(DIMENSIONES[dim].valor(cita))));
}

/**
 * Selección como en Power BI: un clic deja solo ese valor; clic sobre el único valor elegido lo quita;
 * con `multiple` (Ctrl/⌘ + clic) se agrega o quita sin tocar los demás. Varios valores de una dimensión = "o".
 */
export function seleccionar(filtros, dim, valor, multiple = false) {
  const actuales = filtros[dim] ?? [];
  let valores;
  if (multiple) valores = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
  else valores = actuales.length === 1 && actuales[0] === valor ? [] : [valor];

  const { [dim]: _, ...resto } = filtros;
  return valores.length ? { ...resto, [dim]: valores } : resto;
}

/**
 * Conteo por valor de una dimensión, de mayor a menor. `orden` fija el orden de un catálogo
 * (p. ej. género) para que el color siga a la categoría y no a su posición.
 * @returns {{ valor: string, etiqueta: string, n: number, pct: number }[]}
 */
export function contar(citas, dim, orden = null) {
  const { valor, etiqueta } = DIMENSIONES[dim];
  const conteo = new Map((orden ?? []).map((v) => [v, 0]));
  for (const cita of citas) conteo.set(valor(cita), (conteo.get(valor(cita)) ?? 0) + 1);

  const filas = [...conteo].map(([v, n]) => ({
    valor: v,
    etiqueta: etiqueta(v),
    n,
    pct: citas.length ? Math.round((100 * n) / citas.length) : 0,
  }));
  return orden ? filas : filas.sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

export function resumen(citas) {
  const asistio = citas.filter((c) => c.estado === "ASISTIO").length;
  const noAsistio = citas.filter((c) => c.estado === "NO_ASISTIO").length;
  return {
    total: citas.length,
    asistio,
    noAsistio,
    porRealizar: citas.length - asistio - noAsistio,
    // Efectividad = asistencias sobre citas agendadas en el periodo (definición del mockup aprobado).
    ratio: citas.length ? Math.round((100 * asistio) / citas.length) : null,
  };
}

const EXCEL_COLUMNAS = [
  "Caso", "Fecha Cita", "Hora Cita", "Estado Confirmación", "Estado Asistencia", "Nombre Completo", "Carnet",
  "Correo Institucional", "Teléfono", "DUI", "Género", "Carrera", "Facultad", "Ciclo de Egreso (CC/AAAA)",
  "ID Proyecto", "Proyecto", "Institución Receptora",
];

// Prefijo contra inyección de fórmulas (=, +, -, @) y escape XML.
function celdaSegura(valor) {
  let texto = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Hoja de cálculo SpreadsheetML (.xls) que Excel abre sin dependencias. */
export function excelXml(citas) {
  const celda = (v) => `<Cell><Data ss:Type="String">${celdaSegura(v)}</Data></Cell>`;
  const filas = citas.map((c) => [
    c.caso, c.fecha, c.hora,
    c.estado === "PENDIENTE_CONFIRMACION" ? "Pendiente de confirmación" : "Confirmada",
    DIMENSIONES.asistencia.etiqueta(DIMENSIONES.asistencia.valor(c)),
    c.nombreCompleto, c.carnet, c.correo, c.telefono ?? "", c.dui, GENDER_LABELS[c.genero] ?? c.genero,
    c.carrera, c.facultad, c.ciclo_egreso, c.proyecto_id, c.proyecto, c.institucion,
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n`
    + `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`
    + `<Worksheet ss:Name="Citas"><Table><Row>${EXCEL_COLUMNAS.map(celda).join("")}</Row>`
    + filas.map((fila) => `<Row>${fila.map(celda).join("")}</Row>`).join("")
    + `</Table></Worksheet></Workbook>`;
}
