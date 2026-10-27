import { withTransaction } from "./pool.mjs";

/**
 * @typedef {ReturnType<typeof import("../registration-form.mjs").buildAppointmentPayload>} AppointmentPayload
 * @typedef {ReturnType<typeof import("./dui-crypto.mjs").createDuiCipher>} DuiCipher
 * @typedef {(
 *   | { status: "created", codigo: string }
 *   | { status: "replayed", codigo: string }
 *   | { status: "conflict", reason: "identity-mismatch" | "open-request" }
 *   | { status: "invalid-project" }
 * )} RegistrationResult
 */

const PG_UNIQUE_VIOLATION = "23505";

export class RegistrationRejected extends Error {
  /** @param {RegistrationResult} result */
  constructor(result) {
    super(result.status);
    this.result = result;
  }
}

function constraintOf(error) {
  return error?.code === PG_UNIQUE_VIOLATION ? error.constraint : undefined;
}

async function findByIdempotencyKey(db, idempotencyKey) {
  const { rows } = await db.query("SELECT codigo FROM citas WHERE clave_idempotencia = $1", [idempotencyKey]);
  return rows[0]?.codigo ?? null;
}

// Si el carnet ya existe solo se actualiza cuando el DUI coincide: un carnet nunca cambia de dueño.
export async function upsertStudent(client, payload, cipher) {
  const { rows } = await client.query(
    `INSERT INTO estudiantes (carnet, dui_hash, dui_cifrado, nombre_completo, genero, telefono)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (carnet) DO UPDATE
       SET nombre_completo = EXCLUDED.nombre_completo, genero = EXCLUDED.genero, telefono = EXCLUDED.telefono
       WHERE estudiantes.dui_hash = EXCLUDED.dui_hash
     RETURNING id`,
    [payload.carnet, cipher.hash(payload.dui), cipher.encrypt(payload.dui), payload.nombreCompleto, payload.genero, payload.telefono],
  );
  if (rows.length === 0) throw new RegistrationRejected({ status: "conflict", reason: "identity-mismatch" });
  return rows[0].id;
}

async function insertAppointment(client, studentId, payload, idempotencyKey) {
  const { rows } = await client.query(
    `INSERT INTO citas (
       estudiante_id, carrera_id, egreso_ciclo, egreso_anio,
       proyecto_id, proyecto_nombre, institucion_nombre, origen, clave_idempotencia
     )
     SELECT $1, c.id, $3, $4, p.id, p.nombre, i.nombre, 'FORMULARIO', $6
     FROM proyectos p
     JOIN instituciones i ON i.id = p.institucion_id
     JOIN carreras c ON c.nombre = $2 AND c.activa
     WHERE p.id = $5 AND p.activo
     RETURNING codigo`,
    [studentId, payload.carrera, Number(payload.ciclo), Number(payload.anio), payload.proyecto_id, idempotencyKey],
  );
  if (rows.length === 0) throw new RegistrationRejected({ status: "invalid-project" });
  return rows[0].codigo;
}

/**
 * Registra la solicitud del formulario público en una sola transacción.
 * Reenviar la misma `idempotencyKey` (doble clic, reintento de red) devuelve la misma cita sin duplicarla.
 * @param {import("pg").Pool} pool
 * @param {AppointmentPayload} payload ya validado con validateRegistration
 * @param {{ idempotencyKey: string, cipher: DuiCipher }} options
 * @returns {Promise<RegistrationResult>}
 */
export async function createRegistration(pool, payload, { idempotencyKey, cipher }) {
  const replayed = await findByIdempotencyKey(pool, idempotencyKey);
  if (replayed) return { status: "replayed", codigo: replayed };

  try {
    const codigo = await withTransaction(pool, async (client) => {
      const studentId = await upsertStudent(client, payload, cipher);
      return insertAppointment(client, studentId, payload, idempotencyKey);
    }, { actor: "formulario-publico" });
    return { status: "created", codigo };
  } catch (error) {
    if (error instanceof RegistrationRejected) return error.result;

    switch (constraintOf(error)) {
      case "citas_clave_idempotencia_key": {
        const codigo = await findByIdempotencyKey(pool, idempotencyKey);
        if (codigo) return { status: "replayed", codigo };
        break;
      }
      case "estudiantes_dui_hash_key":
      case "estudiantes_carnet_key":
        return { status: "conflict", reason: "identity-mismatch" };
      case "citas_una_abierta_por_estudiante":
        return { status: "conflict", reason: "open-request" };
      default:
        break;
    }
    throw error;
  }
}
