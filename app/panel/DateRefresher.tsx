"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { todayLocal } from "@/lib/labels";

/**
 * Si una pantalla del panel queda abierta pasada la medianoche (la tablet
 * del mostrador, un monitor con el dashboard), sin esto seguiría mostrando
 * los datos de ayer hasta que alguien la recargue a mano: "hoy" para el
 * dashboard, la caja y "entró hoy" en socios se calcula en el servidor al
 * momento de la request, no reactivamente en el navegador.
 *
 * Revisa cada minuto si cambió el día en Buenos Aires; si cambió, refresca
 * los Server Components de la página actual (caja, movimiento, historial)
 * sin perder el estado de la pestaña ni recargar todo el documento.
 */
export function DateRefresher() {
  const router = useRouter();
  const dateRef = useRef(todayLocal());

  useEffect(() => {
    const id = setInterval(() => {
      const now = todayLocal();
      if (now !== dateRef.current) {
        dateRef.current = now;
        router.refresh();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
