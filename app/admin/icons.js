// Íconos de trazo, mismo grosor que la lupa del buscador de la agenda.
const trazo = { "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconoMas = () => <svg {...trazo}><path d="M12 5v14M5 12h14" /></svg>;
export const IconoCheck = () => <svg {...trazo}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IconoDescargar = () => <svg {...trazo}><path d="M12 4v11M7 10.5 12 15.5l5-5M5 20h14" /></svg>;
export const IconoCalendario = () => <svg {...trazo}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
export const IconoChevron = ({ direccion }) => <svg {...trazo}><path d={direccion === "izquierda" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"} /></svg>;
