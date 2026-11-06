/**
 * Piezas de los esqueletos de carga (los loading.tsx del panel). Server
 * components sin estado: no suman JS al navegador.
 *
 * Cada pantalla pesada tiene su propio loading.tsx con la forma aproximada
 * de lo que va a aparecer, para que al tocar un link se vea algo al instante
 * y el salto al contenido real sea chico.
 */

const BONE = "rounded-control bg-surface-sunk";

/** Un bloque gris. `className` le da el tamaño. */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`${BONE} ${className}`} />;
}

/** Contenedor común: pulso suave (si el sistema no pide menos movimiento) y
 *  aviso para lectores de pantalla. */
export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 motion-safe:animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

/** Título y bajada, como PageHeader. */
export function SkeletonHeader({ withActions = false }: { withActions?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Bone className="h-9 w-44" />
        <Bone className="h-4 w-72 max-w-full" />
      </div>
      {withActions && <Bone className="h-9 w-36" />}
    </div>
  );
}

/** Fila de chips (filtros, períodos). */
export function SkeletonChips({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className="h-9 w-20 shrink-0" />
      ))}
    </div>
  );
}

/** Tarjetas de números (StatCard). */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4 space-y-4">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-9 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Una tarjeta con título y filas de lista (con o sin avatar). */
export function SkeletonListCard({
  rows = 4,
  avatar = false,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <div className="card p-5 space-y-4">
      <Bone className="h-5 w-40" />
      {Array.from({ length: rows }, (_, j) => (
        <div key={j} className="flex items-center gap-3">
          {avatar && <div className="size-9 rounded-full bg-surface-sunk shrink-0" />}
          <div className="flex-1 space-y-2">
            <Bone className="h-3.5 w-3/5" />
            <Bone className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
