import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_ROWS, normalizeTipoServicio, rowsToProjects, splitResponsable, TIPOS_SERVICIO, validateProject } from "./projects.mjs";

const HEADER = ["CONTRAPARTE", "PROYECTO/ACTIVIDAD", "PERFIL / ESTUDIANTE", "HORARIO / DÍAS", "RESPONSABLE", "TIPO DE SERVICIO SOCIAL", "UBICACIÓN"];
const fila = (institucion, nombre, responsable = "Oscar Arias\noarias@uca.edu.sv") => [
  institucion, nombre, "Estudiantes de Ing. Civil de\n4to. año en adelante", "De lunes a viernes", responsable, "Externo", "Consultar con\ncoordinador",
];
const valido = {
  institucion: "ANDA", nombre: "Apoyo en SAP", perfil: "Estudiantes de Informática", horario: "Lunes a viernes",
  responsable: "Oscar Arias", responsable_correo: "", tipo_servicio: "Externo", ubicacion: "Consultar con coordinador",
};

test("un proyecto necesita los siete campos de la hoja; el correo del responsable es opcional", () => {
  assert.deepEqual(validateProject(valido), {});
  const errors = validateProject({ ...valido, nombre: " ", perfil: "x".repeat(1001), responsable_correo: "oarias@" });
  assert.match(errors.nombre, /nombre del proyecto/);
  assert.match(errors.perfil, /entre 2 y 1000/);
  assert.match(errors.responsable_correo, /no es válido/);
});

test("separa nombre y correo del responsable, aunque el correo venga partido en dos líneas", () => {
  assert.deepEqual(splitResponsable("Oscar Arias\noarias@uca.edu.sv"), { responsable: "Oscar Arias", responsable_correo: "oarias@uca.edu.sv" });
  assert.deepEqual(splitResponsable("Mauricio Martinez\n\nmomartinezs@uca.edu.\nsv"), { responsable: "Mauricio Martinez", responsable_correo: "momartinezs@uca.edu.sv" });
  assert.deepEqual(splitResponsable("Walter Tilo"), { responsable: "Walter Tilo", responsable_correo: "" });
});

test("el tipo de servicio es una lista cerrada; el texto de la hoja se normaliza", () => {
  assert.equal(TIPOS_SERVICIO.length, 8);
  assert.equal(normalizeTipoServicio("Interno, Presencial "), "Interno - Presencial");
  assert.equal(normalizeTipoServicio("Externas"), "Externo");
  assert.equal(normalizeTipoServicio("externo - SEMIPRESENCIAL"), "Externo - Semipresencial");
  assert.equal(normalizeTipoServicio("Interno - Virtual"), "Interno - Virtual");
  assert.match(validateProject({ ...valido, tipo_servicio: "Voluntariado" }).tipo_servicio, /Interno o Externo/);
  assert.match(validateProject({ ...valido, tipo_servicio: "Interno y externo" }).tipo_servicio, /Interno o Externo/);
});

test("lee la hoja de la coordinación con su encabezado y usa el número de fila de Excel", () => {
  const { proyectos, errores } = rowsToProjects([
    ["Proyectos de servicio social 2026"],
    HEADER,
    fila("ANDA", "Apoyo en  SAP"),
    [null, null],
    fila("Modalidades flexibles - INAC", "Apoyo en Modalidades Flexibles"),
    fila("Modalidades flexibles - Walter Tilo", "Apoyo en Modalidades Flexibles"),
  ]);
  assert.deepEqual(errores, []);
  assert.deepEqual(proyectos.map(({ fila: f }) => f), [3, 5, 6]);
  assert.deepEqual(proyectos[0], {
    fila: 3, institucion: "ANDA", nombre: "Apoyo en SAP", perfil: "Estudiantes de Ing. Civil de 4to. año en adelante",
    horario: "De lunes a viernes", responsable: "Oscar Arias", responsable_correo: "oarias@uca.edu.sv",
    tipo_servicio: "Externo", ubicacion: "Consultar con coordinador",
  });
});

test("sin encabezado toma las columnas A a G; reporta filas incompletas y repetidas en la misma contraparte", () => {
  const { proyectos, errores } = rowsToProjects([
    fila("ANDA", "Apoyo en SAP"),
    ["ANDA", "Sin perfil"],
    fila("anda", "apoyo en SAP"),
  ]);
  assert.equal(proyectos.length, 1);
  assert.deepEqual(errores.map(({ fila: f }) => f), [2, 3]);
  assert.match(errores[1].mensaje, /repetido \(fila 1\)/);
});

test("rechaza archivos con demasiados proyectos", () => {
  const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => fila("UCA", `Proyecto ${i}`));
  assert.match(rowsToProjects(rows).errores[0].mensaje, /más de 500/);
});
