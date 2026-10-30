import { adminRoute } from "../../../../../lib/server/admin-route.mjs";
import { plantillaProyectos } from "../../../../../lib/server/plantilla-proyectos.mjs";

export const dynamic = "force-dynamic";

// GET /api/admin/proyectos/plantilla → plantilla .xlsx para importar proyectos (se arma al pedirla; el repo no guarda documentos).
export const GET = adminRoute(async () => new Response(plantillaProyectos(), {
  headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="plantilla-proyectos.xlsx"',
    "Cache-Control": "no-store",
  },
}));
