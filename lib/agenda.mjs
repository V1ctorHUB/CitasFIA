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
// Sus colores están en admin.css (.estado-*).
export const ESTADOS = {
  PENDIENTE_CONFIRMACION: "Asignada · correo enviado",
  CONFIRMADA: "Confirmada",
  ASISTIO: "Asistió",
  NO_ASISTIO: "No asistió",
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

export function esDiaHabil(iso) {
  const dia = parseIsoDate(iso).getDay();
  return dia !== 0 && dia !== 6;
}

/** El mes (AAAA-MM) en semanas de lunes a viernes, como la agenda. */
export function semanasHabiles(mes) {
  const semanas = [];
  // +2 días: si el 1 cae en sábado o domingo, la primera semana es la del lunes siguiente.
  for (let lunes = mondayOf(addDays(parseIsoDate(`${mes}-01`), 2)); isoDate(lunes).slice(0, 7) <= mes; lunes = addDays(lunes, 7)) {
    semanas.push([0, 1, 2, 3, 4].map((i) => isoDate(addDays(lunes, i))));
  }
  return semanas;
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
    if (!esDiaHabil(fecha)) errors.fecha = "Las citas se agendan de lunes a viernes.";
    else if (fecha < today) errors.fecha = "No se pueden agendar citas en fechas pasadas.";
  }
  if (!HORAS.includes(hora)) errors.hora = "Selecciona la hora.";
  return errors;
}

// Solo se mueven o reenvían citas aún por realizar.
export function isMovable(estado) {
  return estado === "PENDIENTE_CONFIRMACION" || estado === "CONFIRMADA";
}
