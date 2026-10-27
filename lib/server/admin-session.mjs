import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "citas_admin";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const KEY_LENGTH = 64;

/**
 * Hash de contraseña para ADMIN_CLAVE_HASH: "scrypt:<sal base64>:<hash base64>".
 * Sin "$": .env y docker compose lo interpretarían como variable. Genéralo con: npm run admin:clave
 */
export async function hashPassword(password, salt = randomBytes(16)) {
  const hash = await scryptAsync(String(password), salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored ?? "").split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;

  const expectedBuffer = Buffer.from(expected, "base64");
  const actual = await scryptAsync(String(password), Buffer.from(salt, "base64"), expectedBuffer.length || KEY_LENGTH);
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
}

function sign(data, secret) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Token "<payload base64url>.<firma>"; no guarda nada en el servidor. */
export function createSessionToken(usuario, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: usuario, exp: now + SESSION_MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** @returns {{ usuario: string } | null} */
export function readSessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof u === "string" && Number.isFinite(exp) && exp > now ? { usuario: u } : null;
  } catch {
    return null;
  }
}

// shortcut: una sola cuenta de coordinación definida por variables de entorno;
// pasar a una tabla de usuarios cuando más de una persona administre la agenda.
export function loadAdminConfig(env = process.env) {
  const secret = env.SESSION_SECRET;
  if (!env.ADMIN_USUARIO || !env.ADMIN_CLAVE_HASH || !secret || Buffer.from(secret, "base64").length < 32) {
    return null;
  }
  return {
    usuario: env.ADMIN_USUARIO,
    claveHash: env.ADMIN_CLAVE_HASH,
    nombre: env.ADMIN_NOMBRE || env.ADMIN_USUARIO,
    secret,
  };
}
