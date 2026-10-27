import { searchAppointments } from "../../../../lib/db/agenda-repository.mjs";
import { adminRoute, getCipher, getPool, json } from "../../../../lib/server/admin-route.mjs";

export const dynamic = "force-dynamic";

// GET /api/admin/buscar?q=… (caso, nombre, carnet o DUI)
export const GET = adminRoute(async (request) => {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  return json({ resultados: await searchAppointments(getPool(), getCipher(), query) });
});
