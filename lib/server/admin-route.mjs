import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createDuiCipher } from "../db/dui-crypto.mjs";
import { getPool } from "../db/pool.mjs";
import { loadAdminConfig, readSessionToken, SESSION_COOKIE } from "./admin-session.mjs";
import { deliverPendingEmails } from "./email.mjs";
import { isSameOrigin, readJsonBody } from "./registration-request.mjs";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Sesión de coordinación vigente (para route handlers y server components), o null. */
export async function getAdminSession() {
  const config = loadAdminConfig();
  if (!config) return null;

  const session = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value, config.secret);
  return session?.usuario === config.usuario ? { usuario: config.usuario, nombre: config.nombre } : null;
}

let duiCipher;
export function getCipher() {
  duiCipher ??= createDuiCipher();
  return duiCipher;
}

export { getPool };

/** Lee el cuerpo JSON acotado; devuelve null si es inválido. */
export async function readBody(request) {
  const body = await readJsonBody(request);
  return body.ok && typeof body.body === "object" && body.body !== null ? body.body : null;
}

/**
 * Envoltura de toda ruta /api/admin: exige sesión, verifica Origin en escrituras (CSRF)
 * y nunca filtra detalles internos ni datos personales en los errores.
 */
export function adminRoute(handler) {
  return async (request, context) => {
    if (request.method !== "GET" && !isSameOrigin(request, process.env.APP_ORIGIN)) {
      return json({ error: "Origen no permitido." }, 403);
    }
    const session = await getAdminSession();
    if (!session) return json({ error: "Tu sesión expiró. Vuelve a ingresar." }, 401);

    try {
      return await handler(request, { ...context, session });
    } catch (error) {
      console.error(`[api/admin] ${request.method} ${new URL(request.url).pathname}:`, error?.code ?? "", error?.message);
      return json({ error: "El servicio no está disponible. Intenta de nuevo en unos minutos." }, 503);
    }
  };
}

/** Intenta entregar los correos en segundo plano tras una acción; si falla, quedan en la bandeja de salida. */
export function deliverEmailsInBackground() {
  deliverPendingEmails(getPool()).catch((error) => {
    console.error("[correos] error al entregar:", error?.message);
  });
}

/** Traduce el resultado de una acción del repositorio a una respuesta HTTP. */
export function actionResponse(result) {
  switch (result.status) {
    case "ok":
      return json({ ok: true, message: result.message });
    case "invalid":
      return json({ errors: result.errors }, 400);
    case "conflict":
      return json({ error: result.message }, 409);
    case "not-found":
      return json({ error: "La cita no existe." }, 404);
    default:
      throw new Error(`Resultado no manejado: ${result.status}`);
  }
}
