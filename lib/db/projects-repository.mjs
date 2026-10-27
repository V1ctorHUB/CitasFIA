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
