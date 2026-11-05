/**
 * ELEMENTO CENTRAL DE LA INTERFAZ.
 *
 * Las entradas que le quedan a alguien: una barra que se vacía a medida que
 * las usa, con el número al lado. Siempre la misma forma, tenga el pase 8 o
 * 25 entradas, para que se lea igual en todas las pantallas.
 *
 * Por qué: desde el mostrador necesitás saber cuánto le queda a alguien en
 * menos de un segundo. La barra se lee de un vistazo; el número confirma.
 */
export function UsesTally({
  total,
  remaining,
  size = "md",
}: {
  total: number;
  remaining: number;
  size?: "sm" | "md" | "lg";
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const low = remaining <= 2;

  const color = low ? "bg-plate-red" : "bg-txt";
  const numberColor = low ? "text-plate-red" : "text-txt";

  const dims = {
    sm: { bar: "h-1", num: "text-tiny font-medium", gap: "gap-2.5" },
    md: { bar: "h-1.5", num: "text-lg font-semibold", gap: "gap-3" },
    lg: { bar: "h-1.5", num: "text-huge font-semibold", gap: "gap-4" },
  }[size];

  return (
    <div className={`flex items-center ${dims.gap}`}>
      <div className={`relative ${dims.bar} flex-1 min-w-12 rounded-full bg-line overflow-hidden`}>
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`num ${dims.num} ${numberColor} whitespace-nowrap`}>
        {remaining}
        <span className="text-txt-faint font-normal">/{total}</span>
      </span>
      <span className="sr-only">Le quedan {remaining} de {total} entradas</span>
    </div>
  );
}
