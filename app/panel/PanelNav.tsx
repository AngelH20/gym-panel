"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminRole } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";

/* --- Íconos (trazo 1.8, 24x24, sin relleno) ------------------------------ */

const inicioIcon = (
  <>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" strokeLinejoin="round" />
  </>
);
const sociosIcon = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 20a6.4 6.4 0 0 0-2-4.7" strokeLinecap="round" />
  </>
);
const cajaIcon = (
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" strokeLinecap="round" />
    <path d="M7 15h3" strokeLinecap="round" />
  </>
);
const qrIcon = (
  <>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" />
    <path d="M14 14h3v3M20.5 17v3.5H14" strokeLinecap="round" />
  </>
);
const metricasIcon = (
  <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" />
);
const cumpleañosIcon = (
  <>
    <path d="M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" strokeLinecap="round" />
    <path d="M3 21h18M4 15.5c1.3 0 1.3 1 2.7 1s1.3-1 2.6-1 1.4 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1 1.3-1 2.7-1" strokeLinecap="round" />
    <path d="M12 11V7.5M12 4.5v.01" strokeLinecap="round" />
  </>
);
const planesIcon = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3 10h18M8 15h4" strokeLinecap="round" />
  </>
);
const usuariosIcon = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M17 8v6M14 11h6" strokeLinecap="round" />
  </>
);
const ajustesIcon = (
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>
);
const masIcon = (
  <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>
);

/* --- Estructura ------------------------------------------------------------
   Dos grupos según el uso real:
   - "Día a día": lo que el profesor usa todo el tiempo en la sala. En el
     celular son las 4 pestañas fijas de abajo.
   - "Gestión": lo que se consulta de vez en cuando. En el celular vive
     detrás de "Más".
   La visibilidad por rol es la misma de antes: Planes queda afuera para el
   profesor y Usuarios es solo para dueño y programador.                     */

type NavLink = { href: string; label: string; short?: string; icon: React.ReactNode };

const DAILY: NavLink[] = [
  { href: "/panel", label: "Inicio", icon: inicioIcon },
  { href: "/panel/socios", label: "Socios", icon: sociosIcon },
  { href: "/panel/caja", label: "Caja", icon: cajaIcon },
  { href: "/panel/acceso", label: "QR de acceso", short: "QR", icon: qrIcon },
];

function managementLinks(role: AdminRole | null | undefined): NavLink[] {
  const links: NavLink[] = [
    { href: "/panel/metricas", label: "Métricas", icon: metricasIcon },
    { href: "/panel/cumpleanos", label: "Cumpleaños", icon: cumpleañosIcon },
  ];
  if (role !== "profesor") links.push({ href: "/panel/planes", label: "Planes", icon: planesIcon });
  if (isManagerRole(role)) {
    links.push({ href: "/panel/usuarios", label: "Usuarios", icon: usuariosIcon });
  }
  links.push({ href: "/panel/settings", label: "Ajustes", icon: ajustesIcon });
  return links;
}

function isActive(pathname: string, href: string) {
  return href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);
}

/** Título de la pantalla actual, para la cabecera del celular. */
const TITLES: [string, string][] = [
  ["/panel/socios/nuevo", "Nuevo socio"],
  ["/panel/socios/", "Ficha del socio"],
  ["/panel/socios", "Socios"],
  ["/panel/caja", "Caja"],
  ["/panel/acceso", "QR de acceso"],
  ["/panel/metricas", "Métricas"],
  ["/panel/cumpleanos", "Cumpleaños"],
  ["/panel/planes", "Planes"],
  ["/panel/usuarios", "Usuarios"],
  ["/panel/settings", "Ajustes"],
];

export function PanelTitle() {
  const pathname = usePathname();
  const title = TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Inicio";
  return <span className="text-lg font-semibold truncate">{title}</span>;
}

function Icon({ children, className = "size-[18px]" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* --- Barra lateral (escritorio) ----------------------------------------- */

function SidebarGroup({ title, links, pathname }: { title: string; links: NavLink[]; pathname: string }) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-micro font-medium text-txt-faint">{title}</p>
      <ul className="space-y-0.5">
        {links.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 min-h-9 rounded-control px-3 text-[0.875rem] transition-colors",
                  active
                    ? "bg-surface-sunk text-txt font-medium"
                    : "text-txt-soft hover:text-txt hover:bg-surface-hover",
                ].join(" ")}
              >
                <span className={active ? "text-plate-blue" : "text-txt-faint"}>
                  <Icon>{item.icon}</Icon>
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --- Menú "Más" (celular) ------------------------------------------------- */

function MoreSheet({
  links,
  pathname,
  footer,
}: {
  links: NavLink[];
  pathname: string;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = links.some((l) => isActive(pathname, l.href));

  // Se cierra al navegar, con Escape y tocando afuera.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      // Hoja modal: con Tab el foco da la vuelta adentro, no se escapa a la
      // página que quedó atrás del velo.
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("a, button");
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    // Que no se scrollee la página de atrás mientras la hoja está abierta.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      // Al cerrar, el foco vuelve a "Más" (si no se navegó a otra pantalla).
      if (trigger && document.activeElement === document.body) trigger.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="panel-mas"
        className={tabClass(active || open)}
      >
        <Icon className="size-[22px]">{masIcon}</Icon>
        Más
      </button>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div
            id="panel-mas"
            ref={panelRef}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface shadow-lift
                       px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
            <p className="px-3 pb-1.5 text-micro font-medium text-txt-faint">Gestión</p>
            <ul>
              {links.map((l) => {
                const on = isActive(pathname, l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-center gap-3 min-h-12 rounded-control px-3 text-base ${
                        on ? "bg-surface-sunk font-medium text-txt" : "text-txt hover:bg-surface-hover"
                      }`}
                    >
                      <span className={on ? "text-plate-blue" : "text-txt-faint"}>
                        <Icon className="size-5">{l.icon}</Icon>
                      </span>
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {footer && <div className="mt-2 pt-2 border-t border-line">{footer}</div>}
          </div>
        </div>
      )}
    </>
  );
}

function tabClass(active: boolean) {
  return [
    "flex-1 flex flex-col items-center justify-center gap-1 h-14 text-[0.6875rem] leading-none transition-colors",
    active ? "text-txt font-semibold" : "text-txt-faint font-medium hover:text-txt",
  ].join(" ");
}

/**
 * "sidebar": columna fija a la izquierda en escritorio, en dos grupos.
 * "mobile": barra fija abajo con las 4 pantallas del día a día y "Más",
 * que abre una hoja con el resto (y lo que se le pase como footer: cuenta,
 * tema, salir).
 */
export function PanelNav({
  variant,
  role,
  footer,
}: {
  variant: "sidebar" | "mobile";
  role?: AdminRole | null;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const management = managementLinks(role);

  if (variant === "sidebar") {
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6" aria-label="Secciones">
        <SidebarGroup title="Día a día" links={DAILY} pathname={pathname} />
        <SidebarGroup title="Gestión" links={management} pathname={pathname} />
      </nav>
    );
  }

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface
                 pb-[env(safe-area-inset-bottom)]"
      aria-label="Secciones"
    >
      <div className="flex">
        {DAILY.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              <span className={active ? "text-plate-blue" : ""}>
                <Icon className="size-[22px]">{l.icon}</Icon>
              </span>
              {l.short ?? l.label}
            </Link>
          );
        })}
        <MoreSheet links={management} pathname={pathname} footer={footer} />
      </div>
    </nav>
  );
}
