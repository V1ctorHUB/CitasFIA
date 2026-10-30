// Plantilla de importación de proyectos, armada a partir de las mismas columnas que lee rowsToProjects.
import { PROJECT_COLUMNS } from "../projects.mjs";
import { crearXlsx } from "../xlsx.mjs";

const ANCHOS = { institucion: 34, nombre: 44, perfil: 46, horario: 36, responsable: 28, tipo_servicio: 26, ubicacion: 40 };

const EJEMPLOS = [
  {
    institucion: "Fundación Comunitaria", nombre: "Apoyo en soporte técnico",
    perfil: "Estudiantes de Ing. Informática de 3.er año en adelante", horario: "Lunes, miércoles y viernes, de 8:00 a. m. a 12:00 m.",
    responsable: "Ana Pérez\naperez@uca.edu.sv", tipo_servicio: "Externo - Presencial", ubicacion: "Consultar con coordinador",
  },
  {
    institucion: "Fundación Comunitaria", nombre: "Diseño de un vivero",
    perfil: "3 estudiantes de Ingeniería Industrial de 3.er año en adelante", horario: "3 visitas de campo y trabajo en casa",
    responsable: "Ana Pérez\naperez@uca.edu.sv", tipo_servicio: "Externo", ubicacion: "Colonia Escalón, San Salvador",
  },
];

/** La primera hoja ("Proyectos") va vacía: es la que se importa. La hoja "Ejemplo" nunca se lee al importar. */
export function plantillaProyectos() {
  const encabezado = PROJECT_COLUMNS.map(({ titulo }) => titulo.toUpperCase());
  const anchos = PROJECT_COLUMNS.map(({ campo }) => ANCHOS[campo]);
  return crearXlsx([
    { nombre: "Proyectos", filas: [encabezado], anchos },
    { nombre: "Ejemplo", filas: [encabezado, ...EJEMPLOS.map((e) => PROJECT_COLUMNS.map(({ campo }) => e[campo]))], anchos },
  ]);
}
