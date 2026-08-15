/**
 * ELEMENTO CENTRAL DE LA INTERFAZ.
 *
 * Los usos del pase dibujados como una tarjeta perforada: una marca por
 * entrada. Las gastadas quedan apagadas; las disponibles, en amarillo.
 *
 * Por qué: desde el mostrador necesitás saber cuánto le queda a alguien en
 * menos de un segundo. Una fila de marcas se lee de un vistazo; "18/31" hay
 * que procesarlo.
 *
 * Arriba de `maxMarks` la fila se vuelve ilegible en un celular, así que se
 * cae a una barra continua.
 */
export function UsesTally({
  total,
  remaining,
  maxMarks = 12,
  size = "md",
}: {
  total: number;
  remaining: number;
  maxMarks?: number;
  size?: "sm" | "md" | "lg";
}) {
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const low = remaining <= 2;

  const color = low ? "bg-plate-red" : "bg-plate-amber";
  const numberColor = low ? "text-plate-red" : "text-txt";

  const dims = {
    sm: { mark: "h-3.5 w-[3px]", bar: "h-1.5", num: "text-tiny" },
    md: { mark: "h-5 w-[4px]", bar: "h-2", num: "text-base" },
    lg: { mark: "h-8 w-[6px]", bar: "h-2.5", num: "text-title" },
  }[size];

  const label = (
    <span className={`font-mono ${dims.num} font-semibold ${numberColor}`}>
      {remaining}
      <span className="text-txt-faint font-normal">/{total}</span>
    </span>
  );

  if (total > maxMarks) {
    return (
      <div className="flex items-center gap-3">
        <div className={`relative ${dims.bar} flex-1 min-w-14 rounded-full bg-line overflow-hidden`}>
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${color} transition-[width]`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {label}
        <span className="sr-only">Le quedan {remaining} de {total} entradas</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-end gap-1" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={[
              dims.mark,
              "rounded-full transition-colors",
              i < used ? "bg-line-strong opacity-60" : color,
            ].join(" ")}
          />
        ))}
      </div>
      {label}
      <span className="sr-only">Le quedan {remaining} de {total} entradas</span>
    </div>
  );
}
