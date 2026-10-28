import test from "node:test";
import assert from "node:assert/strict";
import { aplicarFiltros, cicloActual, contar, desglosar, excelXml, limites, ocupacion, porCiclo, resumen, seleccionar, tendencia } from "./dashboard.mjs";

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
  const filtros = seleccionar({}, "genero", "masculino");

  assert.equal(aplicarFiltros(citas, filtros).length, 2);
  assert.deepEqual(contar(aplicarFiltros(citas, filtros, "facultad"), "facultad").map(({ etiqueta, n }) => [etiqueta, n]), [["FIA", 1], ["Humanidades", 1]]);
  assert.equal(aplicarFiltros(citas, filtros, "genero").length, citas.length);
});

test("clic elige solo ese valor y otro clic lo quita; Ctrl/⌘ + clic suma valores", () => {
  let filtros = seleccionar({}, "genero", "masculino");
  filtros = seleccionar(filtros, "genero", "femenino");
  assert.deepEqual(filtros, { genero: ["femenino"] });
  assert.deepEqual(seleccionar(filtros, "genero", "femenino"), {});

  filtros = seleccionar(filtros, "genero", "masculino", true);
  assert.deepEqual(filtros.genero, ["femenino", "masculino"]);
  assert.equal(aplicarFiltros(citas, filtros).length, 4);
  assert.deepEqual(seleccionar(filtros, "genero", "femenino", true), { genero: ["masculino"] });
});

test("filtros de distintos gráficos se combinan: Masculino y FIA", () => {
  const filtros = seleccionar(seleccionar({}, "genero", "masculino"), "facultad", "FIA");
  assert.deepEqual(aplicarFiltros(citas, filtros).map(({ estado }) => estado), ["ASISTIO"]);
});

test("el conteo respeta el orden del catálogo, incluye ceros y calcula porcentajes", () => {
  const filas = contar(citas, "genero", ["femenino", "masculino", "otro", "prefiero-no-indicarlo"]);
  assert.deepEqual(filas.map(({ n }) => n), [2, 2, 1, 0]);
  assert.equal(filas[0].etiqueta, "Femenino");
  assert.equal(filas[0].pct, 40);
  assert.deepEqual(contar(citas, "asistencia").map(({ valor }) => valor), ["ASISTIO", "POR_REALIZAR", "NO_ASISTIO"]);
});

test("el resumen cuenta asistencias, inasistencias y citas por realizar", () => {
  // La tasa solo considera citas resueltas: 2 asistencias de 3, las 2 futuras no cuentan.
  assert.deepEqual(resumen(citas), { total: 5, asistio: 2, noAsistio: 1, porRealizar: 2, ratio: 67 });
  assert.equal(resumen([cita("otro", "FIA", "CONFIRMADA")]).ratio, null);
});

test("la exportación a Excel neutraliza fórmulas y escapa XML", () => {
  const xml = excelXml([cita("femenino", "FIA", "ASISTIO", { nombreCompleto: "=HYPERLINK(\"x\")", proyecto: "<b>&" })]);
  assert.match(xml, /'=HYPERLINK\(&quot;x&quot;\)/);
  assert.match(xml, /&lt;b&gt;&amp;/);
  assert.match(xml, /<Data ss:Type="String">Teléfono<\/Data>/);
});

const conFecha = (fecha, hora, estado, ciclo_egreso = "01/2027") => cita("otro", "FIA", estado, { fecha, hora, ciclo_egreso });

test("la tendencia va por día hábil en periodos cortos y por semana en los largos", () => {
  // 2026-10-05 es lunes.
  const datos = [conFecha("2026-10-05", "08:00", "ASISTIO"), conFecha("2026-10-07", "09:00", "NO_ASISTIO"), conFecha("2026-10-07", "10:00", "CONFIRMADA")];
  const corta = tendencia(datos, limites(datos, "2026-10-05", "2026-10-11"));
  assert.equal(tendencia(datos, limites(datos, "2026-10-05", "2026-10-31")).dim, "semana");
  assert.equal(corta.dim, "dia");
  assert.deepEqual(corta.filas.map(({ valor }) => valor), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  assert.deepEqual(corta.filas[2], { valor: "2026-10-07", etiqueta: "07/10/2026", n: 2, ASISTIO: 0, NO_ASISTIO: 1, POR_REALIZAR: 1 });

  const larga = tendencia(datos, limites(datos, "2026-09-01", "2026-12-31"));
  assert.equal(larga.dim, "semana");
  assert.equal(larga.filas.find(({ valor }) => valor === "2026-10-05").n, 3);
  assert.deepEqual(tendencia(datos, limites(datos, "", "")).filas.map(({ n }) => n), [1, 0, 2]);
  assert.equal(limites([], "", ""), null);
});

test("la ocupación divide las citas entre los horarios disponibles del periodo, sin días desactivados", () => {
  // 2026-10-05 y 2026-10-12 son lunes; el martes 06 está desactivado.
  const datos = [conFecha("2026-10-05", "08:00", "ASISTIO"), conFecha("2026-10-12", "08:00", "ASISTIO"), conFecha("2026-10-13", "09:00", "ASISTIO")];
  const rango = limites(datos, "2026-10-05", "2026-10-18");
  const porDia = ocupacion(datos, rango, ["2026-10-06"], "diaSemana");
  assert.deepEqual(porDia.map(({ etiqueta }) => etiqueta), ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);
  assert.deepEqual(porDia[0], { valor: "0", etiqueta: "Lunes", n: 2, capacidad: 16, pct: 13 });
  assert.equal(porDia[1].capacidad, 8);

  const porHora = ocupacion(datos, rango, ["2026-10-06"], "hora");
  assert.equal(porHora.length, 8);
  assert.deepEqual(porHora[0], { valor: "08:00", etiqueta: "08:00", n: 2, capacidad: 9, pct: 22 });
});

test("el egreso se ordena por ciclo y el ciclo actual depende del semestre", () => {
  const datos = [conFecha("2026-10-05", "08:00", "ASISTIO", "02/2027"), conFecha("2026-10-05", "09:00", "ASISTIO", "01/2027"), conFecha("2026-10-05", "10:00", "ASISTIO", "02/2026")];
  assert.deepEqual(desglosar(datos, "egreso").sort(porCiclo).map(({ valor }) => valor), ["02/2026", "01/2027", "02/2027"]);
  assert.equal(cicloActual("2026-10-27"), "02/2026");
  assert.equal(cicloActual("2027-03-01"), "01/2027");
});
