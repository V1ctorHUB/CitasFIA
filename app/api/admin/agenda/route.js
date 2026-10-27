import { isValidIsoDate } from "../../../../lib/agenda.mjs";
import { listAgenda } from "../../../../lib/db/agenda-repository.mjs";
import { getPool } from "../../../../lib/db/pool.mjs";
import { adminRoute, getCipher } from "../../../../lib/server/admin-route.mjs";
import { json } from "../../../../lib/server/http.mjs";

export const dynamic = "force-dynamic";

// GET /api/admin/agenda?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (ambos opcionales)
export const GET = adminRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") || "";
  const hasta = searchParams.get("hasta") || "";
  if ((desde && !isValidIsoDate(desde)) || (hasta && !isValidIsoDate(hasta))) {
    return json({ error: "Rango de fechas inválido." }, 400);
  }
  return json(await listAgenda(getPool(), getCipher(), { desde, hasta }));
});
