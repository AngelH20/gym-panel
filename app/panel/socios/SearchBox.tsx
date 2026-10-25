"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const params = useSearchParams();

  // Debounce: no queremos una request por tecla.
  useEffect(() => {
    // Al montar (y si la búsqueda ya coincide con la URL) no hay nada que
    // pedir: antes cada vez que se abría Socios se volvía a renderizar la
    // página entera en el server 300 ms después, sin que nadie tipeara.
    if (value.trim() === (params.get("q") ?? "")) return;

    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      // En una transición: mientras llega el resultado se sigue viendo la
      // lista actual, en vez del esqueleto de carga que reemplazaría a este
      // mismo input y le sacaría el foco a mitad de palabra.
      startTransition(() => router.replace(`/panel/socios?${next.toString()}`));
    }, 300);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 24 24"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-txt-faint pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="field pl-10"
        placeholder="Buscar por nombre o DNI…"
        type="search"
        aria-label="Buscar socio por nombre o DNI"
      />
    </div>
  );
}
