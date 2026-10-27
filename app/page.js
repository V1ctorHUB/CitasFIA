"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import RegistrationForm from "./components/RegistrationForm";
import {
  confirmationSuccessMessage,
  createIdempotencyKey,
  enviarSolicitud,
  submissionConfirmationDurationMs,
} from "../lib/registration-form.mjs";

export default function Home() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Se conserva entre reintentos del mismo formulario: el servidor no duplica la solicitud.
  const idempotencyKey = useRef("");

  useEffect(() => {
    if (!isSubmitted) return undefined;

    const timeoutId = window.setTimeout(() => setIsSubmitted(false), submissionConfirmationDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [isSubmitted]);

  async function submitRegistration(registration, project) {
    idempotencyKey.current ||= createIdempotencyKey();
    const result = await enviarSolicitud(registration, project, idempotencyKey.current);

    if (result.status === "ok") {
      idempotencyKey.current = "";
      setIsSubmitted(true);
    }
    return result;
  }

  return (
    <main className="page-shell">
      <section className="registration-card" aria-labelledby="form-title">
        <header className="brand-header">
          <Image
            src="/Logo_UCA_2015.jpg"
            alt="Universidad Centroamericana José Simeón Cañas"
            width={96}
            height={131}
            priority
          />
          <div>
            <p className="eyebrow">Servicio Social UCA</p>
            <h1 id="form-title">Registro de citas</h1>
          </div>
        </header>

        {isSubmitted && (
          <p className="success-message" role="status">
            {confirmationSuccessMessage}
          </p>
        )}

        <RegistrationForm onSubmit={submitRegistration} onEdit={() => setIsSubmitted(false)} />
      </section>
    </main>
  );
}
