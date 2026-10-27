"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/sesion", { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Cerrar sesión</button>;
}
