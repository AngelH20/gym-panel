"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/icons";

/**
 * Red de contención para cualquier error que escape de una página fuera de
 * /panel (login, /c). Nunca se muestra el mensaje ni el stack de React:
 * eso queda solo en la consola, para poder depurarlo sin exponerlo.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-surface-sunk">
      <div className="w-full max-w-sm text-center space-y-5">
        <span
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-plate-red/12 text-plate-red"
          aria-hidden="true"
        >
          <IconAlert className="size-6" />
        </span>

        <div className="space-y-1.5">
          <h1 className="h2">Algo salió mal</h1>
          <p className="text-base text-txt-soft">
            Hubo un problema inesperado. Probá de nuevo — si sigue pasando, avisale al
            encargado del gimnasio.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Reintentar
          </button>
          <a href="/" className="btn-ghost">
            Volver al inicio
          </a>
        </div>
      </div>
    </main>
  );
}
