// Pruebas contra un PostgreSQL real. Se omiten si no se define TEST_DATABASE_URL.
// ¡Borran el esquema public de esa base! Usa una base exclusiva de pruebas (p. ej. citas_test).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createDuiCipher } from "./dui-crypto.mjs";
import { migrate, migrationStatus, MIGRATIONS_DIR } from "./migrate.mjs";
import { listActiveProjects } from "./projects-repository.mjs";
import { createRegistration } from "./registrations-repository.mjs";
import { createManualAppointment, getHistory, listAgenda, listEmails, performAction, searchAppointments, setDayBlocked } from "./agenda-repository.mjs";
import { deliverPendingEmails } from "../server/email.mjs";
import { buildAppointmentPayload, proyectosData, careers, getFacultyForCareer } from "../registration-form.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
const skip = connectionString ? false : "define TEST_DATABASE_URL para ejecutar las pruebas de base de datos";

const cipher = createDuiCipher({
  DUI_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DUI_HASH_KEY: Buffer.alloc(32, 9).toString("base64"),
});

const baseRegistration = {
  nombreCompleto: "Ana María López",
  carnet: "00012345",
  dui: "01234567-8",
  telefono: "7123-4567",
  genero: "femenino",
  carrera: "Ingeniería Informática",
  ciclo: "01",
  anio: "2027",
};

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `00000000-0000-4000-8000-${String(keyCounter).padStart(12, "0")}`;
}

function payloadFor(overrides = {}, project = proyectosData[1]) {
  return buildAppointmentPayload({ ...baseRegistration, ...overrides }, project);
}

async function expectPgError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
}

