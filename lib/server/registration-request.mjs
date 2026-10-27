import { buildAppointmentPayload, validateRegistration } from "../registration-form.mjs";

export const MAX_REGISTRATION_BODY_BYTES = 4096;

const REGISTRATION_KEYS = ["nombreCompleto", "carnet", "dui", "genero", "carrera", "ciclo", "anio"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @typedef {import("../db/projects-repository.mjs").PublicProject} PublicProject
 * @typedef {(
 *   | { ok: true, payload: ReturnType<typeof buildAppointmentPayload>, idempotencyKey: string }
 *   | { ok: false, errors: Record<string, string> }
 * )} ParsedRegistration
 */

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Valida en el servidor el cuerpo de POST /api/citas con las mismas reglas del cliente.
 * Solo se leen claves conocidas; los campos derivados se recalculan aquí.
 * @param {unknown} body
 * @param {PublicProject[]} projects catálogo vigente leído de la base
 * @returns {ParsedRegistration}
 */
export function parseRegistrationRequest(body, projects) {
  if (!isPlainObject(body) || !isPlainObject(body.registro)) {
    return { ok: false, errors: { solicitud: "Solicitud inválida." } };
  }

  const idempotencyKey = body.clave_idempotencia;
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, errors: { solicitud: "Solicitud inválida." } };
  }

  const registration = Object.fromEntries(REGISTRATION_KEYS.map((key) => {
    const value = body.registro[key];
    return [key, typeof value === "string" ? value : ""];
  }));

  const project = projects.find(({ id }) => id === body.proyecto_id) ?? { id: -1, nombre: "", institucion: "" };
  const { isValid, errors } = validateRegistration(registration, project, projects);
  if (!isValid) return { ok: false, errors };

  return { ok: true, payload: buildAppointmentPayload(registration, project), idempotencyKey: idempotencyKey.toLowerCase() };
}

/**
 * Lee el cuerpo como JSON sin superar `maxBytes`, aunque falte o mienta Content-Length.
 * @param {Request} request
 * @returns {Promise<{ ok: true, body: unknown } | { ok: false, status: 400 | 413 | 415 }>}
 */
export async function readJsonBody(request, maxBytes = MAX_REGISTRATION_BODY_BYTES) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(contentType)) return { ok: false, status: 415 };

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  try {
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400 };
  }
}

/**
 * Protección CSRF: un navegador siempre envía Origin en POST; debe coincidir con el host servido
 * o con APP_ORIGIN cuando la app está detrás de un proxy inverso.
 * @param {Request} request
 * @param {string | undefined} allowedOrigin
 */
export function isSameOrigin(request, allowedOrigin) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const { host, origin: normalized } = new URL(origin);
    if (allowedOrigin) return normalized === new URL(allowedOrigin).origin;
    return host === request.headers.get("host");
  } catch {
    return false;
  }
}
