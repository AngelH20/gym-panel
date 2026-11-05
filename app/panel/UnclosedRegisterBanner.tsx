import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth, todayLocal } from "@/lib/labels";

/**
 * Aviso sobrio cuando la caja de un día anterior quedó abierta: "La caja del
 * 03/11 quedó sin cerrar · Cerrarla". Muestra la más reciente; si hay más,
 * lo dice. Server component: no manda nada al navegador si no hay aviso.
 *
 * `exclude`: el día que ya se está mirando en Caja (ahí está el formulario
 * de cierre, el aviso sobra). Si algo falla, no muestra nada.
 */
export async function UnclosedRegisterBanner({ exclude }: { exclude?: string }) {
  const today = todayLocal();
  let pending: string[] = [];

  try {
    const supabase = await createClient();
    const [{ data: openings, error: e1 }, { data: closings, error: e2 }] = await Promise.all([
      supabase
        .from("cash_openings")
        .select("opening_date")
        .lt("opening_date", today)
        .order("opening_date", { ascending: false })
        .limit(1000),
      // Mismo orden que las aperturas: sin él, cuando haya más de 1000
      // cierres llegan 1000 cualquiera y días ya cerrados aparecen como
      // "sin cerrar".
      supabase
        .from("cash_closings")
        .select("closing_date")
        .lt("closing_date", today)
        .order("closing_date", { ascending: false })
        .limit(1000),
    ]);
    if (e1 || e2) return null;

    const closed = new Set((closings ?? []).map((c) => c.closing_date as string));
    pending = (openings ?? [])
      .map((o) => o.opening_date as string)
      .filter((d) => !closed.has(d) && d !== exclude);
  } catch {
    return null;
  }

  if (pending.length === 0) return null;

  const latest = pending[0];
  const others = pending.length - 1;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line bg-surface px-4 py-2.5 text-tiny text-txt-soft"
    >
      <span className="size-2 shrink-0 rounded-full bg-plate-amber" aria-hidden="true" />
      <span>
        La caja del <span className="num font-medium text-txt">{formatDayMonth(latest)}</span> quedó
        sin cerrar
        {others > 0 && (
          <span className="text-txt-faint">
            {" "}
            (y {others} {others === 1 ? "día más" : "días más"})
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-txt-faint">
        ·
      </span>
      <Link
        href={`/panel/caja?date=${latest}`}
        className="font-medium text-txt underline-offset-2 hover:underline hover:text-plate-blue transition-colors"
      >
        Cerrarla
      </Link>
    </div>
  );
}
