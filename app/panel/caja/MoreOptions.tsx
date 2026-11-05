"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * "Más opciones" de Caja: lo que no se usa todos los días (cobros anulados,
 * exportar el día) queda guardado acá en vez de ocupar la pantalla.
 */
export function MoreOptions({
  items,
}: {
  items: { href: string; label: string; hint?: string; download?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-ghost btn-sm gap-1.5"
      >
        Más opciones
        <svg viewBox="0 0 24 24" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-64 rounded-card border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((it) =>
            it.download ? (
              <a
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-control px-3 py-2 hover:bg-surface-hover transition-colors"
              >
                <span className="block text-base">{it.label}</span>
                {it.hint && <span className="block text-tiny text-txt-faint">{it.hint}</span>}
              </a>
            ) : (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-control px-3 py-2 hover:bg-surface-hover transition-colors"
              >
                <span className="block text-base">{it.label}</span>
                {it.hint && <span className="block text-tiny text-txt-faint">{it.hint}</span>}
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}
