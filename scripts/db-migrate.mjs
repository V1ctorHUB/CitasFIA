#!/usr/bin/env node
// Uso: node scripts/db-migrate.mjs [status]
// Usa DATABASE_ADMIN_URL (rol dueño del esquema); la aplicación usa DATABASE_URL con permisos reducidos.
import pg from "pg";
import { migrate, migrationStatus } from "../lib/db/migrate.mjs";

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) {
  console.error("Define DATABASE_ADMIN_URL (ver .env.example).");
  process.exit(1);
}

const client = new pg.Client({ connectionString, application_name: "citas-migraciones" });

try {
  await client.connect();

  if (process.argv[2] === "status") {
    for (const { version, name, applied } of await migrationStatus(client)) {
      console.log(`${applied ? "✓" : "·"} ${String(version).padStart(4, "0")}_${name}`);
    }
  } else {
    const applied = await migrate(client, { log: console.log });
    console.log(applied.length ? `${applied.length} migración(es) aplicada(s).` : "Base de datos al día.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
