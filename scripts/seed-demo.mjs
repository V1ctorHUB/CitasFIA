// Datos de demostración para revisar el panel y el Dashboard BI en desarrollo. Nunca en producción.
// Uso: npm run db:seed-demo   (usa DATABASE_URL, DUI_ENCRYPTION_KEY y DUI_HASH_KEY de .env)
import { addDays, HORAS, isoDate, mondayOf } from "../lib/agenda.mjs";
import { performAction } from "../lib/db/agenda-repository.mjs";
import { createDuiCipher } from "../lib/db/dui-crypto.mjs";
import { getPool } from "../lib/db/pool.mjs";
import { createRegistration } from "../lib/db/registrations-repository.mjs";
import { buildAppointmentPayload, careers, createIdempotencyKey, GENDER_OPTIONS, proyectosData } from "../lib/registration-form.mjs";

if (process.env.NODE_ENV === "production") {
  console.error("seed-demo no se ejecuta en producción.");
  process.exit(1);
}

const NOMBRES = ["Ana", "Luis", "María", "José", "Sofía", "Carlos", "Valeria", "Diego", "Camila", "Andrés", "Gabriela", "Kevin", "Fátima", "Mario", "Daniela", "Ricardo"];
const APELLIDOS = ["López", "Hernández", "Martínez", "Rivas", "Flores", "Portillo", "Menjívar", "Guzmán", "Ayala", "Orellana", "Zelaya", "Castillo"];

let semilla = 7;
const azar = (n) => { semilla = (semilla * 9301 + 49297) % 233280; return Math.floor((semilla / 233280) * n); };
const verificador = (d8) => (10 - ([...d8].reduce((s, d, i) => s + Number(d) * (9 - i), 0) % 10)) % 10;

const pool = getPool();
const cipher = createDuiCipher();
const lunes = mondayOf(new Date());
const pasado = "2000-01-01"; // permite sembrar historial en fechas pasadas
let creadas = 0;

for (let i = 0; i < 48; i += 1) {
  const d8 = String(30000000 + i * 7919).slice(0, 8);
  const registration = {
    nombreCompleto: `${NOMBRES[azar(NOMBRES.length)]} ${APELLIDOS[azar(APELLIDOS.length)]} ${APELLIDOS[azar(APELLIDOS.length)]}`,
    carnet: String(900000 + i).padStart(8, "0"),
    dui: `${d8}-${verificador(d8)}`,
    telefono: `${[2, 6, 7][azar(3)]}${String(100 + azar(900))}-${String(1000 + azar(9000))}`,
    genero: GENDER_OPTIONS[[0, 0, 1, 1, 1, 2, 3][azar(7)]].value,
    carrera: careers[azar(careers.length)],
    ciclo: ["01", "02", "03"][azar(3)],
    anio: String(2026 + azar(3)),
  };
  const result = await createRegistration(pool, buildAppointmentPayload(registration, proyectosData[azar(proyectosData.length)]), {
    idempotencyKey: createIdempotencyKey(), cipher,
  });
  if (result.status !== "created") continue;
  creadas += 1;
  if (i >= 42) continue; // quedan en la bandeja

  const { rows: [{ id }] } = await pool.query("SELECT id FROM citas WHERE codigo = $1", [result.codigo]);
  const dia = addDays(lunes, -35 + Math.floor(i * 1.1));
  if (dia.getDay() === 0 || dia.getDay() === 6) continue;
  const opts = { actor: "seed-demo", today: pasado };
  const asignada = await performAction(pool, { id, accion: "asignar", fecha: isoDate(dia), hora: HORAS[azar(HORAS.length)] }, opts);
  if (asignada.status !== "ok") continue;
  const esPasada = dia < new Date();
  if (esPasada || azar(2)) await performAction(pool, { id, accion: "confirmar" }, opts);
  if (esPasada) await performAction(pool, { id, accion: azar(5) ? "asistio" : "no_asistio" }, opts);
}

console.log(`Solicitudes demo creadas: ${creadas}`);
await pool.end();
