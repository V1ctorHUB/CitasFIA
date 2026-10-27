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
});
