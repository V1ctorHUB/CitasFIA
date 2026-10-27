import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_ROWS, rowsToProjects, validateProject } from "./projects.mjs";

test("un proyecto necesita nombre e institución de 2 a 200 caracteres", () => {
  assert.deepEqual(validateProject({ nombre: "Huertos escolares", institucion: "Alcaldía de Soyapango" }), {});
  const errors = validateProject({ nombre: " ", institucion: "x".repeat(201) });
  assert.match(errors.nombre, /nombre del proyecto/);
  assert.match(errors.institucion, /entre 2 y 200/);
});

test("lee la hoja con encabezado en cualquier orden y usa el número de fila de Excel", () => {
  const { proyectos, errores } = rowsToProjects([
    ["Listado de proyectos 2027"],
    ["Institución receptora", "Nombre del proyecto"],
    ["FUSADES", "  Censo   comunitario "],
    [null, null],
    ["Cruz Roja", "Brigadas de salud"],
  ]);
  assert.deepEqual(errores, []);
  assert.deepEqual(proyectos, [
    { fila: 3, nombre: "Censo comunitario", institucion: "FUSADES" },
    { fila: 5, nombre: "Brigadas de salud", institucion: "Cruz Roja" },
  ]);
});

test("sin encabezado toma las columnas A y B; reporta filas incompletas y repetidas", () => {
  const { proyectos, errores } = rowsToProjects([
    ["Censo comunitario", "FUSADES"],
    ["Sin institución", ""],
    ["censo COMUNITARIO", "Otra"],
  ]);
  assert.equal(proyectos.length, 1);
  assert.deepEqual(errores.map(({ fila }) => fila), [2, 3]);
  assert.match(errores[1].mensaje, /repetido \(fila 1\)/);
});

test("rechaza archivos con demasiados proyectos", () => {
  const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`Proyecto ${i}`, "UCA"]);
  assert.match(rowsToProjects(rows).errores[0].mensaje, /más de 500/);
});
