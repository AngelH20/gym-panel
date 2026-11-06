import { Bone, SkeletonHeader, SkeletonListCard, SkeletonPage } from "../Skeleton";

/**
 * Esqueleto de Caja. Aparece al entrar y también al moverse de día con las
 * flechas (cada día es otra página): antes, tocar "día anterior" no mostraba
 * nada hasta que llegaban los números del día nuevo.
 */
export default function CajaLoading() {
  return (
    <SkeletonPage>
      <SkeletonHeader withActions />

      {/* Estado de caja: efectivo en caja y los tres totales */}
      <div className="card">
        <div className="px-5 pt-5 pb-5 space-y-3">
          <Bone className="h-5 w-32" />
          <Bone className="h-3 w-24" />
          <Bone className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-3 sm:px-5 py-4 space-y-2">
              <Bone className="h-3 w-16" />
              <Bone className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonListCard rows={5} />
        <SkeletonListCard rows={3} />
      </div>
    </SkeletonPage>
  );
}
