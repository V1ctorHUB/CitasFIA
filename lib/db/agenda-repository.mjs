import { formatLongDate, formatShortDate, isMovable, TIME_ZONE, todayInElSalvador, validateSlot } from "../agenda.mjs";
import { renderEmail } from "../server/email.mjs";
import { withTransaction } from "./pool.mjs";
import { RegistrationRejected, upsertStudent } from "./registrations-repository.mjs";

/**
 * @typedef {ReturnType<typeof import("./dui-crypto.mjs").createDuiCipher>} DuiCipher
 * @typedef {(
 *   | { status: "ok", message: string }
 *   | { status: "invalid", errors: Record<string, string> }
 *   | { status: "conflict", message: string }
 *   | { status: "not-found" }
 * )} ActionResult
 */

const TZ = `'${TIME_ZONE}'`;
const PG_UNIQUE_VIOLATION = "23505";
const SLOT_TAKEN = "Ese horario ya está ocupado.";
const DAY_BLOCKED = "Ese día está desactivado en la agenda.";

// Estado visible en el panel: la asistencia, si ya se registró, reemplaza al estado de la cita.
const CITA_COLUMNS = `
  c.id,
  'SS-' || to_char(c.creado_en AT TIME ZONE ${TZ}, 'YYYY') || '-' || lpad(c.id::text, 4, '0') AS caso,
  c.origen::text AS origen,
  to_char(c.creado_en AT TIME ZONE ${TZ}, 'DD/MM/YYYY HH24:MI') AS recibida,
  e.nombre_completo AS "nombreCompleto", e.carnet, e.correo_institucional AS correo, e.dui_cifrado,
  e.telefono, e.genero::text AS genero, ca.nombre AS carrera, ca.facultad, c.ciclo_egreso,
  c.proyecto_id, c.proyecto_nombre AS proyecto, c.institucion_nombre AS institucion,
  to_char(c.fecha_hora AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS fecha,
  to_char(c.fecha_hora AT TIME ZONE ${TZ}, 'HH24:MI') AS hora,
  CASE WHEN c.asistencia <> 'PENDIENTE' THEN c.asistencia::text ELSE c.estado::text END AS estado`;

const CITA_FROM = `
  FROM citas c
  JOIN estudiantes e ON e.id = c.estudiante_id
  JOIN carreras ca ON ca.id = c.carrera_id`;

// Convierte fecha y hora locales de El Salvador en un instante (timestamptz).
const SLOT_SQL = `(($1::date + $2::time) AT TIME ZONE ${TZ})`;

function toView(row, cipher) {
  const { dui_cifrado: encrypted, ...rest } = row;
  return { ...rest, dui: cipher.decrypt(encrypted) };
}

/**
 * Bandeja (solicitudes sin horario), citas vigentes del rango y días desactivados.
 * `desde`/`hasta` vacíos = sin límite (rango "Todo" del dashboard).
 * @param {import("pg").Pool} db
 * @param {DuiCipher} cipher
 */
export async function listAgenda(db, cipher, { desde = null, hasta = null } = {}) {
  const [solicitudes, citas, bloqueados] = await Promise.all([
    db.query(`SELECT ${CITA_COLUMNS} ${CITA_FROM} WHERE c.estado = 'SOLICITADA' ORDER BY c.creado_en`),
    // shortcut: sin paginar; el rango de fechas acota el volumen (cientos de citas por ciclo). Paginar si crece.
    db.query(
      `SELECT ${CITA_COLUMNS} ${CITA_FROM}
       WHERE c.estado NOT IN ('SOLICITADA', 'CANCELADA')
         AND ($1::date IS NULL OR c.fecha_hora >= ($1::date::timestamp AT TIME ZONE ${TZ}))
         AND ($2::date IS NULL OR c.fecha_hora < (($2::date + 1)::timestamp AT TIME ZONE ${TZ}))
       ORDER BY c.fecha_hora`,
      [desde || null, hasta || null],
    ),
    db.query("SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM dias_bloqueados WHERE bloqueado ORDER BY fecha"),
  ]);

  return {
    solicitudes: solicitudes.rows.map((row) => toView(row, cipher)),
    citas: citas.rows.map((row) => toView(row, cipher)),
    bloqueados: bloqueados.rows.map(({ fecha }) => fecha),
  };
}

/**
 * Búsqueda por número de caso, nombre, carnet o DUI (el DUI se busca por su HMAC, nunca descifrando todo).
 * @param {import("pg").Pool} db
 * @param {DuiCipher} cipher
 */
