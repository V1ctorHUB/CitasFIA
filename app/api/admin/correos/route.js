import { listEmails } from "../../../../lib/db/agenda-repository.mjs";
import { adminRoute, getPool, json } from "../../../../lib/server/admin-route.mjs";
import { deliverPendingEmails, getEmailTransport } from "../../../../lib/server/email.mjs";

export const dynamic = "force-dynamic";

// GET /api/admin/correos → bandeja de salida
export const GET = adminRoute(async () => json({
  correos: await listEmails(getPool()),
  transporteConfigurado: getEmailTransport() !== null,
}));

// POST /api/admin/correos → entregar ahora los pendientes
export const POST = adminRoute(async () => json(await deliverPendingEmails(getPool())));
