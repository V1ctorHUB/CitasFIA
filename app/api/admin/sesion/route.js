import { clientKey, json } from "../../../../lib/server/http.mjs";
import { createRateLimiter } from "../../../../lib/server/rate-limit.mjs";
import { createSessionToken, loadAdminConfig, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifyPassword } from "../../../../lib/server/admin-session.mjs";
import { isSameOrigin, readJsonBody } from "../../../../lib/server/registration-request.mjs";

export const dynamic = "force-dynamic";

// Frena la adivinación de contraseñas sin bloquear a la coordinación por un par de errores.
const rateLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge,
});

export async function POST(request) {
  if (!isSameOrigin(request, process.env.APP_ORIGIN)) return json({ error: "Origen no permitido." }, 403);

  const config = loadAdminConfig();
  if (!config) {
    return json({ error: "El acceso de coordinación no está configurado en el servidor (ADMIN_USUARIO, ADMIN_CLAVE_HASH, SESSION_SECRET)." }, 503);
  }

  const { allowed, retryAfterSeconds } = rateLimiter.consume(clientKey(request));
  if (!allowed) {
    return json({ error: "Demasiados intentos. Espera unos minutos." }, 429, { "Retry-After": String(retryAfterSeconds) });
  }

  const body = await readJsonBody(request, 1024);
  const usuario = body.ok && typeof body.body?.usuario === "string" ? body.body.usuario.trim() : "";
  const clave = body.ok && typeof body.body?.clave === "string" ? body.body.clave : "";
  if (!usuario || !clave) return json({ error: "Ingresa tu usuario y contraseña." }, 400);

  // Se verifica la contraseña aunque el usuario no coincida: mismo tiempo de respuesta en ambos casos.
  const passwordOk = await verifyPassword(clave, config.claveHash);
  if (!passwordOk || usuario !== config.usuario) return json({ error: "Usuario o contraseña incorrectos." }, 401);

  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(config.usuario, config.secret), cookieOptions(SESSION_MAX_AGE_SECONDS));
  return response;
}

export async function DELETE(request) {
  if (!isSameOrigin(request, process.env.APP_ORIGIN)) return json({ error: "Origen no permitido." }, 403);

  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return response;
}
