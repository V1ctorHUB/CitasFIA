import { ACCIONES } from "../../../../../lib/agenda.mjs";
import { getHistory, performAction } from "../../../../../lib/db/agenda-repository.mjs";
import { actionResponse, adminRoute, deliverEmailsInBackground, getPool, json, readBody } from "../../../../../lib/server/admin-route.mjs";

export const dynamic = "force-dynamic";

async function citaId(params) {
  const { id } = await params;
  return /^\d{1,12}$/.test(id) ? id : null;
}

// GET /api/admin/citas/:id → historial
export const GET = adminRoute(async (request, { params }) => {
  const id = await citaId(params);
  if (!id) return json({ error: "La cita no existe." }, 404);
  return json({ historial: await getHistory(getPool(), id) });
});

// POST /api/admin/citas/:id { accion, fecha?, hora?, notificar? }
export const POST = adminRoute(async (request, { params, session }) => {
  const id = await citaId(params);
  const body = await readBody(request);
  if (!id) return json({ error: "La cita no existe." }, 404);
  if (!body || !ACCIONES.includes(body.accion)) return json({ error: "Acción inválida." }, 400);

  const result = await performAction(getPool(), {
    id,
    accion: body.accion,
    fecha: typeof body.fecha === "string" ? body.fecha : "",
    hora: typeof body.hora === "string" ? body.hora : "",
    notificar: body.notificar !== false,
  }, { actor: session.usuario });

  if (result.status === "ok") deliverEmailsInBackground();
  return actionResponse(result);
});
