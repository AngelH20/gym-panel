"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Lista plana: la usa el nav horizontal del celular, donde no hay lugar
 *  para desplegables — cada pantalla es su propio botón. */
const links = [
  {
    href: "/panel",
    label: "Panel",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
  },
  {
    href: "/panel/socios",
    label: "Socios",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
        <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 20a6.4 6.4 0 0 0-2-4.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/panel/metricas",
    label: "Métricas",
    icon: (
      <>
        <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    href: "/panel/planes",
    label: "Planes",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3 10h18M8 15h4" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/panel/caja",
    label: "Caja",
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M3 11h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" />
        <circle cx="12" cy="15" r="1.8" />
      </>
    ),
  },
  {
    href: "/panel/acceso",
    label: "QR",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h3v3M20 17v4h-6" strokeLinecap="round" />
      </>
    ),
  },
];

const sociosIcon = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 20a6.4 6.4 0 0 0-2-4.7" strokeLinecap="round" />
  </>
);

/** Estructura con grupos: la usa el sidebar de escritorio, donde sí hay
 *  lugar para desplegar "Socios" en sus sub-pantallas. */
type SidebarItem =
  | { type: "link"; href: string; label: string; icon: React.ReactNode }
  | {
      type: "group";
      label: string;
      icon: React.ReactNode;
      children: { href: string; label: string }[];
    };

const sidebarItems: SidebarItem[] = [
  { type: "link", href: "/panel", label: "Panel", icon: links[0].icon },
  {
    type: "group",
    label: "Socios",
    icon: sociosIcon,
    children: [
      { href: "/panel/socios", label: "Lista de socios" },
      { href: "/panel/metricas", label: "Métricas" },
    ],
  },
  { type: "link", href: "/panel/planes", label: "Planes", icon: links[3].icon },
  { type: "link", href: "/panel/caja", label: "Caja", icon: links[4].icon },
  { type: "link", href: "/panel/acceso", label: "QR", icon: links[5].icon },
];

function isActive(pathname: string, href: string) {
  return href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);
}

/**
 * "sidebar": columna vertical fija a la izquierda en desktop, con "Socios"
 * como desplegable (Lista de socios / Métricas) — igual que el resto de los
 * ítems, ninguno tiene página propia salvo Panel, así que el grupo no
 * navega, solo abre y cierra.
 * "mobile": franja horizontal arriba, debajo del header — cada pantalla es
 * su propio botón, sin desplegables (no hay lugar para eso ahí).
 */
export function PanelNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  if (variant === "sidebar") {
    return (
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {sidebarItems.map((item) => {
          if (item.type === "link") {
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
          }

          const childActive = item.children.some((c) => isActive(pathname, c.href));
          const expanded = childActive || openGroups.has(item.label);

          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.label)) next.delete(item.label);
                    else next.add(item.label);
                    return next;
                  })
                }
                aria-expanded={expanded}
                className={[
                  "w-full flex items-center gap-3 rounded-control px-3.5 py-2.5 text-base font-medium",
                  "transition-colors duration-150",
                  childActive
                    ? "text-txt-onDark"
                    : "text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised/60",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`size-[18px] shrink-0 ${childActive ? "text-plate-blue" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  {item.icon}
                </svg>
                {item.label}
                <svg
                  viewBox="0 0 24 24"
                  className={`size-3.5 ml-auto shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {expanded && (
                <div className="ml-[13px] mt-0.5 space-y-0.5 border-l border-ink-raised/60 pl-4">
                  {item.children.map((c) => {
                    const active = isActive(pathname, c.href);
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center gap-2 rounded-control px-3 py-2 text-tiny font-medium",
                          "transition-colors duration-150",
                          active
                            ? "bg-plate-blue/15 text-txt-onDark"
                            : "text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised/60",
                        ].join(" ")}
                      >
                        {c.label}
                        {active && (
                          <span
                            className="ml-auto size-1.5 rounded-full bg-plate-blue shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="md:hidden overflow-x-auto border-t border-ink-raised/60">
      <div className="flex gap-1 px-2.5 py-1.5 min-w-max">
        {links.map((l) => {
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
