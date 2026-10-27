import { createDuiCipher } from "../../../lib/db/dui-crypto.mjs";
import { getPool } from "../../../lib/db/pool.mjs";
import { listActiveProjects } from "../../../lib/db/projects-repository.mjs";
import { createRegistration } from "../../../lib/db/registrations-repository.mjs";
import { clientKey, json } from "../../../lib/server/http.mjs";
import { createRateLimiter } from "../../../lib/server/rate-limit.mjs";
import { isSameOrigin, parseRegistrationRequest, readJsonBody } from "../../../lib/server/registration-request.mjs";

export const dynamic = "force-dynamic";

// Holgado a propósito: en el campus muchos estudiantes comparten la misma IP pública.
const rateLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });
let duiCipher;

// Mensaje genérico: no revela si un carnet o DUI ya existe (evita enumeración).
const CONFLICT_MESSAGE = "No fue posible registrar la solicitud con los datos proporcionados. "
  + "Si ya enviaste una solicitud, espera el correo de la coordinación.";

export async function POST(request) {
  if (!isSameOrigin(request, process.env.APP_ORIGIN)) {
    return json({ error: "Origen no permitido." }, 403);
  }

  const { allowed, retryAfterSeconds } = rateLimiter.consume(clientKey(request));
  if (!allowed) {
    return json({ error: "Demasiadas solicitudes. Intenta de nuevo más tarde." }, 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: "Solicitud inválida." }, body.status);

  try {
    duiCipher ??= createDuiCipher();
    const pool = getPool();
    const parsed = parseRegistrationRequest(body.body, await listActiveProjects(pool));
    if (!parsed.ok) return json({ errors: parsed.errors }, 400);

    const result = await createRegistration(pool, parsed.payload, {
      idempotencyKey: parsed.idempotencyKey,
      cipher: duiCipher,
    });

    switch (result.status) {
      case "created":
      case "replayed":
        return json({ ok: true }, 201);
      case "invalid-project":
        return json({ errors: { proyecto: "Debes seleccionar un proyecto válido de la lista." } }, 400);
      case "conflict":
        return json({ error: CONFLICT_MESSAGE }, 409);
      default:
        throw new Error(`Resultado de registro no manejado: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    // Nunca se registra el cuerpo: contiene DUI y datos personales.
    console.error("[api/citas] error al registrar:", error?.code ?? "", error?.message);
    return json({ error: "El servicio no está disponible. Intenta de nuevo en unos minutos." }, 503);
  }
}
