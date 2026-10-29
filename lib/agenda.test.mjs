import test from "node:test";
import assert from "node:assert/strict";
import { formatLongDate, isMovable, isValidIsoDate, mondayOf, todayInElSalvador, validateSlot } from "./agenda.mjs";

test("el horario exige día hábil, fecha no pasada y hora del catálogo", () => {
  const hoy = "2026-10-26"; // lunes
  assert.deepEqual(validateSlot({ fecha: "2026-10-27", hora: "09:00" }, hoy), {});
  assert.deepEqual(validateSlot({ fecha: hoy, hora: "16:00" }, hoy), {});
  assert.match(validateSlot({ fecha: "2026-10-31", hora: "09:00" }, hoy).fecha, /lunes a viernes/);
  assert.match(validateSlot({ fecha: "2026-10-23", hora: "09:00" }, hoy).fecha, /pasadas/);
  assert.deepEqual(validateSlot({ fecha: "2026-10-27", hora: "07:00" }, hoy), {});
  assert.ok(validateSlot({ fecha: "2026-10-27", hora: "12:00" }, hoy).hora); // almuerzo
  assert.ok(validateSlot({ fecha: "2026-10-27", hora: "17:00" }, hoy).hora);
  assert.ok(validateSlot({ fecha: "2026-10-27", hora: "06:00" }, hoy).hora);
  assert.ok(validateSlot({ fecha: "2026-02-30", hora: "09:00" }, hoy).fecha);
  assert.ok(validateSlot({}, hoy).fecha);
});

test("las fechas se validan y formatean sin depender de la zona horaria", () => {
  assert.equal(isValidIsoDate("2026-10-26"), true);
  assert.equal(isValidIsoDate("2026-13-01"), false);
  assert.equal(isValidIsoDate("26/10/2026"), false);
  assert.equal(formatLongDate("2026-10-26"), "Lunes 26 de octubre de 2026");
  assert.equal(mondayOf(new Date(2026, 10, 1)).getDate(), 26);
  // 2026-10-27 03:00 UTC aún es 26 de octubre en El Salvador (UTC-6).
  assert.equal(todayInElSalvador(new Date("2026-10-27T03:00:00Z")), "2026-10-26");
});

test("solo las citas por realizar se pueden mover o reenviar", () => {
  assert.equal(isMovable("PENDIENTE_CONFIRMACION"), true);
  assert.equal(isMovable("CONFIRMADA"), true);
  assert.equal(isMovable("ASISTIO"), false);
  assert.equal(isMovable("NO_ASISTIO"), false);
});