export async function searchAppointments(db, cipher, query, limit = 8) {
  const text = String(query ?? "").trim();
  if (!text) return [];

  const caso = /^ss-\d{4}-(\d+)$/i.exec(text);
  const duiDigits = text.replace(/\D/g, "");
  const dui = /^\d{8}-?\d$/.test(text) ? cipher.hash(`${duiDigits.slice(0, 8)}-${duiDigits.slice(8)}`) : null;

  const { rows } = await db.query(
    `SELECT ${CITA_COLUMNS} ${CITA_FROM}
     WHERE c.estado <> 'CANCELADA' AND (
       c.id = $1
       OR e.dui_hash = $2
       OR e.carnet LIKE $3 || '%'
       OR normalizar_texto(e.nombre_completo) LIKE '%' || normalizar_texto($4) || '%'
     )
     ORDER BY c.fecha_hora DESC NULLS FIRST, c.creado_en DESC
     LIMIT $5`,
    [caso ? Number(caso[1]) : null, dui, /^\d{1,8}$/.test(text) ? text : null, text, limit],
  );
  return rows.map((row) => toView(row, cipher));
}

/** Historial legible, con la recepción de la solicitud como primer evento. */
export async function getHistory(db, id) {
  const { rows } = await db.query(
    `SELECT to_char(creado_en AT TIME ZONE ${TZ}, 'DD/MM/YYYY HH24:MI') AS cuando,
            CASE origen WHEN 'MANUAL' THEN 'Cita manual registrada por la coordinación'
                        ELSE 'Solicitud recibida desde el formulario público' END AS descripcion,
            creado_en AS orden
     FROM citas WHERE id = $1
     UNION ALL
     SELECT to_char(creado_en AT TIME ZONE ${TZ}, 'DD/MM/YYYY HH24:MI'), descripcion, creado_en
     FROM cita_eventos WHERE cita_id = $1
     ORDER BY orden`,
    [id],
  );
  return rows.map(({ cuando, descripcion }) => ({ cuando, descripcion }));
}

async function isDayBlocked(client, fecha) {
  const { rows } = await client.query("SELECT 1 FROM dias_bloqueados WHERE fecha = $1 AND bloqueado", [fecha]);
  return rows.length > 0;
}

async function addEvent(client, citaId, descripcion, actor) {
  await client.query("INSERT INTO cita_eventos (cita_id, descripcion, actor) VALUES ($1, $2, $3)", [citaId, descripcion, actor]);
}

async function enqueueEmail(client, tipo, cita) {
  const { asunto, cuerpo } = renderEmail(tipo, cita);
  await client.query(
    "INSERT INTO correos (cita_id, tipo, destinatario, asunto, cuerpo) VALUES ($1, $2, $3, $4, $5)",
    [cita.id, tipo, cita.correo, asunto, cuerpo],
  );
}

class ActionRejected extends Error {
  /** @param {ActionResult} result */
  constructor(result) {
    super(result.status);
    this.result = result;
  }
}

const reject = (message) => { throw new ActionRejected({ status: "conflict", message }); };

function slotLabel(fecha, hora) {
  return `${formatLongDate(fecha)}, ${hora} h`;
}

async function placeInSlot(client, cita, { fecha, hora }, nextState) {
  if (await isDayBlocked(client, fecha)) reject(DAY_BLOCKED);
  await client.query(
    `UPDATE citas SET fecha_hora = ${SLOT_SQL}, estado = $4 WHERE id = $3`,
    [fecha, hora, cita.id, nextState],
  );
}

/**
 * Acciones de la coordinación sobre una cita. Cada acción, su historial y su correo se guardan en
 * una sola transacción con la cita bloqueada (FOR UPDATE): dos coordinadores no pueden pisarse.
 * @param {import("pg").Pool} pool
 * @param {{ id: number, accion: string, fecha?: string, hora?: string, notificar?: boolean }} request
 * @param {{ actor: string, today?: string }} options
 * @returns {Promise<ActionResult>}
 */
