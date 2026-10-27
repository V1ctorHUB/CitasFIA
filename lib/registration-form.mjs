// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export const facultyName = "Facultad de Ingeniería y Arquitectura (FIA)";

export const careers = [
  "Arquitectura",
  "Ingeniería Civil",
  "Ingeniería Industrial",
  "Ingeniería Informática",
  "Ingeniería Mecánica",
  "Ingeniería Eléctrica",
  "Ingeniería Química",
  "Ingeniería de Alimentos",
  "Ingeniería Energética",
  "Técnico en Desarrollo de Software",
];

export const GENDER_OPTIONS = [
  { value: "femenino", label: "Femenino" },
  { value: "masculino", label: "Masculino" },
  { value: "otro", label: "Otro" },
  { value: "prefiero-no-indicarlo", label: "Prefiero no indicarlo" },
];

export const GRADUATION_CYCLES = [
  { value: "01", label: "Ciclo 01" },
  { value: "02", label: "Ciclo 02" },
  { value: "03", label: "Ciclo 03 (Interciclo)" },
];

const FIRST_GRADUATION_YEAR = 2026;
const GRADUATION_YEAR_SPAN = 10;

export const graduationYears = Array.from(
  { length: GRADUATION_YEAR_SPAN },
  (_, index) => String(FIRST_GRADUATION_YEAR + index),
);

export const DEFAULT_PROJECT = Object.freeze({
  id: 0,
  nombre: "Asesoría General UCA",
  institucion: "UCA El Salvador",
});

export const proyectosData = [
  DEFAULT_PROJECT,
  { id: 1, nombre: "Alfabetización Digital Comunitaria", institucion: "Alcaldía Municipal de San Salvador" },
  { id: 2, nombre: "Modernización del Portal Web Institucional", institucion: "Cruz Roja Salvadoreña" },
  { id: 3, nombre: "Soporte y Mantenimiento de Redes FIA", institucion: "UCA El Salvador" },
];

// ---------------------------------------------------------------------------
// Estructura del formulario
// ---------------------------------------------------------------------------

export const registrationFields = [
  { name: "nombreCompleto", label: "Nombre completo" },
  { name: "carnet", label: "Carnet" },
  { name: "dui", label: "DUI" },
  { name: "genero", label: "Género" },
  { name: "carrera", label: "Carrera" },
  { name: "ciclo", label: "Ciclo de egreso" },
  { name: "anio", label: "Año de egreso" },
];

export const FORM_DATA_ELEMENTS = [
  { name: "nombreCompleto", type: "string", nature: "visible" },
  { name: "carnet", type: "string", nature: "visible" },
  { name: "correo_institucional", type: "string", nature: "derived" },
  { name: "dui", type: "string", nature: "visible" },
  { name: "genero", type: "string", nature: "visible" },
  { name: "proyecto", type: "string", nature: "visible" },
  { name: "proyecto_id", type: "number", nature: "hidden" },
  { name: "institucion", type: "string", nature: "readOnly" },
  { name: "carrera", type: "string", nature: "visible" },
  { name: "facultad", type: "string", nature: "readOnly" },
  { name: "ciclo", type: "string", nature: "visible" },
  { name: "anio", type: "string", nature: "visible" },
  { name: "ciclo_egreso", type: "string", nature: "hidden" },
];

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 100;
export const CARNET_LENGTH = 8;
export const DUI_DIGITS = 9;
export const INSTITUTIONAL_EMAIL_DOMAIN = "uca.edu.sv";

export const submissionConfirmationDurationMs = 4000;

export const confirmationSuccessMessage =
  "Solicitud registrada con éxito. Recibirás un correo electrónico cuando la coordinación te asigne tu horario.";

export function createEmptyRegistration() {
  return Object.fromEntries(registrationFields.map(({ name }) => [name, ""]));
}

export function isRegistrationComplete(registration) {
  return registrationFields.every(({ name }) => toTrimmedString(registration?.[name]));
}

// ---------------------------------------------------------------------------
// Formateo y normalización
// ---------------------------------------------------------------------------

