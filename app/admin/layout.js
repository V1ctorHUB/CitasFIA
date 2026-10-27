import Image from "next/image";
import { getAdminSession } from "../../lib/server/admin-route.mjs";
import AdminLogin from "./AdminLogin";
import AdminNav from "./AdminNav";
import LogoutButton from "./LogoutButton";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coordinación | Servicio Social UCA", robots: { index: false } };

export default async function AdminLayout({ children }) {
  const session = await getAdminSession();

  return (
    <div className="admin-app">
      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <Image src="/Logo_UCA_2015.jpg" alt="Universidad Centroamericana José Simeón Cañas" width={30} height={41} />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
              <strong style={{ fontSize: 15 }}>Servicio Social · UCA</strong>
              <span className="muted" style={{ fontSize: 12 }}>Sistema de citas</span>
            </div>
          </div>
          <AdminNav />
          {session && (
            <div className="topbar-user">
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{session.nombre}</span>
                <span className="muted" style={{ fontSize: 12 }}>Coordinación</span>
              </div>
              <LogoutButton />
            </div>
          )}
        </div>
      </header>
      {session ? children : <AdminLogin />}
    </div>
  );
}
