import { searchAppointments } from "../../../../lib/db/agenda-repository.mjs";
import { getPool } from "../../../../lib/db/pool.mjs";
import { adminRoute, getCipher } from "../../../../lib/server/admin-route.mjs";
import { json } from "../../../../lib/server/http.mjs";

export const dynamic = "force-dynamic";

// GET /api/admin/buscar?q=… (caso, nombre, carnet o DUI)
export const GET = adminRoute(async (request) => {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  return json({ resultados: await searchAppointments(getPool(), getCipher(), query) });
});