export async function performAction(pool, { id, accion, fecha, hora, notificar = true }, { actor, today = todayInElSalvador() }) {
  const needsSlot = accion === "asignar" || accion === "mover";
  if (needsSlot) {
    const errors = validateSlot({ fecha, hora }, today);
    if (Object.keys(errors).length) return { status: "invalid", errors };
  }

  try {
    return await withTransaction(pool, async (client) => {
      const { rows: [cita] } = await client.query(
        `SELECT ${CITA_COLUMNS} ${CITA_FROM} WHERE c.id = $1 FOR UPDATE OF c`,
        [id],
      );
      if (!cita) throw new ActionRejected({ status: "not-found" });

      switch (accion) {
        case "asignar": {
          if (cita.estado !== "SOLICITADA") reject("La solicitud ya tiene horario asignado.");
          await placeInSlot(client, cita, { fecha, hora }, "PENDIENTE_CONFIRMACION");
          await addEvent(client, id, `Asignada al ${slotLabel(fecha, hora)} · correo enviado`, actor);
          await enqueueEmail(client, "ASIGNACION", { ...cita, fecha, hora });
          return { status: "ok", message: `Correo en cola para ${cita.correo} · Caso ${cita.caso} · ${slotLabel(fecha, hora)}` };
        }
        case "mover": {
          if (!isMovable(cita.estado)) reject("Solo se pueden mover citas asignadas o confirmadas.");
          if (cita.fecha === fecha && cita.hora === hora) reject("La cita ya está en ese horario.");
          // Mover con aviso vuelve a pedir confirmación al estudiante; sin aviso conserva el estado.
          await placeInSlot(client, cita, { fecha, hora }, notificar ? "PENDIENTE_CONFIRMACION" : cita.estado);
          const movida = `Movida de ${formatShortDate(cita.fecha)} ${cita.hora} a ${formatShortDate(fecha)} ${hora}`;
          await addEvent(client, id, notificar ? `${movida} · correo enviado` : movida, actor);
          if (notificar) await enqueueEmail(client, "REPROGRAMACION", { ...cita, fecha, hora });
          return { status: "ok", message: `Caso ${cita.caso} movido al ${slotLabel(fecha, hora)}.` };
        }
        case "confirmar": {
          if (cita.estado !== "PENDIENTE_CONFIRMACION") reject("La cita no está pendiente de confirmación.");
          await client.query("UPDATE citas SET estado = 'CONFIRMADA' WHERE id = $1", [id]);
          await addEvent(client, id, "Estudiante confirmó por correo · marcada como Confirmada", actor);
          return { status: "ok", message: `Caso ${cita.caso} confirmado en la agenda.` };
        }
        case "asistio":
        case "no_asistio": {
          const asistencia = accion === "asistio" ? "ASISTIO" : "NO_ASISTIO";
          // Se permite corregir Asistió ↔ No asistió.
          if (!["CONFIRMADA", "ASISTIO", "NO_ASISTIO"].includes(cita.estado) || cita.estado === asistencia) {
            reject("Solo se registra asistencia de citas confirmadas.");
          }
          if (cita.fecha > today) reject("La asistencia se registra el día de la cita o después.");
          await client.query("UPDATE citas SET asistencia = $2 WHERE id = $1", [id, asistencia]);
          await addEvent(client, id, accion === "asistio"
            ? "Asistencia registrada: Asistió"
            : "Asistencia registrada: No asistió (solo estadística)", actor);
          return { status: "ok", message: `Asistencia registrada · Caso ${cita.caso}.` };
        }
        case "reenviar": {
          if (!isMovable(cita.estado)) reject("Solo se reenvía el correo de citas por realizar.");
          await enqueueEmail(client, "RECORDATORIO", cita);
          await addEvent(client, id, "Correo reenviado al estudiante", actor);
          return { status: "ok", message: `Correo en cola para ${cita.correo} · Caso ${cita.caso}` };
        }
        case "cancelar": {
          if (cita.estado === "CANCELADA" || cita.estado === "ASISTIO" || cita.estado === "NO_ASISTIO") {
            reject("Esta cita ya no se puede eliminar.");
          }
          // Se conserva la fila (estadística y auditoría); el estudiante puede volver a solicitar.
          await client.query("UPDATE citas SET estado = 'CANCELADA', cancelado_en = now() WHERE id = $1", [id]);
          const avisar = notificar && isMovable(cita.estado);
          await addEvent(client, id, avisar ? "Cita eliminada · cancelación notificada por correo" : "Cita eliminada", actor);
          if (avisar) await enqueueEmail(client, "CANCELACION", cita);
          return { status: "ok", message: avisar ? `Cita eliminada · se notificará la cancelación a ${cita.correo}.` : "Cita eliminada." };
        }
        default:
          throw new ActionRejected({ status: "invalid", errors: { accion: "Acción desconocida." } });
      }
    }, { actor });
  } catch (error) {
    if (error instanceof ActionRejected) return error.result;
    if (error?.code === PG_UNIQUE_VIOLATION && error.constraint === "citas_un_horario_ocupado") {
      return { status: "conflict", message: SLOT_TAKEN };
    }
    throw error;
  }
}

