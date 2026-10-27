import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };

/** Respuesta JSON que nunca se guarda en caché (puede contener datos personales). */
export function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

// Detrás de Caddy/Nginx la IP real llega en X-Forwarded-For; el proxy debe sobrescribirla.
export function clientKey(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "sin-ip";
}
