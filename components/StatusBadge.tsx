import { effectiveStatusLabel } from "@/lib/labels";
import type { EffectiveStatus } from "@/lib/types";

/**
 * Cada insignia lleva un punto de color además del texto: el color solo no
 * alcanza para quien no lo distingue, y el punto ayuda a escanear la lista.
 */
const styles: Record<EffectiveStatus, { text: string; dot: string }> = {
  active: { text: "text-txt-soft", dot: "bg-plate-green" },
  expired: { text: "text-plate-red", dot: "bg-plate-red" },
  exhausted: { text: "text-plate-red", dot: "bg-plate-red" },
  suspended: { text: "text-txt-faint", dot: "bg-line-strong" },
  no_membership: { text: "text-txt-faint", dot: "bg-line-strong" },
  paused: { text: "text-txt-soft", dot: "bg-plate-blue" },
};

/** Estado como punto + rótulo chico, sin fondo de color. */
export function StatusBadge({ status }: { status: EffectiveStatus }) {
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-tiny font-medium whitespace-nowrap ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {effectiveStatusLabel[status]}
    </span>
  );
}
