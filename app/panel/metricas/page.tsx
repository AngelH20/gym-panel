import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { StatCard } from "@/components/StatCard";
import { IconPeople, IconCheck, IconAlert, IconPersonPlus, IconActivity, IconClock, IconCalendar } from "@/components/icons";
import { todayLocal, daysAgoLocal, hourLocal, weekdayIndex, WEEKDAY_LABELS } from "@/lib/labels";
import { PeakBarChart, type Bin } from "./PeakBarChart";

const PERIODS = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "15d", label: "15 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "year", label: "Este año" },
  { key: "todo", label: "Todo" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

function periodStart(key: PeriodKey): string | null {
  const today = todayLocal();
  switch (key) {
    case "hoy":
      return today;
    case "7d":
      return daysAgoLocal(6);
    case "15d":
      return daysAgoLocal(14);
    case "30d":
      return daysAgoLocal(29);
    case "90d":
      return daysAgoLocal(89);
    case "year":
      return `${today.slice(0, 4)}-01-01`;
    case "todo":
      return null;
  }
}

/** Días de calendario entre el inicio del período y hoy, inclusive. */
function daySpan(start: string | null, earliest: string | null): number {
  const from = start ?? earliest ?? todayLocal();
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = todayLocal().split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const period: PeriodKey = PERIODS.some((x) => x.key === p) ? (p as PeriodKey) : "30d";
  const start = periodStart(period);

  const supabase = await createClient();

  let checkInsQuery = supabase
    .from("check_ins")
    .select("member_id, checked_in_at, local_date")
    .order("local_date", { ascending: true });
  if (start) checkInsQuery = checkInsQuery.gte("local_date", start);

  const [{ data: membersRaw }, { data: checkInsRaw }] = await Promise.all([
    supabase.from("member_overview").select("*").is("archived_at", null),
    checkInsQuery,
  ]);

  const members = (membersRaw ?? []) as MemberOverview[];
  const checkIns = checkInsRaw ?? [];

  const activos = members.filter((m) => m.effective_status === "active").length;
  const vencidos = members.filter(
    (m) => m.effective_status === "expired" || m.effective_status === "exhausted"
  ).length;
  const sinPase = members.filter((m) => m.effective_status === "no_membership").length;
  const nuevos = members.filter((m) => start === null || m.joined_on >= start).length;

  const totalVisitas = checkIns.length;
  const visitantesUnicos = new Set(checkIns.map((c) => c.member_id)).size;
  const promPorVisitante = visitantesUnicos > 0 ? totalVisitas / visitantesUnicos : 0;
  const earliest = checkIns[0]?.local_date ?? null;
  const promedioDiario = totalVisitas / daySpan(start, earliest);

  const hourBins: Bin[] = Array.from({ length: 24 }, (_, h) => ({
    label: `${h}h`,
    value: 0,
  }));
  for (const c of checkIns) hourBins[hourLocal(c.checked_in_at)].value++;

  const weekdayBins: Bin[] = WEEKDAY_LABELS.map((label) => ({ label, value: 0 }));
  for (const c of checkIns) weekdayBins[weekdayIndex(c.local_date)].value++;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Métricas</h1>
        <p className="mt-2 text-base text-txt-soft">Estadísticas de socios y asistencia.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {PERIODS.map((x) => (
          <Link
            key={x.key}
            href={`/panel/metricas?p=${x.key}`}
            aria-current={period === x.key ? "page" : undefined}
            className={period === x.key ? "chip chip-on" : "chip"}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total socios" value={members.length} accent="blue" icon={<IconPeople />} />
        <StatCard label="Al día" value={activos} accent="green" icon={<IconCheck />} />
        <StatCard label="Vencidos" value={vencidos} accent="red" icon={<IconAlert />} />
        <StatCard label="Sin pase" value={sinPase} accent="amber" icon={<IconAlert />} />
        <StatCard label="Nuevos" value={nuevos} caption="en el período" accent="blue" icon={<IconPersonPlus />} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total visitas" value={totalVisitas} accent="blue" icon={<IconActivity />} />
        <StatCard label="Visitantes únicos" value={visitantesUnicos} accent="green" icon={<IconPeople />} />
        <StatCard
          label="Prom. por visitante"
          value={promPorVisitante.toFixed(1)}
          accent="blue"
          icon={<IconActivity />}
        />
        <StatCard
          label="Promedio diario"
          value={promedioDiario.toFixed(1)}
          accent="amber"
          icon={<IconCalendar />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="card p-4 sm:p-5">
          <h2 className="h3 mb-1 flex items-center gap-2">
            <IconClock className="size-[18px] text-plate-blue" />
            Asistencia por hora
          </h2>
          <PeakBarChart data={hourBins} labelEvery={3} />
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="h3 mb-1 flex items-center gap-2">
            <IconCalendar className="size-[18px] text-plate-blue" />
            Asistencia por día
          </h2>
          <PeakBarChart data={weekdayBins} />
        </section>
      </div>
    </div>
  );
}
