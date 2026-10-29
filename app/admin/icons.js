// Íconos de trazo, mismo grosor que la lupa del buscador de la agenda.
const trazo = { "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconoMas = () => <svg {...trazo}><path d="M12 5v14M5 12h14" /></svg>;
export const IconoCheck = () => <svg {...trazo}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
