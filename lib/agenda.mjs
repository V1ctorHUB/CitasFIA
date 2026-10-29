// Reglas de la agenda de coordinación, compartidas por el panel (cliente) y la API (servidor).

export const TIME_ZONE = "America/El_Salvador";

// Jornada UCA de 7:00 a 17:00 con almuerzo de 12:00 a 13:00: cada cita dura una hora, la última empieza a las 16:00.
export const HORAS = ["07:00", "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
export const ALMUERZO = { desde: "12:00", hasta: "13:00" };
export const CIERRE = "17:00";
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Estado visible en el panel = estado de la cita, o la asistencia cuando ya se registró.
// Sin miniportal: el estudiante responde el correo citando su caso y la coordinación marca "Confirmada".
export const ESTADOS = {
  PENDIENTE_CONFIRMACION: { label: "Asignada · correo enviado", bg: "#fff3d1", ink: "#4f3a00", dot: "#c98a00", border: "#f0d68f" },
  // Tinte del azul UCA: el relleno sólido queda reservado a la acción principal.
  CONFIRMADA: { label: "Confirmada", bg: "#e6ecf8", ink: "#0d2f6e", dot: "#123c8c", border: "#9db2dc" },
  ASISTIO: { label: "Asistió", bg: "#e2f3e8", ink: "#14532d", dot: "#1f8a4c", border: "#b9dcc6" },
  NO_ASISTIO: { label: "No asistió", bg: "#eceef2", ink: "#3f4757", dot: "#8a93a5", border: "#d5d9e1" },
};

export const ACCIONES = ["asignar", "mover", "confirmar", "asistio", "no_asistio", "reenviar", "cancelar"];

const pad = (n) => String(n).padStart(2, "0");

export function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Fecha de hoy (YYYY-MM-DD) en El Salvador, sin importar la zona horaria del equipo. */
export function todayInElSalvador(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoDate(parseIsoDate(value)) === value;
}

export function formatLongDate(iso) {
  if (!iso) return "";
  const date = parseIsoDate(iso);
  return `${DIAS[(date.getDay() + 6) % 7]} ${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

export function formatShortDate(iso) {
  return iso ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

/**
 * Regla de horario: día hábil, no pasado y hora del catálogo.
 * @returns {{ fecha?: string, hora?: string }} errores por campo (vacío si es válido)
 */
export function validateSlot({ fecha, hora }, today = todayInElSalvador()) {
  const errors = {};
  if (!isValidIsoDate(fecha)) {
    errors.fecha = "Indica la fecha de la cita.";
  } else {
    const dayOfWeek = parseIsoDate(fecha).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) errors.fecha = "Las citas se agendan de lunes a viernes.";
    else if (fecha < today) errors.fecha = "No se pueden agendar citas en fechas pasadas.";
  }
  if (!HORAS.includes(hora)) errors.hora = "Selecciona la hora.";
  return errors;
}

// Solo se mueven o reenvían citas aún por realizar.
export function isMovable(estado) {
  return estado === "PENDIENTE_CONFIRMACION" || estado === "CONFIRMADA";
}
