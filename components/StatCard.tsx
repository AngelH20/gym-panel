import Link from "next/link";

/** Color de cada métrica. En el diseño neutro el color no pinta la tarjeta:
 *  solo el ícono, chico, y solo cuando es un estado (rojo = vencidos). */
export const STAT_ACCENT = {
  green: "text-txt-faint",
  blue: "text-txt-faint",
  red: "text-plate-red",
  amber: "text-txt-faint",
} as const;

export type StatAccent = keyof typeof STAT_ACCENT;

/** Métrica: rótulo chico arriba, número grande abajo. Mismo patrón en Inicio,
 *  Caja y Métricas — un solo componente. */
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
      <p className="flex items-center gap-1.5 text-tiny text-txt-soft min-w-0">
        <span className={`shrink-0 [&>svg]:size-4 ${STAT_ACCENT[accent]}`} aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 sm:mt-2 num text-[1.625rem] leading-8 sm:text-huge font-semibold [overflow-wrap:anywhere]">{value}</p>
      {caption && <p className="mt-0.5 text-tiny text-txt-faint truncate">{caption}</p>}
    </>
  );

  const className = "card px-4 py-3.5 block min-w-0";

  return href ? (
    <Link href={href} className={`${className} transition-colors hover:border-line-strong hover:bg-surface-hover`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
