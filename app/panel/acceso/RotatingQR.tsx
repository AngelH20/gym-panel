"use client";

import { useEffect, useRef, useState } from "react";

async function fetchQr(): Promise<{ dataUrl: string; secondsLeft: number }> {
  const res = await fetch("/panel/acceso/qr", { cache: "no-store" });
  return res.json();
}

/**
 * La cuenta regresiva corre en el cliente; solo se vuelve a pedir el QR
 * (nueva imagen, nuevo token adentro) cuando la ventana actual se vence.
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
  const refreshing = useRef(false);

  function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    fetchQr().then(({ dataUrl, secondsLeft }) => {
      setDataUrl(dataUrl);
      setSecondsLeft(secondsLeft);
      refreshing.current = false;
    });
  }

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          refresh();
          return 0;
        }
        return Math.max(0, s - 1);
      });
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

  const pct = Math.max(0, Math.min(100, (secondsLeft / periodSeconds) * 100));
  const low = pct <= 20;

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="QR para registrar la entrada al gimnasio"
        className="w-full rounded-control border border-line shadow-chrome"
      />

      <div className="w-full h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            low ? "bg-plate-red" : "bg-plate-blue"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
