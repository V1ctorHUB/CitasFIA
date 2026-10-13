export function errorId(fieldName) {
  return `${fieldName}-error`;
}

// Atributos de accesibilidad y estilo comunes a cualquier control con posible error.
export function errorProps(fieldName, message, fallbackDescribedBy) {
  return {
    "aria-invalid": Boolean(message),
    "aria-describedby": message ? errorId(fieldName) : fallbackDescribedBy,
    className: message ? "input-error" : undefined,
  };
}

export default function FieldError({ fieldName, message }) {
  if (!message) return null;

  return (
    <p id={errorId(fieldName)} className="field-error" role="alert">
      {message}
    </p>
  );
}
