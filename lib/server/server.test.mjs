import test from "node:test";
import assert from "node:assert/strict";
import { createDuiCipher } from "../db/dui-crypto.mjs";
import { createIdempotencyKey, enviarSolicitud, proyectosData } from "../registration-form.mjs";
import { createRateLimiter } from "./rate-limit.mjs";
import { isSameOrigin, parseRegistrationRequest, readJsonBody } from "./registration-request.mjs";

const KEYS = {
  DUI_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  DUI_HASH_KEY: Buffer.alloc(32, 2).toString("base64"),
};

const validRegistration = {
  nombreCompleto: "Ana María López",
  carnet: "00012345",
  dui: "01234567-8",
  genero: "femenino",
  carrera: "Ingeniería Informática",
  ciclo: "01",
  anio: "2027",
};

const validBody = {
  registro: validRegistration,
  proyecto_id: 1,
  clave_idempotencia: "3f1c2a44-9a1b-4c3d-8e2f-0123456789ab",
};

function jsonRequest(body, headers = {}) {
  return new Request("http://localhost/api/citas", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("el cifrado de DUI es reversible, no determinista y su hash sí es determinista", () => {
  const cipher = createDuiCipher(KEYS);
  const first = cipher.encrypt("01234567-8");
  const second = cipher.encrypt("01234567-8");

  assert.notDeepEqual(first, second);
  assert.equal(cipher.decrypt(first), "01234567-8");
  assert.equal(first.includes(Buffer.from("01234567")), false);
  assert.deepEqual(cipher.hash("01234567-8"), cipher.hash("01234567-8"));
  assert.equal(cipher.hash("01234567-8").length, 32);
});

test("el cifrado de DUI detecta manipulación y rechaza claves o formatos inválidos", () => {
  const cipher = createDuiCipher(KEYS);
  const tampered = cipher.encrypt("01234567-8");
  tampered[tampered.length - 1] ^= 0xff;

  assert.throws(() => cipher.decrypt(tampered));
  assert.throws(() => cipher.encrypt("012345678"), TypeError);
  assert.throws(() => createDuiCipher({ ...KEYS, DUI_HASH_KEY: "corta" }), /32 bytes/);
  assert.throws(() => createDuiCipher({}), /DUI_ENCRYPTION_KEY/);
});

test("parseRegistrationRequest acepta un cuerpo válido y recalcula los campos derivados", () => {
  const parsed = parseRegistrationRequest(
    { ...validBody, registro: { ...validRegistration, facultad: "Otra", correo_institucional: "x@evil.com" } },
    proyectosData,
  );

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.correo_institucional, "00012345@uca.edu.sv");
  assert.equal(parsed.payload.facultad, "Facultad de Ingeniería y Arquitectura (FIA)");
  assert.equal(parsed.payload.institucion, "Alcaldía Municipal de San Salvador");
  assert.equal(parsed.payload.ciclo_egreso, "01/2027");
});

test("parseRegistrationRequest rechaza cuerpos malformados, proyectos fuera de catálogo y claves inválidas", () => {
  assert.equal(parseRegistrationRequest(null, proyectosData).ok, false);
  assert.equal(parseRegistrationRequest([], proyectosData).ok, false);
  assert.equal(parseRegistrationRequest({ ...validBody, clave_idempotencia: "1" }, proyectosData).ok, false);

  const unknownProject = parseRegistrationRequest({ ...validBody, proyecto_id: 99 }, proyectosData);
  assert.equal(unknownProject.ok, false);
  assert.ok(unknownProject.errors.proyecto);

  const badTypes = parseRegistrationRequest({ ...validBody, registro: { ...validRegistration, dui: 123 } }, proyectosData);
  assert.equal(badTypes.ok, false);
  assert.ok(badTypes.errors.dui);
});

test("readJsonBody exige JSON y limita el tamaño del cuerpo", async () => {
  assert.deepEqual(await readJsonBody(jsonRequest({ a: 1 })), { ok: true, body: { a: 1 } });
  assert.deepEqual(await readJsonBody(jsonRequest("{no-json")), { ok: false, status: 400 });
  assert.deepEqual(await readJsonBody(jsonRequest({ a: "x".repeat(5000) })), { ok: false, status: 413 });
  assert.deepEqual(
    await readJsonBody(jsonRequest("{}", { "content-type": "text/plain" })),
    { ok: false, status: 415 },
  );
});

test("isSameOrigin solo acepta peticiones del mismo origen o del configurado", () => {
  const sameHost = jsonRequest({}, { origin: "http://localhost", host: "localhost" });
  assert.equal(isSameOrigin(sameHost, undefined), true);
  assert.equal(isSameOrigin(jsonRequest({}, { origin: "https://evil.example", host: "localhost" }), undefined), false);
  assert.equal(isSameOrigin(jsonRequest({}), undefined), false);
  assert.equal(
    isSameOrigin(jsonRequest({}, { origin: "https://citas.uca.edu.sv" }), "https://citas.uca.edu.sv"),
    true,
  );
});

test("el limitador permite hasta el límite por ventana y se reinicia al expirar", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });

  assert.equal(limiter.consume("ip").allowed, true);
  assert.equal(limiter.consume("ip").allowed, true);
  assert.equal(limiter.consume("ip").allowed, false);
  assert.equal(limiter.consume("otra-ip").allowed, true);
  now = 1000;
  assert.equal(limiter.consume("ip").allowed, true);
});

test("enviarSolicitud envía solo los campos del formulario y traduce las respuestas del servidor", async () => {
  const calls = [];
  const fakeFetch = (status, data) => async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(data), { status });
  };
  const project = proyectosData[1];

  assert.deepEqual(await enviarSolicitud(validRegistration, project, validBody.clave_idempotencia, fakeFetch(201, { ok: true })), { status: "ok" });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, "/api/citas");
  assert.deepEqual(sent, validBody);

  assert.deepEqual(
    await enviarSolicitud(validRegistration, project, "k", fakeFetch(400, { errors: { dui: "x" } })),
    { status: "invalid", errors: { dui: "x" } },
  );
  assert.deepEqual(
    await enviarSolicitud(validRegistration, project, "k", fakeFetch(409, { error: "conflicto" })),
    { status: "rejected", message: "conflicto" },
  );
  const offline = await enviarSolicitud(validRegistration, project, "k", async () => { throw new TypeError("offline"); });
  assert.equal(offline.status, "rejected");
});

test("createIdempotencyKey genera UUID v4 incluso sin crypto.randomUUID (HTTP en red local)", () => {
  const key = createIdempotencyKey({ getRandomValues: (array) => array.fill(255) });
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(createIdempotencyKey(), /^[0-9a-f-]{36}$/);
});
