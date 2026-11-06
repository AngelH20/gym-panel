"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const params = useSearchParams();
  // Mientras llega el resultado, la lupa pasa a ser un indicador de carga:
  // en el celular, con datos lentos, si no parecía que no buscaba.
  const [searching, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function go(raw: string) {
    const term = raw.trim();
    if (term === (params.get("q") ?? "")) return;
    const next = new URLSearchParams(params.toString());
    if (term) next.set("q", term);
    else next.delete("q");
    // En una transición: mientras llega el resultado se sigue viendo la
    // lista actual, en vez del esqueleto de carga que reemplazaría a este
    // mismo input y le sacaría el foco a mitad de palabra.
    startTransition(() => router.replace(`/panel/socios?${next.toString()}`));
  }

  // Debounce: no queremos una request por tecla.
  useEffect(() => {
    // Al montar (y si la búsqueda ya coincide con la URL) no hay nada que
    // pedir: antes cada vez que se abría Socios se volvía a renderizar la
    // página entera en el server 300 ms después, sin que nadie tipeara.
    if (value.trim() === (params.get("q") ?? "")) return;

    const t = setTimeout(() => go(value), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // En la compu, el cursor ya queda en el buscador: es a lo que se viene.
  // En el celular no, porque abrir el teclado solo tapa la lista.
  useEffect(() => {
    if (!defaultValue && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        // Enter (o "Buscar" en el teclado del celular): busca ya, sin esperar
        // el debounce, y en pantallas táctiles cierra el teclado para que se
        // vean los resultados.
        e.preventDefault();
        go(value);
        if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
      }}
    >
      {searching ? (
        <span
          className="absolute left-3.5 top-1/2 -mt-2 size-4 rounded-full border-2 border-txt-faint border-t-transparent animate-spin pointer-events-none"
          aria-hidden="true"
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-txt-faint pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )}

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            setValue("");
          }
        }}
        className="field pl-10 min-h-11"
        placeholder="Buscar por nombre, DNI o teléfono…"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Buscar socio por nombre, DNI o teléfono"
        aria-busy={searching || undefined}
      />
    </form>
  );
}
