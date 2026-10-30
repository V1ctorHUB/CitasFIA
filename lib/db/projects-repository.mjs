import { withTransaction } from "./pool.mjs";


/**
 * @typedef {{ id: number, nombre: string, institucion: string }} PublicProject
 * @typedef {{ query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }} Queryable
 */

/**
 * Catálogo público: solo id, nombre e institución de proyectos activos ("Asesoría General UCA" primero).
 * @param {Queryable} db
 * @returns {Promise<PublicProject[]>}
 */
export async function listActiveProjects(db) {
  const { rows } = await db.query(`
    SELECT p.id, p.nombre, i.nombre AS institucion
    FROM proyectos p
    JOIN instituciones i ON i.id = p.institucion_id
    WHERE p.activo
    ORDER BY p.id = 0 DESC, p.nombre_normalizado`);
  return rows;
}

/**
 * Proyectos para el panel de coordinación, con cuántas citas tiene cada uno.
 * @param {Queryable} db
 */
export async function listProjectsForAdmin(db) {
  const { rows } = await db.query(`
    SELECT p.id, p.nombre, i.nombre AS institucion, p.perfil, p.horario, p.responsable, p.responsable_correo,
           p.tipo_servicio, p.ubicacion, p.activo,
           (SELECT count(*)::int FROM citas c WHERE c.proyecto_id = p.id) AS citas
    FROM proyectos p
    JOIN instituciones i ON i.id = p.institucion_id
    ORDER BY p.id = 0 DESC, p.creado_en DESC, p.id DESC`);
  return rows;
}

/** Id de la institución (contraparte) con ese nombre normalizado; la crea si no existe. */
async function idInstitucion(client, nombre) {
  const { rows: [{ id }] } = await client.query(
    `WITH nueva AS (
       INSERT INTO instituciones (nombre) VALUES ($1)
       ON CONFLICT (nombre_normalizado) DO NOTHING
       RETURNING id
     )
     SELECT id FROM nueva
     UNION ALL
     SELECT id FROM instituciones WHERE nombre_normalizado = normalizar_texto($1)
     LIMIT 1`,
    [nombre],
  );
  return id;
}

/**
 * Da de alta varios proyectos en una sola transacción (todo o nada). La institución (contraparte) se reutiliza
 * si ya existe con el mismo nombre normalizado; un proyecto ya existente en esa institución se omite y se informa.
 * @param {import("pg").Pool} pool
 * @param {ReturnType<typeof import("../projects.mjs").cleanProject>[]} proyectos validados con validateProject
 * @returns {Promise<{ creados: number, existentes: string[] }>}
 */
export async function createProjects(pool, proyectos, { actor }) {
  return withTransaction(pool, async (client) => {
    let creados = 0;
    const existentes = [];
    for (const { nombre, institucion, perfil, horario, responsable, responsable_correo, tipo_servicio, ubicacion } of proyectos) {
      const institucionId = await idInstitucion(client, institucion);
      const { rowCount } = await client.query(
        `INSERT INTO proyectos (nombre, institucion_id, perfil, horario, responsable, responsable_correo, tipo_servicio, ubicacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (institucion_id, nombre_normalizado) DO NOTHING`,
        [nombre, institucionId, perfil, horario, responsable, responsable_correo || null, tipo_servicio, ubicacion],
      );
      if (rowCount) creados += 1;
      else existentes.push(`${nombre} (${institucion})`);
    }
    return { creados, existentes };
  }, { actor });
}

/**
 * Edita un proyecto (todos sus campos y si está activo). Las citas ya registradas guardan su propia copia del
 * nombre y la institución, así que el historial no cambia. Un nombre repetido en la contraparte lanza 23505.
 * @returns {Promise<boolean>} false si el proyecto no existe
 */
export async function updateProject(pool, id, proyecto, { actor }) {
  const { nombre, institucion, perfil, horario, responsable, responsable_correo, tipo_servicio, ubicacion, activo } = proyecto;
  return withTransaction(pool, async (client) => {
    const institucionId = await idInstitucion(client, institucion);
    const { rowCount } = await client.query(
      `UPDATE proyectos
       SET nombre = $2, institucion_id = $3, perfil = $4, horario = $5, responsable = $6,
           responsable_correo = $7, tipo_servicio = $8, ubicacion = $9, activo = $10
       WHERE id = $1`,
      [id, nombre, institucionId, perfil, horario, responsable, responsable_correo || null, tipo_servicio, ubicacion, activo],
    );
    return rowCount > 0;
  }, { actor });
}

/**
 * Solo activa o desactiva un proyecto, sin tocar ni exigir el resto de sus datos (sirve para proyectos antiguos).
 * @returns {Promise<boolean>} false si el proyecto no existe
 */
export async function setProjectActive(pool, id, activo, { actor }) {
  return withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("UPDATE proyectos SET activo = $2 WHERE id = $1", [id, activo]);
    return rowCount > 0;
  }, { actor });
}

/**
 * Elimina para siempre un proyecto y todo lo que depende de él (función eliminar_proyecto, migración 0007).
 * @returns {Promise<{ citas: number, estudiantes: number, institucion: boolean } | null>} null si no existe
 */
export async function deleteProject(pool, id, { actor }) {
  return withTransaction(pool, async (client) => {
    const { rows: [{ resultado }] } = await client.query("SELECT eliminar_proyecto($1) AS resultado", [id]);
    return resultado;
  }, { actor });
}
