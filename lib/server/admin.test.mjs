import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, hashPassword, loadAdminConfig, readSessionToken, SESSION_MAX_AGE_SECONDS, verifyPassword } from "./admin-session.mjs";
import { getEmailTransport, renderEmail } from "./email.mjs";

const SECRET = Buffer.alloc(32, 5).toString("base64");

test("la contraseña de coordinación se guarda con scrypt y se verifica sin revelar el hash", async () => {
  const stored = await hashPassword("clave segura");
  assert.match(stored, /^scrypt\$/);
  assert.equal(stored.includes("clave segura"), false);
  assert.equal(await verifyPassword("clave segura", stored), true);
  assert.equal(await verifyPassword("otra", stored), false);
  assert.equal(await verifyPassword("clave segura", "texto-plano"), false);
  assert.equal(await verifyPassword("clave segura", undefined), false);
});

test("la sesión firmada expira y no se puede alterar", () => {
  const now = Date.UTC(2026, 9, 26, 12);
  const token = createSessionToken("oarias", SECRET, now);

  assert.deepEqual(readSessionToken(token, SECRET, now + 1000), { usuario: "oarias" });
  assert.equal(readSessionToken(token, SECRET, now + SESSION_MAX_AGE_SECONDS * 1000 + 1), null);
  assert.equal(readSessionToken(token, Buffer.alloc(32, 6).toString("base64"), now), null);

  const [, signature] = token.split(".");
  const forged = `${Buffer.from(JSON.stringify({ u: "admin", exp: now * 2 })).toString("base64url")}.${signature}`;
  assert.equal(readSessionToken(forged, SECRET, now), null);
  assert.equal(readSessionToken("basura", SECRET, now), null);
  assert.equal(readSessionToken(undefined, SECRET, now), null);
});

test("sin configuración completa no se habilita el acceso de coordinación", () => {
  const env = { ADMIN_USUARIO: "oarias", ADMIN_CLAVE_HASH: "scrypt$a$b", SESSION_SECRET: SECRET };
  assert.equal(loadAdminConfig(env).nombre, "oarias");
  assert.equal(loadAdminConfig({ ...env, SESSION_SECRET: "corto" }), null);
  assert.equal(loadAdminConfig({ ...env, ADMIN_CLAVE_HASH: "" }), null);
});

test("los correos al estudiante citan el caso, la fecha larga y la hora", () => {
  const cita = { caso: "SS-2026-0007", nombreCompleto: "Ana López", fecha: "2026-10-27", hora: "09:00" };
  const { asunto, cuerpo } = renderEmail("ASIGNACION", cita);
  assert.equal(asunto, "Cita de servicio social asignada · Caso SS-2026-0007");
  assert.match(cuerpo, /Martes 27 de octubre de 2026 a las 09:00 h/);
  assert.match(renderEmail("CANCELACION", cita).asunto, /cancelada/);
  assert.throws(() => renderEmail("SPAM", cita), RangeError);
});

test("sin EMAIL_TRANSPORT los correos quedan pendientes; un valor desconocido es un error", () => {
  assert.equal(getEmailTransport({}), null);
  assert.equal(typeof getEmailTransport({ EMAIL_TRANSPORT: "consola" }).send, "function");
  assert.throws(() => getEmailTransport({ EMAIL_TRANSPORT: "pigeon" }), /desconocido/);
});
