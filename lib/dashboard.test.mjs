import test from "node:test";
import assert from "node:assert/strict";
import { alternarFiltro, aplicarFiltros, contar, excelXml, resumen } from "./dashboard.mjs";

const cita = (genero, facultad, estado, extra = {}) => ({
  genero, facultad, estado, carrera: "X", proyecto: "P", ciclo_egreso: "01/2027", ...extra,
});
const citas = [
  cita("masculino", "FIA", "ASISTIO"),
  cita("masculino", "Humanidades", "NO_ASISTIO"),
  cita("femenino", "FIA", "ASISTIO"),
  cita("femenino", "FIA", "CONFIRMADA"),
  cita("otro", "Humanidades", "PENDIENTE_CONFIRMACION"),
];

test("elegir Masculino filtra todos los demás gráficos, pero el de género conserva sus alternativas", () => {
  const filtros = alternarFiltro({}, "genero", "masculino");

  assert.equal(aplicarFiltros(citas, filtros).length, 2);
  assert.deepEqual(contar(aplicarFiltros(citas, filtros, "facultad"), "facultad").map(({ etiqueta, n }) => [etiqueta, n]), [["FIA", 1], ["Humanidades", 1]]);
  assert.equal(aplicarFiltros(citas, filtros, "genero").length, citas.length);
});

test("los filtros se combinan: valores de una dimensión con 'o', dimensiones distintas con 'y'", () => {
  let filtros = alternarFiltro({}, "genero", "masculino");
  filtros = alternarFiltro(filtros, "genero", "femenino");
  assert.equal(aplicarFiltros(citas, filtros).length, 4);

  filtros = alternarFiltro(filtros, "facultad", "FIA");
  assert.equal(aplicarFiltros(citas, filtros).length, 3);

  filtros = alternarFiltro(filtros, "genero", "femenino");
  assert.deepEqual(filtros.genero, ["masculino"]);
  assert.equal(aplicarFiltros(citas, filtros).length, 1);
});

test("el conteo respeta el orden del catálogo, incluye ceros y calcula porcentajes", () => {
  const filas = contar(citas, "genero", ["femenino", "masculino", "otro", "prefiero-no-indicarlo"]);
  assert.deepEqual(filas.map(({ n }) => n), [2, 2, 1, 0]);
  assert.equal(filas[0].etiqueta, "Femenino");
  assert.equal(filas[0].pct, 40);
  assert.deepEqual(contar(citas, "asistencia").map(({ valor }) => valor), ["ASISTIO", "POR_REALIZAR", "NO_ASISTIO"]);
});

test("el resumen cuenta asistencias, inasistencias y citas por realizar", () => {
  assert.deepEqual(resumen(citas), { total: 5, asistio: 2, noAsistio: 1, porRealizar: 2, ratio: 40 });
  assert.equal(resumen([]).ratio, null);
});

test("la exportación a Excel neutraliza fórmulas y escapa XML", () => {
  const xml = excelXml([cita("femenino", "FIA", "ASISTIO", { nombreCompleto: "=HYPERLINK(\"x\")", proyecto: "<b>&" })]);
  assert.match(xml, /'=HYPERLINK\(&quot;x&quot;\)/);
  assert.match(xml, /&lt;b&gt;&amp;/);
  assert.match(xml, /<Data ss:Type="String">Teléfono<\/Data>/);
});
