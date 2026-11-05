import Link from "next/link";

export const STAT_ACCENT = {
  green: "bg-plate-green/12 text-plate-green",
  blue: "bg-plate-blue/12 text-plate-blue",
  red: "bg-plate-red/12 text-plate-red",
  amber: "bg-plate-amber/25 text-plate-amberInk",
} as const;

export type StatAccent = keyof typeof STAT_ACCENT;

/** Tarjeta de métrica, tipo marcador: rótulo chico con el ícono en el color
 *  del disco que le corresponde, y abajo el número grande y condensado.
 *  Mismo patrón en Panel, Socios, Caja y Métricas — un solo componente. */
export function StatCard({
  label,
  value,
  caption,
  accent,
  icon,
  href,
}: {
  label: string;
  value: number | string;
  caption?: string;
  accent: StatAccent;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full [&>svg]:size-4 ${STAT_ACCENT[accent]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="text-tiny font-semibold text-txt-soft truncate">{label}</p>
      </div>
      <div className="min-w-0">
        <p className="scoreboard text-display sm:text-huge [overflow-wrap:anywhere]">{value}</p>
        {caption && <p className="mt-1.5 text-tiny text-txt-faint truncate">{caption}</p>}
      </div>
    </>
  );

  const className = "card p-4 flex flex-col gap-3 min-w-0";

  return href ? (
    <Link
      href={href}
      className={`${className} hover:border-line-strong hover:shadow-lift transition-[border-color,box-shadow]`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
