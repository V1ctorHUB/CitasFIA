// Alta de proyectos por la coordinación: a mano o desde Excel. Mismas reglas en el navegador y en el servidor.
import { normalizeSearchText } from "./registration-form.mjs";

export const PROJECT_TEXT_MIN = 2;
export const PROJECT_TEXT_MAX = 200;
export const MAX_IMPORT_ROWS = 500;

export function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

const key = (text) => normalizeSearchText(cleanText(text));

/** @returns {Record<string, string>} errores por campo (vacío si es válido) */
export function validateProject({ nombre, institucion }) {
  const errors = {};
  const check = (field, value, label) => {
    const text = cleanText(value);
    if (!text) errors[field] = `Escribe ${label}.`;
    else if (text.length < PROJECT_TEXT_MIN || text.length > PROJECT_TEXT_MAX) {
      errors[field] = `${label[0].toUpperCase()}${label.slice(4)} debe tener entre ${PROJECT_TEXT_MIN} y ${PROJECT_TEXT_MAX} caracteres.`;
    }
  };
  check("nombre", nombre, "el nombre del proyecto");
  check("institucion", institucion, "la institución receptora");
  return errors;
}

/**
 * Convierte las filas de una hoja (arreglos de celdas) en proyectos.
 * Busca un encabezado con "Proyecto" e "Institución" en cualquier orden; sin encabezado usa las columnas A y B.
 * @param {unknown[][]} rows
 * @returns {{ proyectos: { fila: number, nombre: string, institucion: string }[], errores: { fila: number, mensaje: string }[] }}
 */
export function rowsToProjects(rows) {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(key);
    return cells.some((c) => c.includes("proyecto")) && cells.some((c) => c.includes("institucion"));
  });
  const header = headerIndex >= 0 ? rows[headerIndex].map(key) : null;
  const nombreCol = header ? header.findIndex((c) => c.includes("proyecto")) : 0;
  const institucionCol = header ? header.findIndex((c) => c.includes("institucion")) : 1;

  const proyectos = [];
  const errores = [];
  const vistos = new Map();

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const fila = headerIndex + 2 + i; // número de fila como lo muestra Excel
    const nombre = cleanText(row[nombreCol]);
    const institucion = cleanText(row[institucionCol]);
    if (!nombre && !institucion) return;

    const fieldErrors = Object.values(validateProject({ nombre, institucion }));
    if (fieldErrors.length) {
      errores.push({ fila, mensaje: fieldErrors.join(" ") });
    } else if (vistos.has(key(nombre))) {
      errores.push({ fila, mensaje: `"${nombre}" está repetido (fila ${vistos.get(key(nombre))}).` });
    } else {
      vistos.set(key(nombre), fila);
      proyectos.push({ fila, nombre, institucion });
    }
  });

  if (proyectos.length + errores.length > MAX_IMPORT_ROWS) {
    errores.unshift({ fila: 0, mensaje: `El archivo tiene más de ${MAX_IMPORT_ROWS} proyectos; divídelo en varios.` });
  }
  return { proyectos, errores };
}
