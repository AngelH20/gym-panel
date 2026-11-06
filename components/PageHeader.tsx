import Link from "next/link";

/**
 * Encabezado de pantalla, igual en todas: título y bajada a la izquierda,
 * acción principal a la derecha. En el celular el título ya está en la
 * cabecera fija de arriba, así que acá queda solo para lectores de pantalla
 * (sigue siendo el h1 de la página) y se ve la bajada y la acción.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2">
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="h1 sr-only md:not-sr-only">{title}</h1>
          {description && (
            <p className="md:mt-1 text-tiny md:text-base text-txt-soft max-w-prose">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/** "‹ Socios": volver a la pantalla de arriba. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-1.5 inline-flex min-h-8 coarse:min-h-11 items-center gap-1 rounded-control px-1.5 text-tiny font-medium text-txt-soft hover:text-txt transition-colors"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}
