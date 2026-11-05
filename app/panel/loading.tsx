/**
 * Anidado en /panel, igual que error.tsx y not-found.tsx: mientras el server
 * arma la pantalla nueva, la barra lateral y la navegación quedan quietas y
 * acá aparece un esqueleto al instante. Sin esto, al tocar una sección no
 * pasaba nada visible hasta que llegaba la página entera (en el celular, con
 * datos móviles, parecía que el toque no había andado).
 *
 * Next además precarga este esqueleto para los links visibles del menú, así
 * que el cambio de pantalla se ve en el mismo momento del toque.
 */
export default function PanelLoading() {
  const block = "rounded-control bg-surface-sunk";

  return (
    <div className="space-y-6 motion-safe:animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <div className="space-y-2">
        <div className={`${block} h-9 w-44`} />
        <div className={`${block} h-4 w-72 max-w-full`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4 space-y-4">
            <div className={`${block} h-3.5 w-20`} />
            <div className={`${block} h-9 w-14`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card p-5 space-y-4">
            <div className={`${block} h-5 w-40`} />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-surface-sunk shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className={`${block} h-3.5 w-3/5`} />
                  <div className={`${block} h-3 w-2/5`} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
