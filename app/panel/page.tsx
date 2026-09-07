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
import { formatTime, formatMoney, todayLocal, daysAgoLocal, weekdayShort } from "@/lib/labels";
import { WeeklyAttendanceChart, type DayCount } from "./WeeklyAttendanceChart";
import { WeeklyRevenueChart, type DayRevenue } from "./WeeklyRevenueChart";

const WEEK_LENGTH = 7;

// Plazo máximo del mes para renovar: pedido del cliente. Es solo un aviso
// visual en el panel — no cambia el vencimiento real de ningún pase.
const RENEWAL_DEADLINE_DAY = 10;

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

  const entraronHoy = all.filter((m) => m.checked_in_today);
  const movimientosHoy = all.reduce((sum, m) => sum + (m.visits_today ?? 0), 0);
  const totalCobradoHoy = pagos.reduce((sum, p) => sum + p.amount_cents, 0);
  const activos = all.filter((m) => m.effective_status === "active");
  const porVencer = activos.filter(
    (m) => (m.uses_remaining ?? 99) <= 2 || (m.days_left ?? 99) <= 3
  );
  const vencidos = all.filter(
    (m) => m.effective_status === "expired" || m.effective_status === "exhausted"
  );

  // El plazo del mes es el 10. Un socio "recién vencido" (ej: venció el 25)
  // todavía no incumplió esa fecha: su plazo real es el 10 del mes que viene.
  // Solo entran acá los que ya estaban sin pase antes de que llegara el 10
  // de este mes y siguen sin renovar.
  const deadlineThisMonth = `${today.slice(0, 7)}-${String(RENEWAL_DEADLINE_DAY).padStart(2, "0")}`;
  const pasoElPlazo = today > deadlineThisMonth;
  const vencidosPasadoElPlazo = vencidos.filter(
    (m) => m.period_end != null && m.period_end < deadlineThisMonth
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="h1">Panel</h1>
        <Link
          href="/panel/acceso"
          className="btn bg-plate-green bg-gradient-to-b from-white/15 to-white/0
                     text-white shadow-card hover:brightness-95 active:translate-y-px active:brightness-90
                     shrink-0"
        >
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

      {porVencer.length > 0 && (
        <section className="card p-5 border-plate-amber/40 bg-plate-amber/5">
          <h2 className="h3">Hay que cobrarles</h2>
          <p className="mt-1 mb-3 text-tiny text-txt-soft">
            Les quedan 2 entradas o menos, o el pase vence en 3 días.
          </p>

          <ul className="datalist">
            {porVencer.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-3 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={34} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  {m.uses_total != null && m.uses_remaining != null && (
                    <div className="w-24 shrink-0">
                      <UsesTally
                        total={m.uses_total}
                        remaining={m.uses_remaining}
                        size="sm"
                      />
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pasoElPlazo && vencidosPasadoElPlazo.length > 0 && (
        <section className="card p-5 border-plate-red/40 bg-plate-red/5">
          <div className="flex items-center gap-2">
            <span className="text-plate-red" aria-hidden="true">
              <IconFlag />
            </span>
            <h2 className="h3">Ya pasó el día {RENEWAL_DEADLINE_DAY}</h2>
          </div>
          <p className="mt-1 mb-3 text-tiny text-txt-soft">
            Ya estaban sin pase antes del día {RENEWAL_DEADLINE_DAY} de este mes y todavía no
            renovaron.
          </p>

          <ul className="datalist">
            {vencidosPasadoElPlazo.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-3 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={34} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="text-tiny text-plate-red font-medium shrink-0">
                    {m.effective_status === "exhausted" ? "Sin usos" : "Vencido"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="h3 mb-3">Entradas de hoy</h2>

        {entraronHoy.length === 0 ? (
          <p className="text-base text-txt-soft">
            Todavía no entró nadie hoy.
          </p>
        ) : (
          <ul className="datalist">
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
