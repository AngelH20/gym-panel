import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { UsesTally } from "@/components/UsesTally";
import { StatCard } from "@/components/StatCard";
import {
  IconPeople,
  IconPersonPlus,
  IconCheck,
  IconAlert,
  IconActivity,
  IconCash,
  IconSearch,
  IconQr,
  IconFlag,
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

const WEEK_LENGTH = 7;

// Cuánto tiempo sigue en "Vencidos sin renovar" alguien que no volvió. Pasado
// esto se asume que dejó el gimnasio y deja de ocupar el panel (sigue en
// Socios, con su estado).
const OVERDUE_WINDOW_DAYS = 30;

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

  const [{ data }, { data: paymentsToday }, { data: weekCheckIns }, { data: weekPayments }] =
    await Promise.all([
      supabase.from("member_overview").select("*"),
      supabase.from("payments").select("amount_cents, method").eq("local_date", today),
      supabase.from("check_ins").select("local_date").gte("local_date", weekStart),
      supabase
        .from("payments")
        .select("local_date, method, amount_cents")
        .gte("local_date", weekStart),
    ]);
  const all = (data ?? []) as MemberOverview[];
  const pagos = paymentsToday ?? [];

  // Los últimos 7 días, más viejo primero, con la etiqueta del eje ya lista.
  const week: { date: string; label: string }[] = Array.from({ length: WEEK_LENGTH }, (_, i) => {
    const date = daysAgoLocal(WEEK_LENGTH - 1 - i);
    return { date, label: weekdayShort(date) };
  });

  const checkInsByDay = new Map<string, number>();
  for (const c of weekCheckIns ?? []) {
    checkInsByDay.set(c.local_date, (checkInsByDay.get(c.local_date) ?? 0) + 1);
  }
  const attendanceData: DayCount[] = week.map((d) => ({
    ...d,
    count: checkInsByDay.get(d.date) ?? 0,
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

  // Cada socio vence en su propia fecha (ver sql/22_renewal_same_day.sql).
  // Acá van los que ya vencieron hace poco y todavía no renovaron; los de
  // hace más de un mes probablemente dejaron de venir.
  const overdueSince = daysAgoLocal(OVERDUE_WINDOW_DAYS);
  const vencidosSinRenovar = vencidos
    .filter((m) => m.period_end != null && m.period_end >= overdueSince)
    .sort((a, b) => (a.period_end ?? "").localeCompare(b.period_end ?? ""));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="h1">Panel</h1>
        <Link href="/panel/acceso" className="btn-success shrink-0">
          <IconQr />
          Código QR
        </Link>
      </div>

      {/*
        Solo en celular: para dejar el teléfono apoyado en el mostrador
        mostrando nada más que el QR (ver app/qr-movil/page.tsx). En
        escritorio no tiene sentido, por eso md:hidden.
      */}
      <Link
        href="/qr-movil"
        className="md:hidden card p-4 flex items-center gap-3 text-base font-medium
                   text-txt hover:bg-surface-hover transition-colors"
      >
        <span className="flex size-9 items-center justify-center rounded-control bg-plate-green/12 text-plate-green shrink-0">
          <IconQr className="size-4.5" />
        </span>
        <span className="flex-1 min-w-0">
          QR vista móvil
          <span className="block text-tiny font-normal text-txt-faint">
            Deja el celular mostrando solo el código para que la gente entre
          </span>
        </span>
      </Link>

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

      <section className="card p-2 grid grid-cols-3 divide-x divide-line">
        <QuickAction href="/panel/socios/nuevo" icon={<IconPersonPlus />} label="Nuevo socio" />
        <QuickAction href="/panel/caja" icon={<IconCash />} label="Ir a caja" />
        <QuickAction href="/panel/socios" icon={<IconSearch />} label="Buscar socio" />
      </section>

      {cumpleañosHoy.length > 0 && (
        <section className="card p-5 border-2 border-plate-amber/40 bg-plate-amber/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="h3">🎂 Hoy cumplen años</h2>
            <Link href="/panel/cumpleanos" className="text-tiny text-plate-blue hover:underline shrink-0">
              Ver todos
            </Link>
          </div>
          <p className="mt-1 mb-3 text-tiny text-txt-soft">
            Saludalos vos — el kiosco también se lo va a decir cuando entren.
          </p>

          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cumpleañosHoy.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-3 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={34} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(porVencer.length > 0 || vencidosSinRenovar.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-3 items-start">
          {porVencer.length > 0 && (
            <section
              className={`card p-4 border-plate-amber/40 bg-plate-amber/5 ${
                vencidosSinRenovar.length > 0 ? "lg:col-span-2" : "lg:col-span-3"
              }`}
            >
              <ListHeader
                title="Hay que cobrarles"
                count={porVencer.length}
                hint="2 entradas o menos, o vence en 3 días"
                tone="amber"
              />
              <ul
                className={`grid gap-x-4 sm:grid-cols-2 ${
                  vencidosSinRenovar.length > 0 ? "" : "xl:grid-cols-3"
                }`}
              >
                {porVencer.map((m) => (
                  <CompactRow key={m.id} member={m}>
                    {m.uses_total != null && m.uses_remaining != null ? (
                      <div className="w-20 shrink-0">
                        <UsesTally total={m.uses_total} remaining={m.uses_remaining} size="sm" />
                      </div>
                    ) : null}
                  </CompactRow>
                ))}
              </ul>
            </section>
          )}

          {vencidosSinRenovar.length > 0 && (
            <section
              className={`card p-4 border-plate-red/40 bg-plate-red/5 ${
                porVencer.length > 0 ? "" : "lg:col-span-3"
              }`}
            >
              <ListHeader
                title="Vencidos sin renovar"
                count={vencidosSinRenovar.length}
                hint="No pueden entrar hasta que paguen"
                tone="red"
                icon={<IconFlag />}
              />
              <ul
                className={`grid gap-x-4 ${
                  porVencer.length > 0 ? "" : "sm:grid-cols-2 xl:grid-cols-3"
                }`}
              >
                {vencidosSinRenovar.map((m) => (
                  <CompactRow
                    key={m.id}
                    member={m}
                    subtitle={
                      <span className="text-plate-red">
                        {m.effective_status === "exhausted"
                          ? "Sin entradas"
                          : `Venció el ${formatDayMonth(m.period_end)}`}
                      </span>
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="card p-5">
        <h2 className="h3 mb-3">Entradas de hoy</h2>

        {entraronHoy.length === 0 ? (
          <p className="text-base text-txt-soft">
            Todavía no entró nadie hoy.
          </p>
        ) : (
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {entraronHoy.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-3 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={34} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="font-mono text-tiny text-txt-faint shrink-0">
                    {formatTime(m.last_check_in_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="card p-5">
          <h2 className="h3 mb-3">Entradas de la semana</h2>
          <WeeklyAttendanceChart data={attendanceData} />
        </section>

        <section className="card p-5">
          <h2 className="h3 mb-3">Facturación de la semana</h2>
          <WeeklyRevenueChart data={revenueData} />
        </section>
      </div>
    </div>
  );
}

/** Fila de una línea para las listas de cobro: nombre, vencimiento y extra a la derecha. */
function CompactRow({
  member: m,
  subtitle,
  children,
}: {
  member: MemberOverview;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const due = (m.days_left ?? 99) <= 3 ? dueLabel(m.days_left, m.period_end) : null;
  return (
    <li className="border-b border-line/60 last:border-b-0">
      <Link
        href={`/panel/socios/${m.id}`}
        className="-mx-2 px-2 py-1.5 flex items-center gap-2.5 rounded-control group
                   hover:bg-surface/70 transition-colors"
      >
        <Avatar name={m.full_name} url={m.photo_url} size={26} />
        <span className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="truncate text-tiny font-medium text-txt group-hover:text-plate-blue transition-colors">
            {m.full_name}
          </span>
          <span
            className={`shrink-0 text-[11px] ${
              (m.days_left ?? 99) <= 1 ? "text-plate-red" : "text-txt-faint"
            }`}
          >
            {subtitle ?? due}
          </span>
        </span>
        {children}
      </Link>
    </li>
  );
}

function ListHeader({
  title,
  count,
  hint,
  tone,
  icon,
}: {
  title: string;
  count: number;
  hint: string;
  tone: "amber" | "red";
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2 flex-wrap">
      {icon && (
        <span className="text-plate-red self-center" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="h3">{title}</h2>
      <span
        className={`rounded-full px-2 text-[11px] font-semibold ${
          tone === "amber"
            ? "bg-plate-amber/20 text-plate-amberInk"
            : "bg-plate-red/12 text-plate-red"
        }`}
      >
        {count}
      </span>
      <span className="text-[11px] text-txt-faint">{hint}</span>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-2 rounded-control px-3 py-3
                 text-tiny font-medium text-txt-soft hover:text-txt hover:bg-surface-hover transition-colors"
    >
      <span className="text-plate-blue" aria-hidden="true">
        {icon}
      </span>
      {label}
    </Link>
  );
}
