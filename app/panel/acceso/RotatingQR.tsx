"use client";

import { useEffect, useRef, useState } from "react";

// Segundos antes del vencimiento en que se pide, en segundo plano, el QR de
// la próxima ventana. Con esto la imagen nueva ya está en memoria cuando el
// contador llega a 0 y el cambio es instantáneo, sin el parón que se veía
// mientras viajaba el pedido a Supabase.
const PREFETCH_LEAD = 6;

async function fetchQr(next = false): Promise<{ dataUrl: string; secondsLeft: number }> {
  const res = await fetch(`/panel/acceso/qr${next ? "?next=1" : ""}`, { cache: "no-store" });
  return res.json();
}

/**
 * La cuenta regresiva corre en el cliente. El QR de la ventana siguiente se
 * pide unos segundos antes (PREFETCH_LEAD) y se deja listo; al llegar a 0 se
 * intercambia la imagen al instante. Solo se hace un pedido "en vivo"
 * (fetchQr sin next) como red de seguridad si el prefetch no llegó a tiempo.
 *
 * Los navegadores frenan (o directamente pausan) los setInterval de una
 * pestaña en segundo plano — pantalla bloqueada, minimizada, otra app
 * adelante. Si esta pantalla queda así un rato largo, al volver mostraría un
 * QR viejo sin ningún aviso. Por eso, además del ciclo normal, se fuerza un
 * refresh apenas la pestaña vuelve a estar visible.
 */
export function RotatingQR({
  initialDataUrl,
  initialSecondsLeft,
  periodSeconds,
}: {
  initialDataUrl: string;
  initialSecondsLeft: number;
  periodSeconds: number;
}) {
  const [dataUrl, setDataUrl] = useState(initialDataUrl);
  const [secondsLeft, setSecondsLeft] = useState(initialSecondsLeft);

  // dataUrl del QR de la próxima ventana, ya descargado y esperando el cambio.
  const nextDataUrl = useRef<string | null>(null);
  const prefetching = useRef(false);
  const refreshing = useRef(false);

  // Trae el QR de la ventana siguiente y lo guarda. De paso reencamina el
  // contador local si se despegó del server (pestaña frenada, reloj flojo).
  function prefetchNext() {
    if (prefetching.current || nextDataUrl.current) return;
    prefetching.current = true;
    fetchQr(true)
      .then(({ dataUrl, secondsLeft }) => {
        nextDataUrl.current = dataUrl;
        setSecondsLeft((s) => (Math.abs(s - secondsLeft) > 2 ? secondsLeft : s));
      })
      .catch(() => {})
      .finally(() => {
        prefetching.current = false;
      });
  }

  // Pedido "en vivo": solo como respaldo si el prefetch falló o no llegó.
  function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    nextDataUrl.current = null;
    fetchQr()
      .then(({ dataUrl, secondsLeft }) => {
        setDataUrl(dataUrl);
        setSecondsLeft(secondsLeft);
      })
      .catch(() => {})
      .finally(() => {
        refreshing.current = false;
      });
  }

  // Cambio de ventana: si ya tenemos el próximo QR, lo mostramos al instante.
  function rollOver() {
    if (nextDataUrl.current) {
      setDataUrl(nextDataUrl.current);
      nextDataUrl.current = null;
      setSecondsLeft(periodSeconds);
    } else {
      refresh();
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(-1, s - 1));
    }, 1000);

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efectos del contador, separados del tick para no disparar setState desde
  // dentro de un updater: pedir el próximo QR al acercarse el vencimiento y
  // cambiarlo al llegar a 0.
  useEffect(() => {
    if (secondsLeft <= PREFETCH_LEAD && secondsLeft > 0) prefetchNext();
    if (secondsLeft <= 0) rollOver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const shown = Math.max(0, secondsLeft);
  const pct = Math.max(0, Math.min(100, (shown / periodSeconds) * 100));
  const low = pct <= 20;

  return (
    <div className="card p-4 sm:p-6 flex flex-col items-center gap-5 w-full max-w-xl">
      <div className="w-full bg-white p-3 sm:p-4 rounded-control">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt="QR para registrar la entrada al gimnasio"
          className="w-full rounded-sm"
        />
      </div>

      <div className="w-full space-y-3">
        <div className="w-full h-1 rounded-full bg-line overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              low ? "bg-plate-red" : "bg-txt"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-tiny text-txt-soft">
            <span
              className={`size-1.5 rounded-full motion-safe:animate-pulse ${
                low ? "bg-plate-red" : "bg-plate-green"
              }`}
            />
            Se renueva solo
          </span>
          <span
            className={`num text-title font-semibold ${low ? "text-plate-red" : "text-txt"}`}
            aria-live="off"
          >
            {shown}
            <span className="text-tiny font-normal text-txt-faint">s</span>
          </span>
        </div>
      </div>
    </div>
  );
}
