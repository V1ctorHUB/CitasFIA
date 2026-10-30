import { deleteProject, setProjectActive, updateProject } from "../../../../../lib/db/projects-repository.mjs";
import { cleanProject, CONFIRMAR_ELIMINAR, validateProject } from "../../../../../lib/projects.mjs";
import { getPool } from "../../../../../lib/db/pool.mjs";
import { adminRoute, readBody } from "../../../../../lib/server/admin-route.mjs";
import { json } from "../../../../../lib/server/http.mjs";

export const dynamic = "force-dynamic";

const PG_UNIQUE_VIOLATION = "23505";
const PG_CHECK_VIOLATION = "23514";

async function proyectoId(params) {
  const { id } = await params;
  return /^\d{1,9}$/.test(id) ? id : null;
}

// POST /api/admin/proyectos/:id { institucion, nombre, perfil, horario, responsable, responsable_correo, tipo_servicio, ubicacion, activo }
export const POST = adminRoute(async (request, { params, session }) => {
  const id = await proyectoId(params);
  if (!id) return json({ error: "El proyecto no existe." }, 404);
  // "Asesoría General UCA" es el valor por defecto del formulario público.
  if (id === "0") return json({ error: "El proyecto por defecto no se edita." }, 400);

  const body = await readBody(request, 16 * 1024);
  if (!body || typeof body.activo !== "boolean") return json({ error: "Datos del proyecto inválidos." }, 400);
  const proyecto = { ...cleanProject(body), activo: body.activo };
  const errors = validateProject(proyecto);
  if (Object.keys(errors).length) return json({ error: "Revisa los campos marcados.", errors }, 400);

  try {
    const existe = await updateProject(getPool(), Number(id), proyecto, { actor: session.usuario });
    return existe ? json({ ok: true }) : json({ error: "El proyecto no existe." }, 404);
  } catch (error) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      return json({ error: "Revisa los campos marcados.", errors: { nombre: "Ya existe un proyecto con este nombre en esta contraparte." } }, 409);
    }
    if (error?.code === PG_CHECK_VIOLATION) return json({ error: "La base de datos rechazó los cambios del proyecto." }, 400);
    throw error;
  }
});

// PATCH /api/admin/proyectos/:id { activo } → solo lo muestra u oculta en el formulario, sin exigir el resto de datos.
export const PATCH = adminRoute(async (request, { params, session }) => {
  const id = await proyectoId(params);
  if (!id) return json({ error: "El proyecto no existe." }, 404);
  if (id === "0") return json({ error: "El proyecto por defecto siempre está activo." }, 400);
  const body = await readBody(request, 1024);
  if (typeof body?.activo !== "boolean") return json({ error: "Indica si el proyecto queda activo." }, 400);

  const existe = await setProjectActive(getPool(), Number(id), body.activo, { actor: session.usuario });
  return existe ? json({ ok: true }) : json({ error: "El proyecto no existe." }, 404);
});

// DELETE /api/admin/proyectos/:id { confirmar: "ELIMINAR" } → borra el proyecto y todo lo que depende de él.
export const DELETE = adminRoute(async (request, { params, session }) => {
  const id = await proyectoId(params);
  if (!id) return json({ error: "El proyecto no existe." }, 404);
  if (id === "0") return json({ error: "El proyecto por defecto no se elimina." }, 400);
  const body = await readBody(request, 1024);
  if (body?.confirmar !== CONFIRMAR_ELIMINAR) return json({ error: `Escribe ${CONFIRMAR_ELIMINAR} para confirmar.` }, 400);

  const resultado = await deleteProject(getPool(), Number(id), { actor: session.usuario });
  return resultado ? json(resultado) : json({ error: "El proyecto no existe." }, 404);
});
