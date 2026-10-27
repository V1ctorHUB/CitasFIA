"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Formulario público" },
  { href: "/admin", label: "Administración" },
  { href: "/admin/dashboard", label: "Dashboard BI" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="topbar-nav">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={pathname === href ? "tab tab-on" : "tab"} aria-current={pathname === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
