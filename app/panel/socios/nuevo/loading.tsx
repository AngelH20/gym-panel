import { Bone, SkeletonPage } from "../../Skeleton";

/**
 * Esqueleto del alta de socio. Se entra desde la lista de Socios, que no tiene
 * esqueleto propio (ver app/panel/loading.tsx): sin este, "Nuevo socio" no
 * mostraba nada hasta que llegaba el formulario con los planes.
 */
export default function NuevoSocioLoading() {
  return (
    <SkeletonPage>
      <div className="space-y-2">
        <Bone className="h-4 w-20" />
        <Bone className="h-9 w-44" />
      </div>
      <div className="card p-5 space-y-5 max-w-2xl">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-11 w-full" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
