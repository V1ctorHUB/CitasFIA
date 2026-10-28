// Dashboard BI: filtros cruzados estilo Power BI. Elegir un valor en un gráfico filtra a todos los demás;
// cada gráfico se calcula con los filtros de las OTRAS dimensiones para seguir mostrando sus alternativas.
import { addDays, DIAS, formatShortDate, HORAS, isoDate, MESES, mondayOf, parseIsoDate } from "./agenda.mjs";
import { GENDER_LABELS } from "./registration-form.mjs";

const ASISTENCIA_LABEL = { ASISTIO: "Asistió", NO_ASISTIO: "No asistió", POR_REALIZAR: "Por realizar" };
export const ORDEN_ASISTENCIA = ["ASISTIO", "NO_ASISTIO", "POR_REALIZAR"];
// Hasta dos semanas la tendencia va por día; más largo, por semana (pocas columnas, fáciles de leer).
const MAX_DIAS_DIARIO = 14;
const diaSemana = (iso) => (parseIsoDate(iso).getDay() + 6) % 7; // 0 = lunes
/** "28 sep" */
export const diaMes = (iso) => `${Number(iso.slice(8))} ${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;

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
  dia: { titulo: "Día", valor: (c) => c.fecha, etiqueta: (v) => formatShortDate(v) },
  semana: { titulo: "Semana", valor: (c) => isoDate(mondayOf(parseIsoDate(c.fecha))), etiqueta: (v) => `Semana del ${diaMes(v)}` },
  diaSemana: { titulo: "Día de la semana", valor: (c) => String(diaSemana(c.fecha)), etiqueta: (v) => DIAS[Number(v)] },
  hora: { titulo: "Hora", valor: (c) => c.hora, etiqueta: (v) => v },
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
    // Tasa de asistencia efectiva: solo sobre citas ya resueltas; las futuras no la castigan.
    ratio: asistio + noAsistio ? Math.round((100 * asistio) / (asistio + noAsistio)) : null,
  };
}

/** Conteo por valor de `dim` desglosado por asistencia. @returns {{ valor, etiqueta, n, ASISTIO, NO_ASISTIO, POR_REALIZAR }[]} */
export function desglosar(citas, dim, valores = null) {
  const { valor, etiqueta } = DIMENSIONES[dim];
  const filas = new Map((valores ?? []).map((v) => [v, null]));
  for (const cita of citas) if (!valores || filas.has(valor(cita))) filas.set(valor(cita), null);
  const vacia = (v) => ({ valor: v, etiqueta: etiqueta(v), n: 0, ASISTIO: 0, NO_ASISTIO: 0, POR_REALIZAR: 0 });
  for (const v of filas.keys()) filas.set(v, vacia(v));
  for (const cita of citas) {
    const fila = filas.get(valor(cita));
    if (!fila) continue;
    fila.n += 1;
    fila[DIMENSIONES.asistencia.valor(cita)] += 1;
  }
  return [...filas.values()];
}

/** Fechas límite del periodo; sin límite elegido ("Todo") se usan la primera y la última cita. */
export function limites(citas, desde, hasta) {
  const fechas = citas.map(({ fecha }) => fecha).sort();
  const inicio = desde || fechas[0];
  const fin = hasta || fechas.at(-1);
  return inicio && fin && inicio <= fin ? { inicio, fin } : null;
}

/** Días del periodo, uno por fecha (YYYY-MM-DD). */
function diasEntre({ inicio, fin }) {
  const dias = [];
  for (let d = parseIsoDate(inicio); isoDate(d) <= fin; d = addDays(d, 1)) dias.push(isoDate(d));
  return dias;
}

/**
 * Tendencia del periodo: por día hábil si dura hasta 14 días, si no por semana (lunes).
 * @returns {{ dim: "dia" | "semana", filas: ReturnType<typeof desglosar> }}
 */
export function tendencia(citas, rango) {
  if (!rango) return { dim: "dia", filas: [] };
  const dias = diasEntre(rango);
  if (dias.length <= MAX_DIAS_DIARIO) return { dim: "dia", filas: desglosar(citas, "dia", dias.filter((d) => diaSemana(d) < 5)) };
  const semanas = [...new Set(dias.map((d) => isoDate(mondayOf(parseIsoDate(d)))))];
  return { dim: "semana", filas: desglosar(citas, "semana", semanas) };
}

/**
 * Ocupación por día de la semana o por hora: citas sobre los horarios disponibles del periodo
 * (días hábiles × horas), sin contar los días desactivados.
 * @param {"diaSemana" | "hora"} dim
 * @returns {{ valor: string, etiqueta: string, n: number, capacidad: number, pct: number }[]}
 */
export function ocupacion(citas, rango, bloqueados, dim) {
  const diasHabiles = [0, 0, 0, 0, 0];
  if (rango) for (const d of diasEntre(rango)) if (diaSemana(d) < 5 && !bloqueados.includes(d)) diasHabiles[diaSemana(d)] += 1;
  const totalDias = diasHabiles.reduce((suma, n) => suma + n, 0);
  const grupos = dim === "hora"
    ? HORAS.map((hora) => [hora, totalDias])
    : diasHabiles.map((dias, dia) => [String(dia), dias * HORAS.length]);

  return grupos.map(([valor, capacidad]) => {
    const n = citas.filter((c) => DIMENSIONES[dim].valor(c) === valor).length;
    return { valor, etiqueta: DIMENSIONES[dim].etiqueta(valor), n, capacidad, pct: capacidad ? Math.min(100, Math.round((100 * n) / capacidad)) : 0 };
  });
}

/** Ciclos "CC/AAAA" en orden cronológico. */
export const porCiclo = (a, b) => a.valor.slice(3).localeCompare(b.valor.slice(3)) || a.valor.localeCompare(b.valor);

/** Ciclo académico en curso: 01 de enero a junio, 02 de julio a diciembre. */
export const cicloActual = (hoy) => `${Number(hoy.slice(5, 7)) <= 6 ? "01" : "02"}/${hoy.slice(0, 4)}`;

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
