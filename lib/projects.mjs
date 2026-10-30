// Alta de proyectos por la coordinación: a mano o desde Excel. Mismas reglas en el navegador y en el servidor.
// El formato es el de la hoja de la coordinación; "Contraparte" es la institución receptora.
import { normalizeSearchText } from "./registration-form.mjs";

export const PROJECT_TEXT_MIN = 2;
export const MAX_IMPORT_ROWS = 500;
// La palabra que la coordinación escribe para confirmar que elimina un proyecto para siempre.
export const CONFIRMAR_ELIMINAR = "ELIMINAR";

/** Columnas de la hoja, en su orden. `encabezado` reconoce el título de la columna (sin tildes ni mayúsculas). */
export const PROJECT_COLUMNS = [
  { campo: "institucion", titulo: "Contraparte", falta: "Indica la contraparte.", max: 200, encabezado: /contraparte|institucion/ },
  { campo: "nombre", titulo: "Proyecto / actividad", falta: "Indica el nombre del proyecto o actividad.", max: 200, encabezado: /proyecto|actividad/ },
  { campo: "perfil", titulo: "Perfil / estudiante", falta: "Describe el perfil del estudiante.", max: 1000, encabezado: /perfil|estudiante/ },
  { campo: "horario", titulo: "Horario / días", falta: "Indica los días y el horario.", max: 1000, encabezado: /horario|dias/ },
  { campo: "responsable", titulo: "Responsable", falta: "Indica el nombre del responsable.", max: 200, encabezado: /responsable/ },
  { campo: "tipo_servicio", titulo: "Tipo de servicio social", falta: "Elige el tipo de servicio social.", max: 200, encabezado: /tipo|servicio/ },
  { campo: "ubicacion", titulo: "Ubicación", falta: "Indica la ubicación, o «Consultar con coordinador».", max: 1000, encabezado: /ubicacion|direccion/ },
];

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Tipos de servicio social: interno o externo, solo o con su modalidad. Debe coincidir con la migración 0006. */
export const ORIGENES = ["Interno", "Externo"];
export const MODALIDADES = ["Presencial", "Semipresencial", "Virtual"];
export const TIPOS_SERVICIO = ORIGENES.flatMap((origen) => [origen, ...MODALIDADES.map((modalidad) => `${origen} - ${modalidad}`)]);

export function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

const cleanEmail = (value) => String(value ?? "").replace(/\s+/g, "").toLowerCase();
const key = (text) => normalizeSearchText(cleanText(text));

/**
 * Lleva el texto libre de la hoja ("Interno, Presencial", "Externas", "externo - semipresencial") a un valor de
 * TIPOS_SERVICIO. Si no se reconoce interno o externo, devuelve el texto limpio y la validación lo rechaza.
 */
export function normalizeTipoServicio(value) {
  const text = key(value);
  const interno = /intern/.test(text);
  if (interno === /extern/.test(text)) return cleanText(value);
  const modalidad = /semipresencial|semi-presencial/.test(text) ? "Semipresencial"
    : /presencial/.test(text) ? "Presencial"
      : /virtual|en linea/.test(text) ? "Virtual" : "";
  return `${interno ? "Interno" : "Externo"}${modalidad ? ` - ${modalidad}` : ""}`;
}

/** Proyecto con todos los campos limpios (espacios, correo en minúsculas). */
export function cleanProject(item) {
  const proyecto = Object.fromEntries(PROJECT_COLUMNS.map(({ campo }) => [campo, cleanText(item?.[campo])]));
  proyecto.responsable_correo = cleanEmail(item?.responsable_correo);
  if (proyecto.tipo_servicio) proyecto.tipo_servicio = normalizeTipoServicio(proyecto.tipo_servicio);
  return proyecto;
}

/**
 * La celda RESPONSABLE trae nombre y correo juntos ("Oscar Arias\noarias@uca.edu.sv"); a veces el correo
 * viene partido en dos líneas ("momartinezs@uca.edu.\nsv"). Todo desde la palabra con "@" es el correo.
 */
export function splitResponsable(value) {
  const text = String(value ?? "");
  const at = text.indexOf("@");
  if (at < 0) return { responsable: cleanText(text), responsable_correo: "" };
  const start = text.slice(0, at).search(/\S+$/);
  return { responsable: cleanText(text.slice(0, start)), responsable_correo: cleanEmail(text.slice(start)) };
}

/** @returns {Record<string, string>} errores por campo (vacío si es válido) */
export function validateProject(proyecto) {
  const errors = {};
  for (const { campo, titulo, falta, max } of PROJECT_COLUMNS) {
    const text = cleanText(proyecto[campo]);
    if (!text) errors[campo] = falta;
    else if (text.length < PROJECT_TEXT_MIN || text.length > max) {
      errors[campo] = `${titulo} debe tener entre ${PROJECT_TEXT_MIN} y ${max} caracteres.`;
    }
  }
  if (!errors.tipo_servicio && !TIPOS_SERVICIO.includes(normalizeTipoServicio(proyecto.tipo_servicio))) {
    errors.tipo_servicio = "El tipo de servicio debe ser Interno o Externo, con su modalidad si la tiene (Presencial, Semipresencial o Virtual).";
  }
  const correo = cleanEmail(proyecto.responsable_correo);
  if (correo && !EMAIL_PATTERN.test(correo)) errors.responsable_correo = "El correo del responsable no es válido.";
  return errors;
}

/**
 * Convierte las filas de una hoja (arreglos de celdas) en proyectos.
 * Busca el encabezado (Contraparte y Proyecto en cualquier orden); sin encabezado usa las columnas A a G
 * en el orden de PROJECT_COLUMNS.
 * @param {unknown[][]} rows
 * @returns {{ proyectos: ({ fila: number } & Record<string, string>)[], errores: { fila: number, mensaje: string }[] }}
 */
export function rowsToProjects(rows) {
  const columnas = (row) => PROJECT_COLUMNS.map(({ encabezado }) => row.findIndex((cell) => encabezado.test(key(cell))));
  const headerIndex = rows.findIndex((row) => {
    const [institucion, nombre] = columnas(row);
    return institucion >= 0 && nombre >= 0;
  });
  const indices = headerIndex >= 0 ? columnas(rows[headerIndex]) : PROJECT_COLUMNS.map((_, i) => i);

  const proyectos = [];
  const errores = [];
  const vistos = new Map();

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const fila = headerIndex + 2 + i; // número de fila como lo muestra Excel
    const celdas = Object.fromEntries(PROJECT_COLUMNS.map(({ campo }, c) => [campo, indices[c] >= 0 ? row[indices[c]] : ""]));
    if (Object.values(celdas).every((cell) => !cleanText(cell))) return;

    const proyecto = cleanProject({ ...celdas, ...splitResponsable(celdas.responsable) });
    const fieldErrors = Object.values(validateProject(proyecto));
    const id = `${key(proyecto.institucion)}|${key(proyecto.nombre)}`;
    if (fieldErrors.length) {
      errores.push({ fila, mensaje: fieldErrors.join(" ") });
    } else if (vistos.has(id)) {
      errores.push({ fila, mensaje: `"${proyecto.nombre}" de ${proyecto.institucion} está repetido (fila ${vistos.get(id)}).` });
    } else {
      vistos.set(id, fila);
      proyectos.push({ fila, ...proyecto });
    }
  });

  if (proyectos.length + errores.length > MAX_IMPORT_ROWS) {
    errores.unshift({ fila: 0, mensaje: `El archivo tiene más de ${MAX_IMPORT_ROWS} proyectos; divídelo en varios.` });
  }
  return { proyectos, errores };
}
