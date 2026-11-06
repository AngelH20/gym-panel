import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { UsesTally } from "@/components/UsesTally";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { fetchCheckInStats } from "@/lib/checkInStats";
import {
  cameDuringCurrentPass,
  daysWithoutComing,
  INACTIVE_DAYS,
  isInactive,
} from "@/lib/inactive";
import {
  IconPeople,
  IconPersonPlus,
  IconCheck,
  IconAlert,
  IconActivity,
  IconCash,
  IconSearch,
} from "@/components/icons";
import {
  formatTime,
  formatMoney,
  formatDayMonth,
  todayLocal,
  daysAgoLocal,
  weekdayShort,
} from "@/lib/labels";
import { WeeklyAttendanceChart, type DayCount } from "./WeeklyAttendanceChart";
import { WeeklyRevenueChart, type DayRevenue } from "./WeeklyRevenueChart";
import { UnclosedRegisterBanner, preloadUnclosedRegisters } from "./UnclosedRegisterBanner";

const WEEK_LENGTH = 7;

// Solo las columnas que usa el panel. member_overview calcula cada columna
// por socio (cumpleaños, entradas de hoy, última entrada...) y con select("*")
// se calculaban y viajaban todas, incluidas las que acá no se muestran.
const DASHBOARD_COLUMNS =
  "id, full_name, phone, photo_url, effective_status, uses_total, uses_remaining, days_left, " +
  "period_start, period_end, checked_in_today, visits_today, last_check_in_at, is_birthday_today";

type DashboardMember = Pick<
  MemberOverview,
  | "id"
  | "full_name"
  | "phone"
  | "photo_url"
  | "effective_status"
  | "uses_total"
  | "uses_remaining"
  | "days_left"
  | "period_start"
  | "period_end"
  | "checked_in_today"
  | "visits_today"
  | "last_check_in_at"
  | "is_birthday_today"
>;

// Cuánto tiempo sigue en "Vencidos sin renovar" alguien que no volvió. Pasado
// esto se asume que dejó el gimnasio y deja de ocupar el panel (sigue en
// Socios, con su estado).
const OVERDUE_WINDOW_DAYS = 30;

// Cuántos inactivos se muestran en Inicio; el resto, en Socios > Inactivos.
const INACTIVE_LIMIT = 30;

/** "vence hoy" / "vence mañana" / "vence el 20/10", para la lista de cobro. */
function dueLabel(daysLeft: number | null, periodEnd: string | null): string | null {
  if (daysLeft == null || periodEnd == null) return null;
  if (daysLeft === 0) return "vence hoy";
  if (daysLeft === 1) return "vence mañana";
  return `vence el ${formatDayMonth(periodEnd)}`;
}

