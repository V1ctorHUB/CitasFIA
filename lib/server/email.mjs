import nodemailer from "nodemailer";
import { formatLongDate } from "../agenda.mjs";

/**
 * Correos a estudiantes con patrón "bandeja de salida": cada acción de la coordinación guarda el correo
 * en la tabla `correos` dentro de la MISMA transacción que el cambio de la cita (nunca se pierde ni se
 * envía uno de una acción que falló). Después, deliverPendingEmails los entrega con el transporte configurado.
 */

/**
 * @param {"ASIGNACION" | "REPROGRAMACION" | "RECORDATORIO" | "CANCELACION"} tipo
 * @param {{ caso: string, nombreCompleto: string, fecha: string, hora: string }} cita
 * @returns {{ asunto: string, cuerpo: string }}
 */
export function renderEmail(tipo, { caso, nombreCompleto, fecha, hora }) {
  const cuando = `${formatLongDate(fecha)} a las ${hora} h`;
  const plantillas = {
    ASIGNACION: [
      `Cita de servicio social asignada · Caso ${caso}`,
      `Hola, ${nombreCompleto}. La Coordinación de Servicio Social te asignó cita para el ${cuando}. Responde este correo citando el caso ${caso} para confirmar tu asistencia o proponer otro horario.`,
    ],
    REPROGRAMACION: [
      `Nuevo horario para tu cita · Caso ${caso}`,
      `Hola, ${nombreCompleto}. Tu cita de servicio social se movió al ${cuando}. Responde este correo citando el caso ${caso} para confirmar o proponer otro horario.`,
    ],
    RECORDATORIO: [
      `Tu cita de servicio social · Caso ${caso}`,
      `Hola, ${nombreCompleto}. Te recordamos tu cita del ${cuando}. Responde este correo citando el caso ${caso} si necesitas cambiarla.`,
    ],
    CANCELACION: [
      `Cita cancelada · Caso ${caso}`,
      `Hola, ${nombreCompleto}. Tu cita del ${cuando} fue cancelada por la Coordinación de Servicio Social. Si necesitas una nueva cita, registra otra solicitud en el formulario.`,
    ],
  };
  const plantilla = plantillas[tipo];
  if (!plantilla) throw new RangeError(`Tipo de correo desconocido: ${tipo}`);
  return { asunto: plantilla[0], cuerpo: plantilla[1] };
}

const REMITENTE = "Coordinación de Servicio Social UCA";

/**
 * Transporte de correo (SMTP de cualquier proveedor: Gmail, Outlook, Brevo, Resend, Zoho…):
 *   SMTP_HOST + SMTP_USUARIO + SMTP_CLAVE → envía por ese servidor. SMTP_PUERTO por defecto 587
 *                                         (STARTTLS); 465 usa TLS directo. SMTP_REMITENTE es la dirección
 *                                         "De:" cuando difiere del usuario (Brevo, Resend); si no, el usuario.
 *   EMAIL_TRANSPORT=consola               → solo desarrollo: imprime destinatario y asunto.
 *   nada                                  → null: los correos quedan pendientes y se envían al configurarlo.
 * @returns {{ send: (correo: { destinatario: string, asunto: string, cuerpo: string }) => Promise<void> } | null}
 */
export function getEmailTransport(env = process.env) {
  if (env.EMAIL_TRANSPORT === "consola") {
    return {
      async send({ destinatario, asunto }) {
        console.info(`[correo] → ${destinatario}: ${asunto}`);
      },
    };
  }
  if (env.SMTP_HOST && env.SMTP_USUARIO && env.SMTP_CLAVE) return createSmtpTransport(env);
  return null;
}

let smtpTransport;

function createSmtpTransport(env) {
  const host = env.SMTP_HOST.trim();
  const port = Number(env.SMTP_PUERTO) || 587;
  const usuario = env.SMTP_USUARIO.trim();
  const remitente = env.SMTP_REMITENTE?.trim() || usuario;
  const key = `${host}|${port}|${usuario}`;

  if (smtpTransport?.key !== key) {
    smtpTransport = {
      key,
      mailer: nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: usuario, pass: env.SMTP_CLAVE },
      }),
    };
  }

  return {
    async send({ destinatario, asunto, cuerpo }) {
      // La mayoría de proveedores rechaza un remitente que no sea la cuenta o un dominio verificado.
      await smtpTransport.mailer.sendMail({
        from: { name: REMITENTE, address: remitente },
        to: destinatario,
        subject: asunto,
        text: cuerpo,
      });
    },
  };
}

const MAX_ATTEMPTS = 5;

/**
 * Entrega los correos pendientes. Una transacción por correo: el bloqueo dura solo un envío y
 * SKIP LOCKED permite ejecutarlo en paralelo y tras cada acción sin enviar dos veces.
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ enviados: number, fallidos: number, sinTransporte: boolean }>}
 */
export async function deliverPendingEmails(pool, transport = getEmailTransport(), batchSize = 20) {
  if (!transport) return { enviados: 0, fallidos: 0, sinTransporte: true };

  let enviados = 0;
  let fallidos = 0;
  for (let i = 0; i < batchSize; i += 1) {
    const result = await deliverOne(pool, transport);
    if (result === "vacio") break;
    if (result === "enviado") enviados += 1;
    else fallidos += 1;
  }
  return { enviados, fallidos, sinTransporte: false };
}

async function deliverOne(pool, transport) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [correo] } = await client.query(
      `SELECT id, destinatario, asunto, cuerpo FROM correos
       WHERE estado = 'PENDIENTE'
          OR (estado = 'ERROR' AND intentos < $1 AND actualizado_en < now() - interval '5 minutes')
       ORDER BY creado_en LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS],
    );
    if (!correo) {
      await client.query("COMMIT");
      return "vacio";
    }

    let status = "enviado";
    try {
      await transport.send(correo);
      await client.query("UPDATE correos SET estado = 'ENVIADO', enviado_en = now(), intentos = intentos + 1 WHERE id = $1", [correo.id]);
    } catch (error) {
      status = "fallido";
      await client.query(
        "UPDATE correos SET estado = 'ERROR', intentos = intentos + 1, ultimo_error = left($2, 500) WHERE id = $1",
        [correo.id, String(error?.message ?? error)],
      );
    }
    await client.query("COMMIT");
    return status;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
