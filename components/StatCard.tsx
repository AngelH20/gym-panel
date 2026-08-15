import Link from "next/link";

export const STAT_ACCENT = {
  green: "bg-plate-green/12 text-plate-green",
  blue: "bg-plate-blue/12 text-plate-blue",
  red: "bg-plate-red/12 text-plate-red",
  amber: "bg-plate-amber/20 text-plate-amberInk",
} as const;

export type StatAccent = keyof typeof STAT_ACCENT;

/** Tarjeta de métrica: número grande + ícono de color a la derecha. Mismo
 *  patrón en Panel, Socios y Métricas — un solo componente para las tres. */
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
      <div className="min-w-0">
        <p className="text-tiny text-txt-soft truncate">{label}</p>
        <p className="mt-1 font-mono text-huge font-semibold leading-none">{value}</p>
        {caption && <p className="mt-1.5 text-tiny text-txt-faint truncate">{caption}</p>}
      </div>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${STAT_ACCENT[accent]}`}
        aria-hidden="true"
      >
        {icon}
      </span>
    </>
  );

  const className = "card p-4 flex items-start justify-between gap-2";

  return href ? (
    <Link href={href} className={`${className} hover:border-line-strong transition-colors`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
