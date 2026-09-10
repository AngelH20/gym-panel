"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconGrid, IconRows } from "@/components/icons";

export type SociosView = "grid" | "list";

/** Segmento tarjetas / lista para la pantalla de socios. La elección va en la
 *  URL (?view=list), igual que el filtro y la búsqueda: se comparte con el
 *  link y sobrevive a un refresh. "grid" es el default, así que no ensucia
 *  la URL. */
export function ViewToggle({ value }: { value: SociosView }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(next: SociosView) {
    const q = new URLSearchParams(params.toString());
    if (next === "grid") q.delete("view");
    else q.set("view", next);
    router.replace(`/panel/socios?${q.toString()}`);
  }

  const options: [SociosView, (p: { className?: string }) => React.ReactNode, string][] = [
    ["grid", IconGrid, "Ver en tarjetas"],
    ["list", IconRows, "Ver en lista"],
  ];

  return (
    <div className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5">
      {options.map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={value === v}
          aria-label={label}
          title={label}
          className={`flex size-7 items-center justify-center rounded-[6px] transition-colors ${
            value === v
              ? "bg-surface-sunk text-txt"
              : "text-txt-faint hover:text-txt"
          }`}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
