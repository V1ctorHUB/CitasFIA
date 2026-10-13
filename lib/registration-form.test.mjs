import test from "node:test";
import assert from "node:assert/strict";
import {
  careers,
  createEmptyRegistration,
  DEFAULT_PROJECT,
  filterCareers,
  filterProjects,
  formatDui,
  formatGraduationCycle,
  getFacultyForCareer,
  isRegistrationComplete,
  isValidDui,
  inicializarProyectos,
  proyectosData,
  registrationFields,
  resolveProjectOnBlur,
  submissionConfirmationDurationMs,
  isValidCarnet,
  formatCarnet,
  deriveInstitutionalEmail,
  confirmationSuccessMessage,
  FORM_DATA_ELEMENTS,
  buildAppointmentPayload,
  validateRegistration,
  isValidFullName,
  sanitizeProjects,
  findCareerByName,
  NAME_MAX_LENGTH,
} from "./registration-form.mjs";

test("el registro vacío contiene todos los campos requeridos con valores iniciales seguros", () => {
  const registration = createEmptyRegistration();

  assert.deepEqual(Object.keys(registration), registrationFields.map(({ name }) => name));
  assert.ok(Object.values(registration).every((value) => value === ""));
});

test("el formulario público no solicita fecha ni hora: la agenda es administrada por Oscar", () => {
  assert.equal(
    registrationFields.some(({ name }) => name === "fechaHoraAcordada"),
    false,
  );
});

test("la confirmación de envío es temporal para no mostrarse al siguiente visitante", () => {
  assert.equal(submissionConfirmationDurationMs, 4000);
});

test("el DUI conserva solo nueve dígitos e inserta el guion después del octavo", () => {
  assert.equal(formatDui("0123 4567-8abc9"), "01234567-8");
  assert.equal(formatDui("01234567"), "01234567");
});

test("valida un DUI usando el algoritmo oficial de módulo 10", () => {
  assert.equal(isValidDui("01234567-8"), true);
  assert.equal(isValidDui("01234567-9"), false);
  assert.equal(isValidDui("012345678"), false);
});

test("cada carrera disponible se asocia con la Facultad de Ingeniería y Arquitectura", () => {
  assert.equal(careers.length, 10);
  assert.equal(getFacultyForCareer("Ingeniería Informática"), "Facultad de Ingeniería y Arquitectura (FIA)");
  assert.equal(getFacultyForCareer("Carrera inexistente"), "");
});

test("normaliza el ciclo y año de egreso en el formato CC/AAAA", () => {
  assert.equal(formatGraduationCycle("01", "2026"), "01/2026");
  assert.equal(formatGraduationCycle("03", "2035"), "03/2035");
  assert.equal(formatGraduationCycle("", "2026"), "");
});

test("filtra proyectos ignorando tildes y mayúsculas", () => {
  assert.deepEqual(
    filterProjects(proyectosData, "alfabetizacion").map(({ id }) => id),
    [1],
  );
  assert.deepEqual(
    filterProjects(proyectosData, "CRUZ ROJA").map(({ id }) => id),
    [2],
  );
});

test("la inicialización devuelve el mock aislado mientras no existe el endpoint", async () => {
  const projects = await inicializarProyectos();

  assert.deepEqual(projects, proyectosData);
  assert.notEqual(projects, proyectosData);
});

test("un registro completo se reconoce como listo para simular el envío", () => {
  const registration = Object.fromEntries(
    registrationFields.map(({ name }) => [name, "Dato de prueba"]),
  );

  assert.equal(isRegistrationComplete(registration), true);
});

test("un campo vacío impide simular el envío", () => {
  const registration = Object.fromEntries(
    registrationFields.map(({ name }) => [name, "Dato de prueba"]),
  );
  registration.carnet = "";

  assert.equal(isRegistrationComplete(registration), false);
});

test("el proyecto por defecto es Asesoría General UCA con id 0 e institución UCA El Salvador", () => {
  assert.equal(DEFAULT_PROJECT.id, 0);
  assert.equal(DEFAULT_PROJECT.nombre, "Asesoría General UCA");
  assert.equal(DEFAULT_PROJECT.institucion, "UCA El Salvador");
  assert.ok(proyectosData.some((p) => p.id === 0 && p.nombre === "Asesoría General UCA"));
});

test("resolveProjectOnBlur restaura de forma segura a Asesoría General UCA ante texto vacío o inválido", () => {
  // Caso 1: Texto vacío -> restaura DEFAULT_PROJECT
  assert.deepEqual(resolveProjectOnBlur("", null), DEFAULT_PROJECT);

  // Caso 2: Texto arbitrario o incompleto sin match -> restaura DEFAULT_PROJECT
  assert.deepEqual(resolveProjectOnBlur("Texto aleatorio sin coincidencia", null), DEFAULT_PROJECT);

  // Caso 3: Proyecto previamente seleccionado y query coincide -> mantiene proyecto seleccionado
  const proyectoExistente = proyectosData[1];
  assert.deepEqual(resolveProjectOnBlur(proyectoExistente.nombre, proyectoExistente), proyectoExistente);

  // Caso 4: Usuario escribió el nombre exacto de un proyecto de la lista -> lo reconoce
  assert.equal(resolveProjectOnBlur("Modernización del Portal Web Institucional", null).id, 2);
});

