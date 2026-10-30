"use client";

import { useEffect, useRef } from "react";

export function Modal({ labelledBy, onClose, maxWidth, role = "dialog", children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const origen = document.activeElement;
    // showModal deja inerte el resto de la página: Tab no puede salir del diálogo.
    dialog.showModal();
    dialog.focus();
    return () => {
      dialog.close();
      // Al cerrar, el foco vuelve a quien abrió el diálogo (si sigue en pantalla).
      if (origen?.isConnected) origen.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className="overlay"
      role={role === "dialog" ? undefined : role}
      aria-labelledby={labelledBy}
      // Escape: el estado de React decide el cierre, no el navegador.
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}
    >
      <div className="dialog" style={{ maxWidth }}>
        {children}
      </div>
    </dialog>
  );
}

export function CloseButton({ onClick }) {
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={onClick} aria-label="Cerrar">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
}
