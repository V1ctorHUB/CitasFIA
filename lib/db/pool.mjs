import pg from "pg";

const POOL_KEY = Symbol.for("citas.pgPool");

/**
 * Pool único por proceso (se reutiliza entre recargas en desarrollo).
 * @returns {import("pg").Pool}
 */
export function getPool() {
  const existing = globalThis[POOL_KEY];
  if (existing) return existing;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta la variable de entorno DATABASE_URL.");

  const pool = new pg.Pool({
    connectionString,
    application_name: "citas-app",
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
  });
  // Un cliente inactivo que pierde la conexión no debe tumbar el proceso.
  pool.on("error", (error) => console.error("[db] error en cliente inactivo:", error.message));

  globalThis[POOL_KEY] = pool;
  return pool;
}

/**
 * Ejecuta `work` dentro de una transacción; hace ROLLBACK ante cualquier error.
 * @template T
 * @param {import("pg").Pool} pool
 * @param {(client: import("pg").PoolClient) => Promise<T>} work
 * @param {{ actor?: string }} [options]
 * @returns {Promise<T>}
 */
export async function withTransaction(pool, work, { actor } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (actor) await client.query("SELECT set_config('app.actor', $1, true)", [actor]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
