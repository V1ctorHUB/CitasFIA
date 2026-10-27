import { isValidIsoDate } from "../../../../lib/agenda.mjs";
import { setDayBlocked } from "../../../../lib/db/agenda-repository.mjs";
import { adminRoute, getPool, json, readBody } from "../../../../lib/server/admin-route.mjs";

export const dynamic = "force-dynamic";

// POST /api/admin/dias { fecha, bloqueado }
export const POST = adminRoute(async (request, { session }) => {
  const body = await readBody(request);
  if (!body || !isValidIsoDate(body.fecha) || typeof body.bloqueado !== "boolean") {
    return json({ error: "Solicitud inválida." }, 400);
  }
  return json(await setDayBlocked(getPool(), body.fecha, body.bloqueado, { actor: session.usuario }));
});