test("filtra carreras FIA ignorando tildes y mayúsculas, devolviendo todas si el query está vacío", () => {
  assert.equal(filterCareers(careers, "").length, 10);
  assert.deepEqual(filterCareers(careers, "informatica"), ["Ingeniería Informática"]);
  assert.deepEqual(filterCareers(careers, "CIVIL"), ["Ingeniería Civil"]);
  assert.deepEqual(filterCareers(careers, "quimica"), ["Ingeniería Química"]);
  assert.equal(filterCareers(careers, "inexistente").length, 0);
});

test("valida que el carnet institucional tenga exactamente 8 dígitos numéricos", () => {
  assert.equal(isValidCarnet("00123456"), true);
  assert.equal(isValidCarnet("12345678"), true);
  assert.equal(isValidCarnet("1234567"), false);
  assert.equal(isValidCarnet("123456789"), false);
  assert.equal(isValidCarnet("abcdefgh"), false);
  assert.equal(isValidCarnet("1234abcd"), false);
  assert.equal(isValidCarnet(""), false);
  assert.equal(isValidCarnet(null), false);
});

test("formatCarnet filtra caracteres no numéricos y limita a un máximo de 8 dígitos", () => {
  assert.equal(formatCarnet("00123456abc"), "00123456");
  assert.equal(formatCarnet("00-12-34-56"), "00123456");
  assert.equal(formatCarnet("1234567890"), "12345678");
  assert.equal(formatCarnet(""), "");
});

test("deriva automáticamente el correo institucional a partir del carnet con formato [carnet]@uca.edu.sv", () => {
  assert.equal(deriveInstitutionalEmail("00123456"), "00123456@uca.edu.sv");
  assert.equal(deriveInstitutionalEmail(" 20261234 "), "20261234@uca.edu.sv");
  assert.equal(deriveInstitutionalEmail(""), "");
  assert.equal(deriveInstitutionalEmail(null), "");
});

test("el formulario define exactamente los 13 elementos de datos (visibles, ocultos y derivados) según la especificación funcional", () => {
  assert.equal(FORM_DATA_ELEMENTS.length, 13);
  const elementNames = FORM_DATA_ELEMENTS.map(({ name }) => name);
  const expectedNames = [
    "nombreCompleto",
    "carnet",
    "correo_institucional",
    "dui",
    "genero",
    "proyecto",
    "proyecto_id",
    "institucion",
    "carrera",
    "facultad",
    "ciclo",
    "anio",
    "ciclo_egreso",
  ];
  assert.deepEqual(elementNames, expectedNames);
});

test("buildAppointmentPayload construye el payload limpio con los 13 elementos requeridos para POST /api/citas", () => {
  const reg = {
    nombreCompleto: "Ana María López Martínez",
    carnet: "00123456",
    dui: "01234567-8",
    genero: "femenino",
    carrera: "Ingeniería Informática",
    ciclo: "01",
    anio: "2026",
  };
  const payload = buildAppointmentPayload(reg, DEFAULT_PROJECT);

  assert.equal(payload.nombreCompleto, "Ana María López Martínez");
  assert.equal(payload.carnet, "00123456");
  assert.equal(payload.correo_institucional, "00123456@uca.edu.sv");
  assert.equal(payload.dui, "01234567-8");
  assert.equal(payload.genero, "femenino");
  assert.equal(payload.proyecto, "Asesoría General UCA");
  assert.equal(payload.proyecto_id, 0);
  assert.equal(payload.institucion, "UCA El Salvador");
  assert.equal(payload.carrera, "Ingeniería Informática");
  assert.equal(payload.facultad, "Facultad de Ingeniería y Arquitectura (FIA)");
  assert.equal(payload.ciclo, "01");
  assert.equal(payload.anio, "2026");
  assert.equal(payload.ciclo_egreso, "01/2026");

  // Validar que contiene exactamente los 13 elementos
  assert.equal(Object.keys(payload).length, 13);
});

