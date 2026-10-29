"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Agenda" },
  { href: "/admin/proyectos", label: "Proyectos" },
  { href: "/admin/dashboard", label: "Informe" },
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
