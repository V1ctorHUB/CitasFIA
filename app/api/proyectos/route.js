import { NextResponse } from "next/server";
import { proyectosData } from "../../../lib/registration-form.mjs";

// Catálogo público y de solo lectura: no expone datos personales.
export async function GET() {
  return NextResponse.json(proyectosData, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
