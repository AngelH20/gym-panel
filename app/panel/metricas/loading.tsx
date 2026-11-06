import { Bone, SkeletonChips, SkeletonHeader, SkeletonPage, SkeletonStats } from "../Skeleton";

/**
 * Esqueleto de Métricas. También aparece al cambiar de período (cada período
 * es otra página), así se nota que el toque anduvo mientras Postgres cuenta.
 */
export default function MetricasLoading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <SkeletonChips count={7} />
      <SkeletonStats />
      <SkeletonStats />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="card p-4 sm:p-5 space-y-4">
            <Bone className="h-5 w-40" />
            <Bone className="h-32 w-full" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
