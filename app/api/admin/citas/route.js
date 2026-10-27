import { createManualAppointment } from "../../../../lib/db/agenda-repository.mjs";
import { listActiveProjects } from "../../../../lib/db/projects-repository.mjs";
import { getPool } from "../../../../lib/db/pool.mjs";
import { actionResponse, adminRoute, getCipher, readBody } from "../../../../lib/server/admin-route.mjs";
import { json } from "../../../../lib/server/http.mjs";
import { parseRegistrationRequest } from "../../../../lib/server/registration-request.mjs";

export const dynamic = "force-dynamic";

// POST /api/admin/citas: cita manual { registro, proyecto_id, clave_idempotencia, fecha, hora }
export const POST = adminRoute(async (request, { session }) => {
  const body = await readBody(request);
  if (!body) return json({ error: "Solicitud inválida." }, 400);

  const pool = getPool();
  const parsed = parseRegistrationRequest(body, await listActiveProjects(pool));
  if (!parsed.ok) return json({ errors: parsed.errors }, 400);

  const result = await createManualAppointment(pool, parsed.payload, { fecha: body.fecha, hora: body.hora }, {
    cipher: getCipher(),
    actor: session.usuario,
  });
  return actionResponse(result);
});
