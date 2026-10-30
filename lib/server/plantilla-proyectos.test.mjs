import test from "node:test";
import assert from "node:assert/strict";
import { readSheet } from "read-excel-file/node";
import { rowsToProjects } from "../projects.mjs";
import { plantillaProyectos } from "./plantilla-proyectos.mjs";

test("la plantilla es un .xlsx que el importador lee: hoja Proyectos vacía y ejemplo válido", async () => {
  const archivo = plantillaProyectos();
  const proyectos = await readSheet(archivo);
  assert.deepEqual(proyectos[0], ["CONTRAPARTE", "PROYECTO / ACTIVIDAD", "PERFIL / ESTUDIANTE", "HORARIO / DÍAS", "RESPONSABLE", "TIPO DE SERVICIO SOCIAL", "UBICACIÓN"]);
  assert.deepEqual(rowsToProjects(proyectos), { proyectos: [], errores: [] });

  const ejemplo = rowsToProjects(await readSheet(archivo, 2));
  assert.deepEqual(ejemplo.errores, []);
  assert.equal(ejemplo.proyectos.length, 2);
  assert.equal(ejemplo.proyectos[0].responsable_correo, "aperez@uca.edu.sv");
});
