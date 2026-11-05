import type { createClient } from "@/lib/supabase/server";
import { hourLocal, weekdayIndex } from "@/lib/labels";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Entradas de un período, ya contadas. */
export type CheckInStats = {
  total: number;
  /** Socios distintos que entraron al menos una vez. */
  uniqueMembers: number;
  /** Primer día con entradas del período ("AAAA-MM-DD"), o null si no hubo. */
  earliest: string | null;
  /** 24 posiciones: entradas por hora (0h..23h, hora de Buenos Aires). */
  byHour: number[];
  /** 7 posiciones: entradas por día de la semana (lunes..domingo). */
  byWeekday: number[];
  /** Entradas por fecha "AAAA-MM-DD" (solo los días que tuvieron). */
  byDay: Record<string, number>;
};

type RpcStats = {
  total: number;
  unique_members: number;
  earliest: string | null;
  by_hour: number[];
  by_weekday: number[];
  by_day: Record<string, number> | null;
};

/**
 * Cuenta las entradas desde `from` (inclusive; null = toda la historia).
 *
 * Primero le pide las cuentas a Postgres (checkin_stats, sql/50): vuelve un
 * JSON chico, sin importar cuántas entradas haya. Si esa función todavía no
 * existe en la base (no se corrió sql/50) o falla, hace lo de antes: trae
 * las filas y las cuenta acá. Ojo que esa forma vieja queda limitada por el
 * máximo de filas de la API de Supabase (1000 por defecto) y con períodos
 * largos cuenta de menos: por eso conviene correr sql/50.
 */
export async function fetchCheckInStats(
  supabase: Supabase,
  from: string | null
): Promise<CheckInStats> {
  try {
    const { data, error } = await supabase.rpc("checkin_stats", { p_from: from });
    if (!error && data) {
      const s = data as RpcStats;
      return {
        total: s.total,
        uniqueMembers: s.unique_members,
        earliest: s.earliest,
        byHour: s.by_hour,
        byWeekday: s.by_weekday,
        byDay: s.by_day ?? {},
      };
    }
  } catch {
    // Sigue con la forma vieja.
  }
  return fetchCheckInStatsFromRows(supabase, from);
}

async function fetchCheckInStatsFromRows(
  supabase: Supabase,
  from: string | null
): Promise<CheckInStats> {
  let query = supabase
    .from("check_ins")
    .select("member_id, checked_in_at, local_date")
    .order("local_date", { ascending: true });
  if (from) query = query.gte("local_date", from);
  const { data } = await query;
  const rows = data ?? [];

  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  const byDay: Record<string, number> = {};
  for (const c of rows) {
    byHour[hourLocal(c.checked_in_at)]++;
    byWeekday[weekdayIndex(c.local_date)]++;
    byDay[c.local_date] = (byDay[c.local_date] ?? 0) + 1;
  }

  return {
    total: rows.length,
    uniqueMembers: new Set(rows.map((c) => c.member_id)).size,
    earliest: rows[0]?.local_date ?? null,
    byHour,
    byWeekday,
    byDay,
  };
}