/**
 * Cita registrada por la coordinación (estudiante atendido en persona o por teléfono): queda Confirmada.
 * @param {import("pg").Pool} pool
 * @param {ReturnType<typeof import("../registration-form.mjs").buildAppointmentPayload>} payload validado
 * @returns {Promise<ActionResult>}
 */
export async function createManualAppointment(pool, payload, { fecha, hora }, { cipher, actor, today = todayInElSalvador() }) {
  const errors = validateSlot({ fecha, hora }, today);
  if (Object.keys(errors).length) return { status: "invalid", errors };

  try {
    return await withTransaction(pool, async (client) => {
      if (await isDayBlocked(client, fecha)) throw new ActionRejected({ status: "invalid", errors: { fecha: DAY_BLOCKED } });

      const studentId = await upsertStudent(client, payload, cipher);
      const { rows: [cita] } = await client.query(
        `INSERT INTO citas (
           estudiante_id, carrera_id, egreso_ciclo, egreso_anio, proyecto_id, proyecto_nombre,
           institucion_nombre, origen, estado, fecha_hora
         )
         SELECT $3, c.id, $5, $6, p.id, p.nombre, i.nombre, 'MANUAL', 'CONFIRMADA', ${SLOT_SQL}
         FROM proyectos p
         JOIN instituciones i ON i.id = p.institucion_id
         JOIN carreras c ON c.nombre = $4 AND c.activa
         WHERE p.id = $7 AND p.activo
         RETURNING id, 'SS-' || to_char(creado_en AT TIME ZONE ${TZ}, 'YYYY') || '-' || lpad(id::text, 4, '0') AS caso`,
        [fecha, hora, studentId, payload.carrera, Number(payload.ciclo), Number(payload.anio), payload.proyecto_id],
      );
      if (!cita) throw new ActionRejected({ status: "invalid", errors: { proyecto: "Debes seleccionar un proyecto válido de la lista." } });

      await addEvent(client, cita.id, `Cita manual registrada para el ${slotLabel(fecha, hora)}`, actor);
      return { status: "ok", message: `Cita manual registrada · Caso ${cita.caso} · ${slotLabel(fecha, hora)}` };
    }, { actor });
  } catch (error) {
    if (error instanceof ActionRejected) return error.result;
    if (error instanceof RegistrationRejected) {
      return { status: "conflict", message: "El carnet o el DUI ya pertenecen a otro estudiante." };
    }
    if (error?.code === PG_UNIQUE_VIOLATION) {
      switch (error.constraint) {
        case "citas_un_horario_ocupado":
          return { status: "invalid", errors: { hora: SLOT_TAKEN } };
        case "citas_una_abierta_por_estudiante":
          return { status: "conflict", message: "El estudiante ya tiene una solicitud o cita abierta: búscala por su carnet." };
        case "estudiantes_dui_hash_key":
        case "estudiantes_carnet_key":
          return { status: "conflict", message: "El carnet o el DUI ya pertenecen a otro estudiante." };
        default:
          break;
      }
    }
    throw error;
  }
}

/** Desactiva o reabre un día. Devuelve cuántas citas vigentes hay ese día (deben moverse a mano). */
export async function setDayBlocked(pool, fecha, bloqueado, { actor }) {
  return withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO dias_bloqueados (fecha, bloqueado) VALUES ($1, $2)
       ON CONFLICT (fecha) DO UPDATE SET bloqueado = EXCLUDED.bloqueado`,
      [fecha, bloqueado],
    );
    const { rows: [{ total }] } = await client.query(
      `SELECT count(*)::int AS total FROM citas
       WHERE estado NOT IN ('SOLICITADA', 'CANCELADA') AND asistencia = 'PENDIENTE'
         AND fecha_hora >= ($1::date::timestamp AT TIME ZONE ${TZ})
         AND fecha_hora < (($1::date + 1)::timestamp AT TIME ZONE ${TZ})`,
      [fecha],
    );
    return { citasEseDia: total };
  }, { actor });
}

/** Bandeja de salida para el panel (más recientes primero). */
export async function listEmails(db, limit = 100) {
  const { rows } = await db.query(
    `SELECT co.id, co.tipo::text AS tipo, co.destinatario, co.asunto, co.cuerpo, co.estado::text AS estado,
            co.intentos, co.ultimo_error,
            to_char(co.creado_en AT TIME ZONE ${TZ}, 'DD/MM/YYYY HH24:MI') AS cuando,
            'SS-' || to_char(c.creado_en AT TIME ZONE ${TZ}, 'YYYY') || '-' || lpad(c.id::text, 4, '0') AS caso
     FROM correos co JOIN citas c ON c.id = co.cita_id
     ORDER BY co.creado_en DESC, co.id DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
