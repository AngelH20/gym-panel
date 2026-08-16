"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/icons";

/**
 * Anidado en /panel: si una pantalla del admin rompe, la barra lateral y la
 * navegación siguen ahí — solo se pierde el contenido de esa pantalla.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[panel error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
      <span
        className="flex size-12 items-center justify-center rounded-full bg-plate-red/12 text-plate-red"
        aria-hidden="true"
      >
        <IconAlert className="size-6" />
      </span>

      <div className="space-y-1.5">
        <h1 className="h2">Algo salió mal</h1>
        <p className="text-base text-txt-soft max-w-sm">
          Hubo un problema al cargar esta pantalla. Probá de nuevo.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Reintentar
        </button>
        <a href="/panel" className="btn-ghost">
          Ir al panel
        </a>
      </div>
    </div>
  );
}
