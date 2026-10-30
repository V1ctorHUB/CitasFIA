import { createProjects, listProjectsForAdmin } from "../../../../lib/db/projects-repository.mjs";
import { cleanProject, MAX_IMPORT_ROWS, validateProject } from "../../../../lib/projects.mjs";
import { getPool } from "../../../../lib/db/pool.mjs";
import { adminRoute, readBody } from "../../../../lib/server/admin-route.mjs";
import { json } from "../../../../lib/server/http.mjs";

export const dynamic = "force-dynamic";

const PG_CHECK_VIOLATION = "23514";

// GET /api/admin/proyectos → todos los proyectos (activos e inactivos) con su número de citas
export const GET = adminRoute(async () => json({ proyectos: await listProjectsForAdmin(getPool()) }));

// POST /api/admin/proyectos { proyectos: [{ institucion, nombre, perfil, horario, responsable, responsable_correo, tipo_servicio, ubicacion }] } → uno (a mano) o varios (Excel)
export const POST = adminRoute(async (request, { session }) => {
  const body = await readBody(request, 1024 * 1024);
  const items = Array.isArray(body?.proyectos) ? body.proyectos : null;
  if (!items || items.length === 0 || items.length > MAX_IMPORT_ROWS) {
    return json({ error: `Envía entre 1 y ${MAX_IMPORT_ROWS} proyectos.` }, 400);
  }

  const proyectos = items.map(cleanProject);
  const errores = proyectos.map(validateProject);
  const invalido = errores.findIndex((errors) => Object.keys(errors).length > 0);
  if (invalido >= 0) return json({ error: `El proyecto ${invalido + 1} no es válido.`, errors: errores[invalido] }, 400);

  try {
    return json(await createProjects(getPool(), proyectos, { actor: session.usuario }));
  } catch (error) {
    // p. ej. un atributo de proyecto marcado como requerido que el alta rápida no incluye.
    if (error?.code === PG_CHECK_VIOLATION) {
      return json({ error: "La base de datos rechazó los proyectos: revisa los atributos requeridos de proyectos." }, 400);
    }
    throw error;
  }
});
