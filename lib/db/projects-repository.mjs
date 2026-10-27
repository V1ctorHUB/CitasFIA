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
    SELECT p.id, p.nombre, i.nombre AS institucion, p.activo,
           (SELECT count(*)::int FROM citas c WHERE c.proyecto_id = p.id) AS citas
    FROM proyectos p
    JOIN instituciones i ON i.id = p.institucion_id
    ORDER BY p.id = 0 DESC, p.creado_en DESC, p.id DESC`);
  return rows;
}

/**
 * Da de alta varios proyectos en una sola transacción (todo o nada). La institución se reutiliza si ya
 * existe con el mismo nombre normalizado; un proyecto ya existente se omite y se informa.
 * @param {import("pg").Pool} pool
 * @param {{ nombre: string, institucion: string }[]} proyectos validados con validateProject
 * @returns {Promise<{ creados: number, existentes: string[] }>}
 */
export async function createProjects(pool, proyectos, { actor }) {
  return withTransaction(pool, async (client) => {
    let creados = 0;
    const existentes = [];
    for (const { nombre, institucion } of proyectos) {
      const { rows: [{ id: institucionId }] } = await client.query(
        `WITH nueva AS (
           INSERT INTO instituciones (nombre) VALUES ($1)
           ON CONFLICT (nombre_normalizado) DO NOTHING
           RETURNING id
         )
         SELECT id FROM nueva
         UNION ALL
         SELECT id FROM instituciones WHERE nombre_normalizado = normalizar_texto($1)
         LIMIT 1`,
        [institucion],
      );
      const { rowCount } = await client.query(
        "INSERT INTO proyectos (nombre, institucion_id) VALUES ($1, $2) ON CONFLICT (nombre_normalizado) DO NOTHING",
        [nombre, institucionId],
      );
      if (rowCount) creados += 1;
      else existentes.push(nombre);
    }
    return { creados, existentes };
  }, { actor });
}
