import { SkeletonHeader, SkeletonListCard, SkeletonPage, SkeletonStats } from "./Skeleton";

/**
 * Anidado en /panel, igual que error.tsx y not-found.tsx: mientras el server
 * arma la pantalla nueva, la barra lateral y la navegación quedan quietas y
 * acá aparece un esqueleto al instante. Sin esto, al tocar una sección no
 * pasaba nada visible hasta que llegaba la página entera (en el celular, con
 * datos móviles, parecía que el toque no había andado).
 *
 * Este tiene la forma de Inicio y sirve para las secciones livianas. Caja,
 * Métricas, la ficha del socio y el alta tienen el suyo (su loading.tsx),
 * que además aparece al cambiar de día o de período dentro de la misma
 * pantalla. Socios (la lista) a propósito no tiene: la búsqueda y los
 * filtros van en una transición y conviene seguir viendo la lista actual
 * (y no perder el foco del buscador) mientras llega la nueva.
 *
 * Next además precarga este esqueleto para los links visibles del menú, así
 * que el cambio de pantalla se ve en el mismo momento del toque.
 */
export default function PanelLoading() {
  return (
    <SkeletonPage>
      <SkeletonHeader withActions />
      <SkeletonStats />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonListCard avatar />
        <SkeletonListCard avatar />
      </div>
    </SkeletonPage>
  );
}
