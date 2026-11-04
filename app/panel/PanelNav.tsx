"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";

const usuariosIcon = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M17 8v6M14 11h6" strokeLinecap="round" />
  </>
);

const panelIcon = (
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>
);
const sociosIcon = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 20a6.4 6.4 0 0 0-2-4.7" strokeLinecap="round" />
  </>
);
const metricasIcon = (
  <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" />
);
const planesIcon = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3 10h18M8 15h4" strokeLinecap="round" />
  </>
);
const cajaIcon = (
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M3 11h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" />
    <circle cx="12" cy="15" r="1.8" />
  </>
);
const qrIcon = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3M20 17v4h-6" strokeLinecap="round" />
  </>
);
const cumpleañosIcon = (
  <>
    <path d="M12 2.5c-1 1.3-1 2.2 0 3.2M8.5 3.5c-.8 1-.8 1.8 0 2.6M15.5 3.5c-.8 1-.8 1.8 0 2.6" strokeLinecap="round" />
    <path d="M5 11a2 2 0 0 1 2-2c.6 0 1 .3 1.5.8.5-.5.9-.8 1.5-.8s1 .3 1.5.8c.5-.5.9-.8 1.5-.8s1 .3 1.5.8c.5-.5.9-.8 1.5-.8a2 2 0 0 1 2 2v3H5v-3Z" />
    <path d="M4 21v-5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V21M4 18h16" strokeLinecap="round" />
  </>
);

type NavLink = { href: string; label: string; icon: React.ReactNode };

/** Planes (precios) y Usuarios quedan afuera para profesor. El resto es
 *  igual para los tres roles. */
function visibleLinks(role: AdminRole | null | undefined): NavLink[] {
  const links: NavLink[] = [
    { href: "/panel", label: "Panel", icon: panelIcon },
    { href: "/panel/socios", label: "Socios", icon: sociosIcon },
    { href: "/panel/cumpleanos", label: "Cumpleaños", icon: cumpleañosIcon },
    { href: "/panel/metricas", label: "Métricas", icon: metricasIcon },
  ];
  if (role !== "profesor") links.push({ href: "/panel/planes", label: "Planes", icon: planesIcon });
  links.push({ href: "/panel/caja", label: "Caja", icon: cajaIcon });
  links.push({ href: "/panel/acceso", label: "QR", icon: qrIcon });
  if (isManagerRole(role)) {
    links.push({ href: "/panel/usuarios", label: "Usuarios", icon: usuariosIcon });
  }
  return links;
}

function isActive(pathname: string, href: string) {
  return href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);
}

/**
 * "sidebar": columna vertical fija a la izquierda en desktop.
 * "mobile": franja horizontal arriba, debajo del header.
 * En los dos, cada pantalla es su propio link — "Socios" lleva directo a la
 * lista de socios, sin desplegables intermedios.
 */
export function PanelNav({
  variant,
  role,
}: {
  variant: "sidebar" | "mobile";
  role?: AdminRole | null;
}) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {visibleLinks(role).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-3 rounded-control px-3.5 py-2.5 text-base font-medium",
                "transition-colors duration-150",
                active
                  ? "bg-plate-blue/15 text-txt-onDark"
                  : "text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised/60",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 24 24"
                className={`size-[18px] shrink-0 ${active ? "text-plate-blue" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              {item.label}
              {active && (
                <span
                  className="ml-auto size-1.5 rounded-full bg-plate-blue shrink-0"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="md:hidden overflow-x-auto border-t border-ink-raised/60">
      <div className="flex gap-1 px-2.5 py-1.5 min-w-max">
        {visibleLinks(role).map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-1.5 shrink-0 rounded-control px-3 py-1.5",
                "text-tiny font-medium transition-colors",
                active
                  ? "bg-ink-raised text-txt-onDark"
                  : "text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised/60",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                {l.icon}
              </svg>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