test("base de datos PostgreSQL", { skip, concurrency: false }, async (t) => {
  const pool = new pg.Pool({ connectionString, max: 8 });
  t.after(() => pool.end());

  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const client = await pool.connect();
  try {
    await migrate(client);
  } finally {
    client.release();
  }

  await t.test("las migraciones son idempotentes y quedan registradas", async () => {
    const again = await pool.connect();
    try {
      assert.equal((await migrate(again)).length, 0);
      assert.ok((await migrationStatus(again)).every(({ applied }) => applied));
    } finally {
      again.release();
    }
  });

  await t.test("una migración editada después de aplicarse aborta la ejecución", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "migraciones-"));
    await cp(MIGRATIONS_DIR, directory, { recursive: true });
    const file = path.join(directory, "0002_catalogos_iniciales.sql");
    await writeFile(file, `${await readFile(file, "utf8")}\n-- cambio`);

    const again = await pool.connect();
    try {
      await assert.rejects(migrate(again, { directory }), /cambió después de aplicarse/);
    } finally {
      again.release();
    }
  });

  await t.test("los catálogos sembrados coinciden con los del formulario", async () => {
    assert.deepEqual(await listActiveProjects(pool), proyectosData);
    const { rows } = await pool.query("SELECT nombre, facultad FROM carreras ORDER BY id");
    assert.deepEqual(rows.map(({ nombre }) => nombre), careers);
    assert.deepEqual(rows.map(({ facultad }) => facultad), careers.map(getFacultyForCareer));
  });

  await t.test("registra una solicitud con DUI cifrado y campos derivados en la base", async () => {
    const result = await createRegistration(pool, payloadFor(), { idempotencyKey: newKey(), cipher });
    assert.equal(result.status, "created");

    const { rows: [row] } = await pool.query(`
      SELECT e.correo_institucional, e.telefono, e.dui_cifrado, c.ciclo_egreso, c.estado, c.proyecto_nombre, c.institucion_nombre
      FROM citas c JOIN estudiantes e ON e.id = c.estudiante_id WHERE c.codigo = $1`, [result.codigo]);

    assert.equal(row.correo_institucional, "00012345@uca.edu.sv");
    assert.equal(row.telefono, "7123-4567");
    assert.equal(row.ciclo_egreso, "01/2027");
    assert.equal(row.estado, "SOLICITADA");
    assert.equal(row.proyecto_nombre, "Alfabetización Digital Comunitaria");
    assert.equal(row.institucion_nombre, "Alcaldía Municipal de San Salvador");
    assert.equal(cipher.decrypt(row.dui_cifrado), "01234567-8");
    assert.equal(row.dui_cifrado.includes(Buffer.from("01234567")), false);
  });

  await t.test("reenviar la misma clave de idempotencia no duplica la solicitud", async () => {
    const idempotencyKey = newKey();
    const payload = payloadFor({ carnet: "00020000", dui: "00000000-0" });
    const first = await createRegistration(pool, payload, { idempotencyKey, cipher });
    const second = await createRegistration(pool, payload, { idempotencyKey, cipher });

    assert.equal(first.status, "created");
    assert.deepEqual(second, { status: "replayed", codigo: first.codigo });
    const { rows } = await pool.query("SELECT count(*)::int AS total FROM citas WHERE clave_idempotencia = $1", [idempotencyKey]);
    assert.equal(rows[0].total, 1);
  });

  await t.test("un estudiante no puede tener dos solicitudes abiertas", async () => {
    const result = await createRegistration(pool, payloadFor(), { idempotencyKey: newKey(), cipher });
    assert.deepEqual(result, { status: "conflict", reason: "open-request" });
  });

  await t.test("carnet con otro DUI, o DUI con otro carnet, se rechaza sin modificar al estudiante", async () => {
    const otherDui = await createRegistration(pool, payloadFor({ dui: "00000001-9", nombreCompleto: "Impostor Uno" }), { idempotencyKey: newKey(), cipher });
    assert.deepEqual(otherDui, { status: "conflict", reason: "identity-mismatch" });

    const otherCarnet = await createRegistration(pool, payloadFor({ carnet: "00099999" }), { idempotencyKey: newKey(), cipher });
    assert.deepEqual(otherCarnet, { status: "conflict", reason: "identity-mismatch" });

    const { rows } = await pool.query("SELECT nombre_completo FROM estudiantes WHERE carnet = '00012345'");
    assert.equal(rows[0].nombre_completo, "Ana María López");
    const { rows: orphan } = await pool.query("SELECT 1 FROM estudiantes WHERE carnet = '00099999'");
    assert.equal(orphan.length, 0);
  });

  await t.test("envíos concurrentes del mismo estudiante producen exactamente una solicitud", async () => {
    const payload = payloadFor({ carnet: "00030000", dui: "00000002-8" });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => createRegistration(pool, payload, { idempotencyKey: newKey(), cipher })),
    );

    assert.equal(results.filter(({ status }) => status === "created").length, 1);
    assert.ok(results.every(({ status }) => status === "created" || status === "conflict"));
  });

  await t.test("un proyecto desactivado no acepta solicitudes nuevas", async () => {
    await pool.query("UPDATE proyectos SET activo = false WHERE id = 3");
    try {
      const result = await createRegistration(pool, payloadFor({ carnet: "00040000", dui: "00000003-6" }, proyectosData[3]), { idempotencyKey: newKey(), cipher });
      assert.deepEqual(result, { status: "invalid-project" });
      assert.equal((await listActiveProjects(pool)).some(({ id }) => id === 3), false);
    } finally {
      await pool.query("UPDATE proyectos SET activo = true WHERE id = 3");
    }
  });

  await t.test("renombrar un proyecto no altera el historial de citas", async () => {
    await pool.query("UPDATE proyectos SET nombre = 'Alfabetización Digital 2027' WHERE id = 1");
    const { rows } = await pool.query("SELECT DISTINCT proyecto_nombre FROM citas WHERE proyecto_id = 1");
    assert.deepEqual(rows, [{ proyecto_nombre: "Alfabetización Digital Comunitaria" }]);
    await pool.query("UPDATE proyectos SET nombre = 'Alfabetización Digital Comunitaria' WHERE id = 1");
  });

  await t.test("no se pueden borrar proyectos, estudiantes, citas ni auditoría", async () => {
    await expectPgError(pool.query("DELETE FROM proyectos WHERE id = 2"), "23001");
    await expectPgError(pool.query("DELETE FROM estudiantes"), "23001");
    await expectPgError(pool.query("DELETE FROM citas"), "23001");
    await expectPgError(pool.query("DELETE FROM auditoria"), "23001");
    await expectPgError(pool.query("UPDATE auditoria SET actor = 'x'"), "23001");
  });

  await t.test("la auditoría registra cada cambio con su actor y sin el DUI", async () => {
    const { rows } = await pool.query(
      "SELECT actor, datos_despues FROM auditoria WHERE tabla = 'estudiantes' AND operacion = 'INSERT' LIMIT 1",
    );
    assert.equal(rows[0].actor, "formulario-publico");
    assert.equal("dui_cifrado" in rows[0].datos_despues, false);
    assert.equal("dui_hash" in rows[0].datos_despues, false);

    const { rows: renames } = await pool.query(
      "SELECT datos_antes->>'nombre' AS antes FROM auditoria WHERE tabla = 'proyectos' AND operacion = 'UPDATE' AND registro_id = '1' ORDER BY id LIMIT 1",
    );
    assert.equal(renames[0].antes, "Alfabetización Digital Comunitaria");
  });

  await t.test("los constraints rechazan datos corruptos aunque se salte la aplicación", async () => {
    const insertStudent = (carnet, nombre) => pool.query(
      "INSERT INTO estudiantes (carnet, dui_hash, dui_cifrado, nombre_completo, genero) VALUES ($1, $2, $3, $4, 'otro')",
      [carnet, Buffer.alloc(32, carnet.length), Buffer.alloc(40), nombre],
    );
    await expectPgError(insertStudent("1234", "Nombre Válido"), "23514");
    await expectPgError(insertStudent("12345678", "<script>"), "23514");
    await expectPgError(pool.query("UPDATE estudiantes SET telefono = '1234-5678'"), "23514");
    await expectPgError(pool.query("UPDATE citas SET estado = 'CONFIRMADA' WHERE fecha_hora IS NULL"), "23514");
    await expectPgError(pool.query("UPDATE citas SET asistencia = 'ASISTIO'"), "23514");
    await expectPgError(pool.query("UPDATE proyectos SET activo = false WHERE id = 0"), "23514");
    await expectPgError(pool.query("INSERT INTO proyectos (nombre, institucion_id) VALUES ('asesoria general uca', 1)"), "23505");
  });

  await t.test("los atributos flexibles de proyectos se validan contra su definición", async () => {
    await expectPgError(pool.query(`UPDATE proyectos SET atributos = '{"cupos": 5}' WHERE id = 1`), "23514");

    await pool.query(`INSERT INTO proyecto_campos (clave, etiqueta, tipo) VALUES ('cupos', 'Cupos disponibles', 'entero')`);
    await pool.query(`INSERT INTO proyecto_campos (clave, etiqueta, tipo, opciones) VALUES ('modalidad', 'Modalidad', 'lista', '["presencial","virtual"]')`);
    await pool.query(`UPDATE proyectos SET atributos = '{"cupos": 5, "modalidad": "virtual"}' WHERE id = 1`);

    await expectPgError(pool.query(`UPDATE proyectos SET atributos = '{"cupos": 2.5}' WHERE id = 1`), "23514");
    await expectPgError(pool.query(`UPDATE proyectos SET atributos = '{"modalidad": "mixta"}' WHERE id = 1`), "23514");
    await expectPgError(pool.query(`UPDATE proyectos SET atributos = '[]' WHERE id = 1`), "23514");

    // Requerido solo cuando todos los proyectos activos ya lo tienen.
    await expectPgError(pool.query("UPDATE proyecto_campos SET requerido = true WHERE clave = 'cupos'"), "23514");
    await pool.query(`UPDATE proyectos SET atributos = atributos || '{"cupos": 0}' WHERE id <> 1`);
    await pool.query("UPDATE proyecto_campos SET requerido = true WHERE clave = 'cupos'");
    await expectPgError(pool.query(`UPDATE proyectos SET atributos = '{}' WHERE id = 2`), "23514");

    await expectPgError(pool.query("DELETE FROM proyecto_campos WHERE clave = 'cupos'"), "23001");
    await expectPgError(pool.query("UPDATE proyecto_campos SET tipo = 'texto' WHERE clave = 'cupos'"), "23001");
  });

  await t.test("agenda: asignar, confirmar y registrar asistencia encola correos en la misma transacción", async () => {
    const today = "2026-10-26";
    const opts = { actor: "prueba", today };
    const payload = payloadFor({ carnet: "00050000", dui: "00000004-4", nombreCompleto: "Beatriz Agenda" });
    const { codigo } = await createRegistration(pool, payload, { idempotencyKey: newKey(), cipher });
    const { rows: [{ id }] } = await pool.query("SELECT id FROM citas WHERE codigo = $1", [codigo]);

    const agenda = await listAgenda(pool, cipher);
    const enBandeja = agenda.solicitudes.find((s) => s.id === id);
    assert.equal(enBandeja.dui, "00000004-4");
    assert.equal(enBandeja.telefono, "7123-4567");
    assert.match(enBandeja.caso, /^SS-\d{4}-\d{4,}$/);

    assert.deepEqual(
      (await performAction(pool, { id, accion: "asignar", fecha: "2026-10-31", hora: "09:00" }, opts)).status,
      "invalid",
    );
    assert.equal((await performAction(pool, { id, accion: "asignar", fecha: "2026-10-27", hora: "09:00" }, opts)).status, "ok");
    assert.equal((await performAction(pool, { id, accion: "asignar", fecha: "2026-10-28", hora: "09:00" }, opts)).status, "conflict");

    const semana = await listAgenda(pool, cipher, { desde: "2026-10-26", hasta: "2026-10-30" });
    const cita = semana.citas.find((c) => c.id === id);
    assert.deepEqual([cita.fecha, cita.hora, cita.estado], ["2026-10-27", "09:00", "PENDIENTE_CONFIRMACION"]);
    assert.equal(semana.solicitudes.some((s) => s.id === id), false);

    const [correo] = await listEmails(pool);
    assert.equal(correo.tipo, "ASIGNACION");
    assert.equal(correo.destinatario, "00050000@uca.edu.sv");
    assert.equal(correo.estado, "PENDIENTE");
    assert.match(correo.cuerpo, /Martes 27 de octubre de 2026 a las 09:00 h/);

    assert.equal((await performAction(pool, { id, accion: "asistio" }, opts)).status, "conflict");
    assert.equal((await performAction(pool, { id, accion: "confirmar" }, opts)).status, "ok");
    assert.match((await performAction(pool, { id, accion: "asistio" }, opts)).message, /día de la cita/);
    opts.today = "2026-10-27";
    assert.equal((await performAction(pool, { id, accion: "asistio" }, opts)).status, "ok");
    assert.equal((await performAction(pool, { id, accion: "no_asistio" }, opts)).status, "ok");
    assert.equal((await performAction(pool, { id, accion: "cancelar" }, opts)).status, "conflict");

    const historial = (await getHistory(pool, id)).map(({ descripcion }) => descripcion);
    assert.equal(historial[0], "Solicitud recibida desde el formulario público");
    assert.equal(historial.at(-1), "Asistencia registrada: No asistió (solo estadística)");
  });

  await t.test("agenda: un horario ocupado o un día desactivado no aceptan otra cita", async () => {
    const opts = { actor: "prueba", today: "2026-10-26" };
    const payload = payloadFor({ carnet: "00060000", dui: "00000005-2", nombreCompleto: "Carlos Choque" });
    const { codigo } = await createRegistration(pool, payload, { idempotencyKey: newKey(), cipher });
    const { rows: [{ id }] } = await pool.query("SELECT id FROM citas WHERE codigo = $1", [codigo]);

    assert.deepEqual(
      await performAction(pool, { id, accion: "asignar", fecha: "2026-10-27", hora: "09:00" }, opts),
      { status: "conflict", message: "Ese horario ya está ocupado." },
    );

    const { citasEseDia } = await setDayBlocked(pool, "2026-10-29", true, opts);
    assert.equal(citasEseDia, 0);
    assert.deepEqual((await listAgenda(pool, cipher)).bloqueados, ["2026-10-29"]);
    assert.match((await performAction(pool, { id, accion: "asignar", fecha: "2026-10-29", hora: "10:00" }, opts)).message, /desactivado/);
    await setDayBlocked(pool, "2026-10-29", false, opts);
    assert.equal((await performAction(pool, { id, accion: "asignar", fecha: "2026-10-29", hora: "10:00" }, opts)).status, "ok");

    // Mover con aviso vuelve a "Asignada"; eliminar con aviso encola la cancelación y libera el horario.
    assert.equal((await performAction(pool, { id, accion: "mover", fecha: "2026-10-30", hora: "10:00" }, opts)).status, "ok");
    assert.equal((await performAction(pool, { id, accion: "cancelar", notificar: true }, opts)).status, "ok");
    const tipos = (await listEmails(pool)).filter(({ destinatario }) => destinatario === "00060000@uca.edu.sv").map(({ tipo }) => tipo);
    assert.deepEqual(tipos, ["CANCELACION", "REPROGRAMACION", "ASIGNACION"]);

    const otra = await createRegistration(pool, payload, { idempotencyKey: newKey(), cipher });
    assert.equal(otra.status, "created", "cancelar libera al estudiante para otra solicitud");
  });

  await t.test("agenda: cita manual confirmada, búsqueda por DUI y entrega de correos pendientes", async () => {
    const opts = { cipher, actor: "prueba", today: "2026-10-26" };
    const payload = payloadFor({ carnet: "00070000", dui: "00000006-0", nombreCompleto: "Diana Manual" });

    assert.deepEqual(
      await createManualAppointment(pool, payload, { fecha: "2026-10-27", hora: "09:00" }, opts),
      { status: "invalid", errors: { hora: "Ese horario ya está ocupado." } },
    );
    const result = await createManualAppointment(pool, payload, { fecha: "2026-10-28", hora: "11:00" }, opts);
    assert.equal(result.status, "ok");

    const [encontrada] = await searchAppointments(pool, cipher, "000000060");
    assert.equal(encontrada.nombreCompleto, "Diana Manual");
    assert.equal(encontrada.estado, "CONFIRMADA");
    assert.equal(encontrada.origen, "MANUAL");
    assert.equal((await searchAppointments(pool, cipher, "diana")).length, 1);
    assert.equal((await searchAppointments(pool, cipher, encontrada.caso))[0].id, encontrada.id);

    assert.deepEqual(await deliverPendingEmails(pool, null), { enviados: 0, fallidos: 0, sinTransporte: true });
    const enviados = [];
    const transporte = { send: async (correo) => { if (correo.asunto.includes("cancelada")) throw new Error("SMTP caído"); enviados.push(correo); } };
    const resultado = await deliverPendingEmails(pool, transporte);
    assert.equal(resultado.fallidos, 1);
    assert.equal(resultado.enviados, enviados.length);
    const estados = await listEmails(pool);
    assert.ok(estados.filter(({ tipo }) => tipo !== "CANCELACION").every(({ estado }) => estado === "ENVIADO"));
    assert.equal(estados.find(({ tipo }) => tipo === "CANCELACION").ultimo_error, "SMTP caído");
  });
});
