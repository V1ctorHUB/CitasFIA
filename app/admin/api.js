"use client";

export const ORIGEN_LABEL = { FORMULARIO: "Formulario público", MANUAL: "Cita manual" };

/**
 * Llamada a /api/admin. Si la sesión expiró recarga la página para mostrar el acceso.
 * @returns {Promise<{ ok: boolean, data: any }>}
 */
export async function adminApi(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, data: { error: "No se pudo conectar con el servidor." } };
  }

  if (response.status === 401) {
    window.location.reload();
    return new Promise(() => {});
  }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

/** Primer mensaje legible de una respuesta de error. */
export function errorMessage(data) {
  return data?.error ?? Object.values(data?.errors ?? {}).find(Boolean) ?? "No se pudo completar la acción.";
}
