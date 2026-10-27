"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(event) {
    event.preventDefault();
    if (!usuario.trim() || !clave) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/admin/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    }).catch(() => null);
    setIsSubmitting(false);

    if (response?.ok) {
      setClave("");
      router.refresh();
      return;
    }
    const data = await response?.json().catch(() => null);
    setError(data?.error ?? "No se pudo conectar con el servidor.");
  }

  return (
    <main style={{ flex: 1, padding: "64px 16px", display: "flex", justifyContent: "center" }}>
      <form className="panel login-card" noValidate onSubmit={login}>
        <Image src="/Logo_UCA_2015.jpg" alt="Universidad Centroamericana José Simeón Cañas" width={52} height={71} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="eyebrow">Aplicación de administración</p>
          <h1 style={{ fontSize: 24, letterSpacing: "-0.02em" }}>Acceso de coordinación</h1>
          <p className="muted" style={{ fontSize: 14 }}>Solo para la Coordinación de Servicio Social.</p>
        </div>
        <div className="field">
          <label htmlFor="usuario">Usuario</label>
          <input id="usuario" type="text" value={usuario} onChange={(event) => { setUsuario(event.target.value); setError(""); }} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" value={clave} onChange={(event) => { setClave(event.target.value); setError(""); }} autoComplete="current-password" />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ minHeight: 46 }} disabled={isSubmitting}>
          {isSubmitting ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
