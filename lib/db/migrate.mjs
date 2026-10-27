import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations/", import.meta.url));

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
// Clave arbitraria pero fija: impide que dos procesos migren a la vez.
const MIGRATION_LOCK_KEY = 727_001;

/**
 * @typedef {{ version: number, name: string, checksum: string, sql: string }} Migration
 * @typedef {{ version: number, name: string, checksum: string }} AppliedMigration
 * @typedef {{ query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }} Queryable
 */

function checksumOf(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/** @returns {Promise<Migration[]>} */
export async function loadMigrations(directory = MIGRATIONS_DIR) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const migrations = [];

  for (const file of files) {
    const match = MIGRATION_FILE_PATTERN.exec(file);
    if (!match) throw new Error(`Nombre de migración inválido: ${file} (se espera 0001_nombre.sql)`);

    const sql = await readFile(path.join(directory, file), "utf8");
    migrations.push({ version: Number(match[1]), name: match[2], checksum: checksumOf(sql), sql });
  }

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Las migraciones deben ser consecutivas: falta la versión ${index + 1}`);
    }
  });

  return migrations;
}

/** @param {Queryable} client @returns {Promise<AppliedMigration[]>} */
async function readAppliedMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migraciones (
      version     integer PRIMARY KEY,
      nombre      text NOT NULL,
      checksum    text NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await client.query(
    "SELECT version, nombre AS name, checksum FROM schema_migraciones ORDER BY version",
  );
  return rows;
}

/** Un archivo ya aplicado que cambió indica historial divergente: se aborta sin tocar nada. */
function assertHistoryMatches(applied, migrations) {
  for (const record of applied) {
    const migration = migrations.find(({ version }) => version === record.version);
    if (!migration) {
      throw new Error(`La base tiene la migración ${record.version} (${record.name}) que no existe en el código.`);
    }
    if (migration.checksum !== record.checksum) {
      throw new Error(
        `La migración ${record.version}_${record.name}.sql cambió después de aplicarse. `
        + "Crea una migración nueva en lugar de editar una existente.",
      );
    }
  }
}

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción.
 * @param {import("pg").PoolClient | import("pg").Client} client
 * @param {{ directory?: string, log?: (message: string) => void }} [options]
 * @returns {Promise<Migration[]>} migraciones aplicadas en esta ejecución
 */
export async function migrate(client, { directory = MIGRATIONS_DIR, log = () => {} } = {}) {
  const migrations = await loadMigrations(directory);
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

  try {
    const applied = await readAppliedMigrations(client);
    assertHistoryMatches(applied, migrations);

    const appliedVersions = new Set(applied.map(({ version }) => version));
    const pending = migrations.filter(({ version }) => !appliedVersions.has(version));

    for (const migration of pending) {
      log(`Aplicando ${String(migration.version).padStart(4, "0")}_${migration.name}...`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migraciones (version, nombre, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Falló la migración ${migration.version}_${migration.name}: ${error.message}`, { cause: error });
      }
    }

    return pending;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
  }
}

/** @param {Queryable} client */
export async function migrationStatus(client, { directory = MIGRATIONS_DIR } = {}) {
  const migrations = await loadMigrations(directory);
  const applied = await readAppliedMigrations(client);
  assertHistoryMatches(applied, migrations);
  const appliedVersions = new Set(applied.map(({ version }) => version));

  return migrations.map(({ version, name }) => ({ version, name, applied: appliedVersions.has(version) }));
}