function toTrimmedString(value) {
  return String(value ?? "").trim();
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isSameText(a, b) {
  return normalizeSearchText(a).trim() === normalizeSearchText(b).trim();
}

export function formatDui(value) {
  const digits = onlyDigits(value).slice(0, DUI_DIGITS);
  return digits.length === DUI_DIGITS ? `${digits.slice(0, 8)}-${digits.slice(8)}` : digits;
}

export function formatCarnet(value) {
  return onlyDigits(value).slice(0, CARNET_LENGTH);
}

export function formatGraduationCycle(cycle, year) {
  return cycle && year ? `${cycle}/${year}` : "";
}

export function deriveInstitutionalEmail(carnet) {
  const cleanCarnet = toTrimmedString(carnet);
  return cleanCarnet ? `${cleanCarnet}@${INSTITUTIONAL_EMAIL_DOMAIN}` : "";
}

export function getFacultyForCareer(career) {
  return careers.includes(career) ? facultyName : "";
}

// ---------------------------------------------------------------------------
// Validaciones de formato
// ---------------------------------------------------------------------------

// Letras (incluye tildes y ñ), espacios simples, apóstrofo, punto y guion.
const FULL_NAME_PATTERN = /^[\p{L}][\p{L}'.\- ]*[\p{L}.]$/u;

export function isValidFullName(name) {
  const trimmed = toTrimmedString(name);
  return trimmed.length >= NAME_MIN_LENGTH
    && trimmed.length <= NAME_MAX_LENGTH
    && FULL_NAME_PATTERN.test(trimmed)
    && !/\s{2,}/.test(trimmed);
}

export function isValidCarnet(carnet) {
  return new RegExp(`^\\d{${CARNET_LENGTH}}$`).test(toTrimmedString(carnet));
}

export function isValidDui(dui) {
  if (!/^\d{8}-\d$/.test(dui)) return false;

  const digits = dui.replace("-", "");
  const weightedSum = Array.from(digits.slice(0, 8)).reduce(
    (total, digit, index) => total + Number(digit) * (9 - index),
    0,
  );
  const expectedVerifier = (10 - (weightedSum % 10)) % 10;

  return Number(digits[8]) === expectedVerifier;
}

function isOneOf(options, value) {
  return options.some((option) => option.value === value);
}

// ---------------------------------------------------------------------------
// Búsqueda en catálogos
// ---------------------------------------------------------------------------

export function filterCareers(careerList = careers, query = "") {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return careerList.slice();

  return careerList.filter((career) => normalizeSearchText(career).includes(normalizedQuery));
}

export function filterProjects(projects, query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return [];

  return projects.filter(({ nombre, institucion }) => (
    normalizeSearchText(nombre).includes(normalizedQuery)
    || normalizeSearchText(institucion).includes(normalizedQuery)
  ));
}

export function findCareerByName(query) {
  return careers.find((career) => isSameText(career, query)) ?? null;
}

export function resolveProjectOnBlur(currentQuery, selectedProject, availableProjects = proyectosData) {
  const trimmed = toTrimmedString(currentQuery);
  if (!trimmed) return DEFAULT_PROJECT;

  if (selectedProject && isSameText(selectedProject.nombre, trimmed)) return selectedProject;

  return availableProjects.find((project) => isSameText(project.nombre, trimmed)) ?? DEFAULT_PROJECT;
}

// ---------------------------------------------------------------------------
// Carga del catálogo de proyectos
// ---------------------------------------------------------------------------

function isValidProject(project) {
  return Number.isInteger(project?.id)
    && typeof project.nombre === "string"
    && typeof project.institucion === "string";
}

// Nunca confiar en la forma de una respuesta externa: se descartan registros malformados
// y se copian solo las propiedades conocidas.
export function sanitizeProjects(data) {
  if (!Array.isArray(data)) return null;

  const projects = data
    .filter(isValidProject)
    .map(({ id, nombre, institucion }) => ({ id, nombre, institucion }));

  return projects.length > 0 ? projects : null;
}

function cloneFallbackProjects() {
  return proyectosData.map((project) => ({ ...project }));
}

export async function inicializarProyectos() {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return cloneFallbackProjects();
  }

  try {
    const response = await fetch("/api/proyectos", { headers: { Accept: "application/json" } });
    if (response.ok) {
      return sanitizeProjects(await response.json()) ?? cloneFallbackProjects();
    }
  } catch {
    // La API no está disponible: se usa el catálogo local.
  }
  return cloneFallbackProjects();
}

// ---------------------------------------------------------------------------
// Validación y payload
// ---------------------------------------------------------------------------

export function validateRegistration(registration, selectedProject = DEFAULT_PROJECT, availableProjects = proyectosData) {
  const errors = {};
  const nombreCompleto = toTrimmedString(registration?.nombreCompleto);
  const carnet = toTrimmedString(registration?.carnet);
  const dui = toTrimmedString(registration?.dui);
  const genero = toTrimmedString(registration?.genero);
  const ciclo = toTrimmedString(registration?.ciclo);
  const anio = toTrimmedString(registration?.anio);
  const project = selectedProject || DEFAULT_PROJECT;

  if (!nombreCompleto) {
    errors.nombreCompleto = "El nombre completo es requerido.";
  } else if (!isValidFullName(nombreCompleto)) {
    errors.nombreCompleto = `Ingresa un nombre válido (solo letras, entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres).`;
  }

  if (!carnet) {
    errors.carnet = "El carnet institucional es requerido.";
  } else if (!isValidCarnet(carnet)) {
    errors.carnet = `El carnet institucional debe tener exactamente ${CARNET_LENGTH} dígitos.`;
  }

  if (!dui) {
    errors.dui = "El número de DUI es requerido.";
  } else if (!isValidDui(dui)) {
    errors.dui = "Ingresa un número de DUI válido en el formato 00000000-0.";
  }

  if (!isOneOf(GENDER_OPTIONS, genero)) {
    errors.genero = "Selecciona una opción de género.";
  }

  if (!availableProjects.some(({ id }) => id === project.id)) {
    errors.proyecto = "Debes seleccionar un proyecto válido de la lista.";
  }

  if (!getFacultyForCareer(registration?.carrera)) {
    errors.carrera = "Selecciona una carrera de la lista para asignar la facultad.";
  }

  if (!isOneOf(GRADUATION_CYCLES, ciclo) || !graduationYears.includes(anio)) {
    errors.cicloEgreso = "Selecciona el ciclo y el año de egreso.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Los campos derivados (correo, facultad, institución, ciclo_egreso) se calculan aquí
// a partir de datos validados; nunca se toman de inputs ocultos manipulables.
export function buildAppointmentPayload(registration, project = DEFAULT_PROJECT) {
  const currentProject = project || DEFAULT_PROJECT;
  const carnet = toTrimmedString(registration?.carnet);
  const ciclo = toTrimmedString(registration?.ciclo);
  const anio = toTrimmedString(registration?.anio);

  return {
    nombreCompleto: toTrimmedString(registration?.nombreCompleto),
    carnet,
    correo_institucional: deriveInstitutionalEmail(carnet),
    dui: toTrimmedString(registration?.dui),
    genero: toTrimmedString(registration?.genero),
    proyecto: currentProject.nombre,
    proyecto_id: currentProject.id,
    institucion: currentProject.institucion,
    carrera: toTrimmedString(registration?.carrera),
    facultad: getFacultyForCareer(registration?.carrera),
    ciclo,
    anio,
    ciclo_egreso: formatGraduationCycle(ciclo, anio),
  };
}

// ---------------------------------------------------------------------------
// Envío al servidor
// ---------------------------------------------------------------------------

export const submissionErrorMessage = "No pudimos registrar tu solicitud. Revisa tu conexión e intenta de nuevo.";

/**
 * Envía la solicitud a POST /api/citas. La clave de idempotencia debe conservarse entre reintentos
 * del mismo formulario para que el servidor no cree registros duplicados.
 * @returns {Promise<
 *   | { status: "ok" }
 *   | { status: "invalid", errors: Record<string, string> }
 *   | { status: "rejected", message: string }
 * >}
 */
export async function enviarSolicitud(registration, project, idempotencyKey, fetchImpl = globalThis.fetch) {
  const payload = buildAppointmentPayload(registration, project);
  const body = {
    registro: Object.fromEntries(registrationFields.map(({ name }) => [name, payload[name]])),
    proyecto_id: payload.proyecto_id,
    clave_idempotencia: idempotencyKey,
  };

  let response;
  try {
    response = await fetchImpl("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: "rejected", message: submissionErrorMessage };
  }

  if (response.ok) return { status: "ok" };

  const data = await response.json().catch(() => null);
  if (response.status === 400 && data && typeof data.errors === "object" && data.errors !== null) {
    return { status: "invalid", errors: data.errors };
  }
  return {
    status: "rejected",
    message: typeof data?.error === "string" ? data.error : submissionErrorMessage,
  };
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS/localhost); getRandomValues sí está siempre.
export function createIdempotencyKey(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === "function") return cryptoImpl.randomUUID();

  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
