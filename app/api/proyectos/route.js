import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db/pool.mjs";
import { listActiveProjects } from "../../../lib/db/projects-repository.mjs";

export const dynamic = "force-dynamic";

// Catálogo público y de solo lectura: no expone datos personales.
// Si la base no responde, el cliente usa su catálogo local (inicializarProyectos).
export async function GET() {
  try {
    // Sin caché: si la coordinación oculta o vuelve a mostrar un proyecto, el formulario lo refleja al recargar.
    return NextResponse.json(await listActiveProjects(getPool()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/proyectos] error al leer catálogo:", error?.code ?? "", error?.message);
    return NextResponse.json({ error: "Catálogo no disponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
