import { Bone, SkeletonListCard, SkeletonPage } from "../../Skeleton";

/**
 * Esqueleto de la ficha del socio, el link más tocado del panel (desde la
 * lista, Inicio y Cumpleaños). Sin él, desde la lista de Socios el toque no
 * mostraba nada hasta que llegaba la ficha entera: la lista no tiene esqueleto
 * propio (ver app/panel/loading.tsx) y Next sigue mostrando la pantalla vieja.
 */
export default function SocioLoading() {
  return (
    <SkeletonPage>
      <div className="space-y-3">
        <Bone className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-full bg-surface-sunk shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-8 w-56 max-w-full" />
            <Bone className="h-4 w-24" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <Bone className="h-5 w-32" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-4/5" />
            <Bone className="h-10 w-full" />
          </div>
          <SkeletonListCard rows={2} />
        </div>
        <div className="space-y-6">
          <SkeletonListCard rows={4} />
          <SkeletonListCard rows={3} />
        </div>
      </div>
    </SkeletonPage>
  );
}