export default async function PanelHome() {
  const supabase = await createClient();
  const today = todayLocal();
  const weekStart = daysAgoLocal(WEEK_LENGTH - 1);
  // El aviso de caja sin cerrar sale junto con el resto, no después.
  preloadUnclosedRegisters();

  const [
    { data },
    { data: paymentsToday },
    weekStats,
    { data: weekPayments },
  ] = await Promise.all([
      supabase.from("member_overview").select(DASHBOARD_COLUMNS).is("archived_at", null),
      supabase
        .from("payments")
        .select("amount_cents, method")
        .eq("local_date", today)
        .is("voided_at", null),
      // Entradas por día, ya contadas en Postgres (sql/50; ver
      // lib/checkInStats.ts). Antes venía una fila por entrada de la semana.
      fetchCheckInStats(supabase, weekStart),
      supabase
        .from("payments")
        .select("local_date, method, amount_cents")
        .gte("local_date", weekStart)
        .is("voided_at", null),
    ]);
  const all = (data ?? []) as unknown as DashboardMember[];
  const pagos = paymentsToday ?? [];

  // Los últimos 7 días, más viejo primero, con la etiqueta del eje ya lista.
  const week: { date: string; label: string }[] = Array.from({ length: WEEK_LENGTH }, (_, i) => {
    const date = daysAgoLocal(WEEK_LENGTH - 1 - i);
    return { date, label: weekdayShort(date) };
  });

  const attendanceData: DayCount[] = week.map((d) => ({
    ...d,
    count: weekStats.byDay[d.date] ?? 0,
  }));

  const revenueByDay = new Map<string, { cash: number; transfer: number }>();
  for (const p of weekPayments ?? []) {
    const row = revenueByDay.get(p.local_date) ?? { cash: 0, transfer: 0 };
    if (p.method === "cash") row.cash += p.amount_cents / 100;
    else row.transfer += p.amount_cents / 100;
    revenueByDay.set(p.local_date, row);
  }
  const revenueData: DayRevenue[] = week.map((d) => ({
    ...d,
    ...(revenueByDay.get(d.date) ?? { cash: 0, transfer: 0 }),
  }));

  // En orden de llegada: el primero que entró arriba.
  const entraronHoy = all
    .filter((m) => m.checked_in_today)
    .sort((a, b) => (a.last_check_in_at ?? "").localeCompare(b.last_check_in_at ?? ""));
  const movimientosHoy = all.reduce((sum, m) => sum + (m.visits_today ?? 0), 0);
  const totalCobradoHoy = pagos.reduce((sum, p) => sum + p.amount_cents, 0);
  const activos = all.filter((m) => m.effective_status === "active");
  // Los más urgentes primero: lo que antes se le termine (días o entradas).
  const porVencer = activos
    .filter((m) => (m.uses_remaining ?? 99) <= 2 || (m.days_left ?? 99) <= 3)
    .sort(
      (a, b) =>
        Math.min(a.days_left ?? 99, a.uses_remaining ?? 99) -
        Math.min(b.days_left ?? 99, b.uses_remaining ?? 99)
    );
  const vencidos = all.filter(
    (m) => m.effective_status === "expired" || m.effective_status === "exhausted"
  );
  const cumpleañosHoy = all.filter((m) => m.is_birthday_today);

  // Cada socio vence en su propia fecha (ver sql/27_renewal_always_same_day.sql).
  // Acá van los que ya vencieron hace poco y todavía no renovaron; los de
  // hace más de un mes probablemente dejaron de venir.
  const overdueSince = daysAgoLocal(OVERDUE_WINDOW_DAYS);
  const vencidosSinRenovar = vencidos
    .filter((m) => m.period_end != null && m.period_end >= overdueSince)
    .sort((a, b) => (a.period_end ?? "").localeCompare(b.period_end ?? ""));

  // Pagan pero no vienen (ver lib/inactive.ts). Los que hace más que no
  // vienen, primero.
  const inactivos = all
    .filter((m) => isInactive(m, today))
    .map((m) => ({ m, days: daysWithoutComing(m, today) ?? 0 }))
    .sort((a, b) => b.days - a.days);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inicio"
        actions={
          <>
            <Link href="/panel/socios" className="btn-ghost" aria-label="Buscar socio">
              <IconSearch className="size-4" />
              <span className="hidden sm:inline">Buscar socio</span>
            </Link>
            <Link href="/panel/socios/nuevo" className="btn-primary">
              <IconPersonPlus className="size-4" />
              Nuevo socio
            </Link>
          </>
        }
      />

      <UnclosedRegisterBanner />

      {/* El día de hoy, de un vistazo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Entraron hoy"
          value={entraronHoy.length}
          accent="green"
          icon={<IconPeople />}
        />
        <StatCard label="Al día" value={activos.length} accent="blue" icon={<IconCheck />} />
        <StatCard label="Vencidos" value={vencidos.length} accent="red" icon={<IconAlert />} />
        <StatCard
          label="Movimientos hoy"
          value={movimientosHoy}
          caption={movimientosHoy > entraronHoy.length ? "incluye reingresos" : undefined}
          accent="blue"
          icon={<IconActivity />}
        />
        <StatCard
          label={pagos.length === 1 ? "Pago hoy" : "Pagos hoy"}
          value={pagos.length}
          caption={pagos.length > 0 ? formatMoney(totalCobradoHoy) : undefined}
          accent="amber"
          icon={<IconCash />}
          href="/panel/caja"
        />
      </div>

      {/* Lo que hay que resolver: a quién cobrarle */}
      {(porVencer.length > 0 || vencidosSinRenovar.length > 0) && (
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <section className="flex flex-col min-w-0">
            <ListHeader
              title="Hay que cobrarles"
              count={porVencer.length}
              hint="Les quedan 2 entradas o menos, o el pase vence en 3 días."
              tone="amber"
            />
            {porVencer.length === 0 ? (
              <p className="py-3 text-tiny text-txt-faint">Nadie por ahora.</p>
            ) : (
              <ul className={`${SCROLL_LIST} grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))]`}>
                {porVencer.map((m) => (
                  <ListRow
                    key={m.id}
                    member={m}
                    action={
                      <WhatsAppLink
                        phone={m.phone}
                        name={m.full_name}
                      />
                    }
                  >
                    {m.uses_total != null && m.uses_remaining != null ? (
                      <div className="w-28 sm:w-36 shrink-0">
                        <UsesTally total={m.uses_total} remaining={m.uses_remaining} size="sm" />
                      </div>
                    ) : null}
                  </ListRow>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col min-w-0">
            <ListHeader
              title="Vencidos sin renovar"
              count={vencidosSinRenovar.length}
              hint="Se les venció el pase en el último mes y no pueden entrar hasta que paguen."
              tone="red"
            />
            {vencidosSinRenovar.length === 0 ? (
              <p className="py-3 text-tiny text-txt-faint">Nadie por ahora.</p>
            ) : (
              <ul className={`${SCROLL_LIST} grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))]`}>
                {vencidosSinRenovar.map((m) => (
                  <ListRow
                    key={m.id}
                    member={m}
                    subtitle={
                      <span className="text-plate-red">
                        {m.effective_status === "exhausted"
                          ? "Sin entradas"
                          : `Venció el ${formatDayMonth(m.period_end)}`}
                      </span>
                    }
                    action={
                      <WhatsAppLink
                        phone={m.phone}
                        name={m.full_name}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {inactivos.length > 0 && (
        <section className="flex flex-col min-w-0">
          <ListHeader
            title={`No vienen hace ${INACTIVE_DAYS} días o más`}
            count={inactivos.length}
            hint="Tienen el pase al día pero hace rato que no entran. Un mensaje a tiempo ayuda a que no lo dejen."
            tone="neutral"
            action={
              <Link
                href="/panel/socios?f=inactivos"
                className="text-tiny font-medium text-plate-blue hover:underline underline-offset-4 shrink-0"
              >
                Ver todos
              </Link>
            }
          />
          <ul className={`${SCROLL_LIST} grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))]`}>
            {inactivos.slice(0, INACTIVE_LIMIT).map(({ m, days }) => {
              const neverCame = !cameDuringCurrentPass(m);
              return (
                <ListRow
                  key={m.id}
                  member={m}
                  subtitle={
                    <span className="text-txt-faint">
                      {neverCame
                        ? `No vino en este pase · ${days} días`
                        : `Hace ${days} días que no viene`}
                    </span>
                  }
                  action={
                    <WhatsAppLink
                      phone={m.phone}
                      name={m.full_name}
                    />
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      {cumpleañosHoy.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-line">
            <h2 className="h3">Hoy cumplen años 🎂</h2>
            <Link href="/panel/cumpleanos" className="text-tiny font-medium text-plate-blue hover:underline underline-offset-4 shrink-0">
              Ver todos
            </Link>
          </div>
          <p className="mt-2 text-tiny text-txt-faint">
            Saludalos vos — el kiosco también se lo va a decir cuando entren.
          </p>

          <ul className="mt-1 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cumpleañosHoy.map((m) => (
              <li key={m.id} className="flex items-center gap-1">
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="flex-1 min-w-0 py-2.5 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={32} />
                  <span className="flex-1 min-w-0 truncate text-base group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                </Link>
                <WhatsAppLink
                  phone={m.phone}
                  name={m.full_name}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-line">
          <h2 className="h3">Entradas de hoy</h2>
          <span className="num text-tiny text-txt-faint">{entraronHoy.length}</span>
        </div>

        {entraronHoy.length === 0 ? (
          <p className="py-4 text-tiny text-txt-faint">
            Todavía no entró nadie hoy.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {entraronHoy.map((m) => (
              <li key={m.id} className="border-b border-line">
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-2.5 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={32} />
                  <span className="flex-1 min-w-0 truncate text-base group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="num text-tiny text-txt-faint shrink-0">
                    {formatTime(m.last_check_in_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="card p-4 sm:p-5">
          <h2 className="h3 mb-4">Entradas de la semana</h2>
          <WeeklyAttendanceChart data={attendanceData} />
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="h3 mb-4">Facturación de la semana</h2>
          <WeeklyRevenueChart data={revenueData} />
        </section>
      </div>
    </div>
  );
}

// Las listas de cobro se llenan a lo ancho (tantas columnas como entren) y
// recién cuando pasan el alto máximo se scrollea adentro.
const SCROLL_LIST =
  "grid gap-x-8 content-start max-h-[22rem] overflow-y-auto overflow-x-hidden";

function ListRow({
  member: m,
  subtitle,
  action,
  children,
}: {
  member: DashboardMember;
  subtitle?: React.ReactNode;
  /** Va al lado del link a la ficha, no adentro (p. ej. WhatsApp). */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const due = (m.days_left ?? 99) <= 3 ? dueLabel(m.days_left, m.period_end) : null;
  return (
    <li className="border-b border-line flex items-center gap-1">
      <Link
        href={`/panel/socios/${m.id}`}
        className="flex-1 min-w-0 py-2 min-h-12 flex items-center gap-3 group"
      >
        <Avatar name={m.full_name} url={m.photo_url} size={28} />
        <span className="flex-1 sm:flex-none sm:w-44 min-w-0">
          <span className="block truncate text-base leading-tight group-hover:text-plate-blue transition-colors">
            {m.full_name}
          </span>
          {(subtitle ?? due) && (
            <span
              className={`block mt-0.5 text-micro leading-tight ${
                (m.days_left ?? 99) <= 1 ? "text-plate-red" : "text-txt-faint"
              }`}
            >
              {subtitle ?? due}
            </span>
          )}
        </span>
        {children}
      </Link>
      {action}
    </li>
  );
}

function ListHeader({
  title,
  count,
  hint,
  tone,
  action,
}: {
  title: string;
  count: number;
  hint: string;
  tone: "amber" | "red" | "neutral";
  action?: React.ReactNode;
}) {
  const dot =
    tone === "amber" ? "bg-plate-amber" : tone === "red" ? "bg-plate-red" : "bg-line-strong";
  return (
    <div className="pb-3 border-b border-line">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
        <h2 className="h3">{title}</h2>
        <span className="num text-tiny text-txt-faint">{count}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <p className="mt-0.5 text-tiny text-txt-faint">{hint}</p>
    </div>
  );
}
