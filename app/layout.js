import "./globals.css";

export const metadata = {
  title: "Registro de Cita | Servicio Social UCA",
  description: "Registro y administración de citas de Servicio Social UCA.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