test("validateRegistration valida campos requeridos y formatos conforme a la especificación funcional", () => {
  const validReg = {
    nombreCompleto: "Ana María López Martínez",
    carnet: "00123456",
    dui: "01234567-8",
    genero: "femenino",
    carrera: "Ingeniería Informática",
    ciclo: "01",
    anio: "2026",
  };

  const validResult = validateRegistration(validReg, DEFAULT_PROJECT);
  assert.equal(validResult.isValid, true);
  assert.deepEqual(validResult.errors, {});

  // Carnet inválido (menos de 8 dígitos)
  const invalidCarnetResult = validateRegistration({ ...validReg, carnet: "123" }, DEFAULT_PROJECT);
  assert.equal(invalidCarnetResult.isValid, false);
  assert.ok(invalidCarnetResult.errors.carnet);

  // DUI inválido
  const invalidDuiResult = validateRegistration({ ...validReg, dui: "01234567-9" }, DEFAULT_PROJECT);
  assert.equal(invalidDuiResult.isValid, false);
  assert.ok(invalidDuiResult.errors.dui);

  // Nombre vacío
  const emptyNameResult = validateRegistration({ ...validReg, nombreCompleto: "" }, DEFAULT_PROJECT);
  assert.equal(emptyNameResult.isValid, false);
  assert.ok(emptyNameResult.errors.nombreCompleto);

  // Carrera inválida
  const invalidCareerResult = validateRegistration({ ...validReg, carrera: "Medicina" }, DEFAULT_PROJECT);
  assert.equal(invalidCareerResult.isValid, false);
  assert.ok(invalidCareerResult.errors.carrera);

  // Ciclo / año vacío
  const emptyCycleResult = validateRegistration({ ...validReg, ciclo: "" }, DEFAULT_PROJECT);
  assert.equal(emptyCycleResult.isValid, false);
  assert.ok(emptyCycleResult.errors.cicloEgreso);
});

test("el mensaje de confirmación describe el registro exitoso y aviso de asignación futura por coordinación", () => {
  assert.ok(confirmationSuccessMessage.includes("éxito"));
  assert.ok(confirmationSuccessMessage.includes("correo electrónico"));
  assert.ok(confirmationSuccessMessage.includes("coordinación"));
});


const validRegistration = {
  nombreCompleto: "Ana María López Martínez",
  carnet: "00123456",
  dui: "01234567-8",
  genero: "femenino",
  carrera: "Ingeniería Informática",
  ciclo: "01",
  anio: "2026",
};

test("el nombre completo acepta letras con tildes, ñ, apóstrofos y guiones", () => {
  assert.equal(isValidFullName("Ana María López Martínez"), true);
  assert.equal(isValidFullName("José Peña-O'Neil"), true);
  assert.equal(isValidFullName("Ab"), false);
  assert.equal(isValidFullName("A".repeat(NAME_MAX_LENGTH + 1)), false);
});

test("el nombre completo rechaza marcado HTML, scripts y caracteres de inyección", () => {
  assert.equal(isValidFullName("<script>alert(1)</script>"), false);
  assert.equal(isValidFullName("Ana\"><img src=x onerror=alert(1)>"), false);
  assert.equal(isValidFullName("Robert'); DROP TABLE citas;--"), false);
  assert.equal(isValidFullName("Ana 123"), false);
  assert.equal(isValidFullName("=HYPERLINK(\"http://x\")"), false);
});

test("validateRegistration rechaza valores fuera de catálogo aunque se manipule el DOM", () => {
  assert.ok(validateRegistration({ ...validRegistration, genero: "admin" }).errors.genero);
  assert.ok(validateRegistration({ ...validRegistration, ciclo: "99" }).errors.cicloEgreso);
  assert.ok(validateRegistration({ ...validRegistration, anio: "1990" }).errors.cicloEgreso);
  assert.ok(validateRegistration({ ...validRegistration, nombreCompleto: "<b>x</b>" }).errors.nombreCompleto);
  assert.ok(
    validateRegistration(validRegistration, { id: 999, nombre: "Falso", institucion: "X" }).errors.proyecto,
  );
});

test("validateRegistration tolera entradas no string sin lanzar excepciones", () => {
  const result = validateRegistration({ nombreCompleto: 123, carnet: null, dui: {}, genero: [] });
  assert.equal(result.isValid, false);
});

test("buildAppointmentPayload recalcula campos derivados en lugar de confiar en inputs ocultos", () => {
  const payload = buildAppointmentPayload({ ...validRegistration, correo_institucional: "x@evil.com", facultad: "Otra" });
  assert.equal(payload.correo_institucional, "00123456@uca.edu.sv");
  assert.equal(payload.facultad, "Facultad de Ingeniería y Arquitectura (FIA)");
  assert.equal(Object.keys(payload).length, 13);
});

test("sanitizeProjects descarta respuestas malformadas y propiedades desconocidas", () => {
  assert.equal(sanitizeProjects(null), null);
  assert.equal(sanitizeProjects({ id: 1 }), null);
  assert.equal(sanitizeProjects([{ id: "1", nombre: "x", institucion: "y" }]), null);
  assert.deepEqual(
    sanitizeProjects([{ id: 5, nombre: "P", institucion: "I", __proto__: { admin: true }, extra: "<script>" }]),
    [{ id: 5, nombre: "P", institucion: "I" }],
  );
});

test("findCareerByName encuentra la carrera ignorando tildes y mayúsculas", () => {
  assert.equal(findCareerByName("  ingenieria informatica "), "Ingeniería Informática");
  assert.equal(findCareerByName("Medicina"), null);
});
