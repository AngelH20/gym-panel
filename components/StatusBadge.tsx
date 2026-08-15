import { effectiveStatusLabel } from "@/lib/labels";
import type { EffectiveStatus } from "@/lib/types";

/**
 * Cada insignia lleva un punto de color además del texto: el color solo no
 * alcanza para quien no lo distingue, y el punto ayuda a escanear la lista.
 */
const styles: Record<EffectiveStatus, { chip: string; dot: string }> = {
  active: {
    chip: "border-plate-green/30 bg-plate-green/10 text-plate-green",
    dot: "bg-plate-green",
  },
  expired: {
    chip: "border-plate-red/30 bg-plate-red/10 text-plate-red",
    dot: "bg-plate-red",
  },
  exhausted: {
    chip: "border-plate-red/30 bg-plate-red/10 text-plate-red",
    dot: "bg-plate-red",
  },
  suspended: {
    chip: "border-line-strong bg-surface-sunk text-txt-soft",
    dot: "bg-txt-faint",
  },
  no_membership: {
    chip: "border-line-strong bg-surface-sunk text-txt-soft",
    dot: "bg-txt-faint",
  },
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  const s = styles[status];
  return (
    <span className={`badge ${s.chip}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {effectiveStatusLabel[status]}
    </span>
  );
}
