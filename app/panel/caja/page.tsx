import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Payment, CashClosing, CashOpening } from "@/lib/types";
import {
  formatMoney,
  formatTime,
  formatDate,
  formatDateTime,
  todayLocal,
  paymentMethodLabel,
} from "@/lib/labels";
import { EmptyState } from "@/components/Form";
import { StatCard } from "@/components/StatCard";
import { IconCash, IconTransfer, IconWallet, IconActivity } from "@/components/icons";
import { CloseRegisterForm } from "./CloseRegisterForm";
import { OpenRegisterForm } from "./OpenRegisterForm";
import { VoidSaleButton } from "./VoidSaleButton";

type PaymentRow = Payment & { members: { full_name: string } | null };

/** "YYYY-MM-DD" + N días, sin pasar por Date/huso horario. */
function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = todayLocal();
  const date = dateParam ?? today;
  const isToday = date === today;

  const supabase = await createClient();

  const [
    { data: paymentsRaw },
    { data: closingRaw },
    { data: openingRaw },
    { data: historyRaw },
    { data: role },
    { data: voidsRaw },
  ] = await Promise.all([
      supabase
        .from("payments")
        .select("*, members(full_name)")
        .eq("local_date", date)
        .order("paid_at", { ascending: false }),
      supabase.from("cash_closings").select("*").eq("closing_date", date).maybeSingle(),
      supabase.from("cash_openings").select("*").eq("opening_date", date).maybeSingle(),
      supabase
        .from("cash_closings")
        .select("*")
        .order("closing_date", { ascending: false })
        .limit(30),
      supabase.rpc("current_admin_role"),
      supabase
        .from("payments")
        .select("*, members(full_name)")
        .not("voided_at", "is", null)
        .order("voided_at", { ascending: false })
        .limit(40),
    ]);

  const payments = (paymentsRaw ?? []) as PaymentRow[];
  const closing = closingRaw as CashClosing | null;
  const opening = openingRaw as CashOpening | null;
  const history = (historyRaw ?? []) as CashClosing[];
  const isManager = role === "superadmin" || role === "admin";
  const active = payments.filter((p) => !p.voided_at);

  // Lo que suma cada venta (un pago mixto son dos filas con el mismo pase).
  const saleTotals = new Map<string, { cents: number; rows: number }>();
  for (const p of active) {
    const s = saleTotals.get(p.membership_id) ?? { cents: 0, rows: 0 };
    s.cents += p.amount_cents;
    s.rows += 1;
    saleTotals.set(p.membership_id, s);
  }

  // Una anulación de un pago mixto son dos filas: se muestra una sola vez.
  const voidsBySale = new Map<string, PaymentRow>();
  for (const v of (voidsRaw ?? []) as PaymentRow[]) {
    const key = `${v.membership_id}|${v.voided_at}`;
    const prev = voidsBySale.get(key);
    if (prev) prev.amount_cents += v.amount_cents;
    else voidsBySale.set(key, { ...v });
  }
  const voids = [...voidsBySale.values()];

  const totals = closing
    ? { cash: closing.total_cash_cents, transfer: closing.total_transfer_cents }
    : {
        cash: active
          .filter((p) => p.method === "cash")
          .reduce((s, p) => s + p.amount_cents, 0),
        transfer: active
          .filter((p) => p.method === "transfer")
          .reduce((s, p) => s + p.amount_cents, 0),
      };
  const total = totals.cash + totals.transfer;
  const expectedCashCents = (opening?.starting_cash_cents ?? 0) + totals.cash;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Caja</h1>
        <p className="mt-1.5 text-base text-txt-soft max-w-prose">
          Caja y movimientos del día.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={`/panel/caja?date=${shiftDate(date, -1)}`} className="btn-ghost btn-sm">
          ← Anterior
        </Link>
        <span className="font-mono text-base font-medium">
          {formatDate(date)}
          {isToday && <span className="ml-1.5 text-txt-faint font-sans font-normal">(hoy)</span>}
        </span>
        {!isToday ? (
          <Link href={`/panel/caja?date=${shiftDate(date, 1)}`} className="btn-ghost btn-sm">
            Siguiente →
          </Link>
        ) : (
          <span className="btn-ghost btn-sm invisible">Siguiente →</span>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="h3">Estado de caja</h2>
            <span
              className={`badge mt-2 ${
                closing
                  ? "border-line-strong bg-surface-sunk text-txt-soft"
                  : opening
                    ? "border-plate-green/35 bg-plate-green/12 text-plate-green"
                    : "border-plate-amber/35 bg-plate-amber/15 text-plate-amberInk"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  closing ? "bg-txt-faint" : opening ? "bg-plate-green" : "bg-plate-amber"
                }`}
              />
              {closing ? "Cerrada" : opening ? "Abierta" : "Sin abrir"}
            </span>
          </div>
        </div>

        {opening && !closing && (
          <div className="mx-5 mb-5 rounded-control border border-plate-green/25 bg-plate-green/8 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow text-plate-green">Efectivo en caja</p>
              <p className="mt-1 font-mono text-huge font-semibold text-plate-green leading-none">
                {formatMoney(expectedCashCents)}
              </p>
              <p className="mt-1.5 text-tiny text-plate-green/80">
                Apertura + ventas en efectivo
              </p>
            </div>
            <div className="text-right">
              <p className="text-tiny text-txt-soft">Monto de apertura</p>
              <p className="mt-1 font-mono text-base font-medium">
                {formatMoney(opening.starting_cash_cents)}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          <div className="p-4 text-center">
            <p className="eyebrow">Efectivo</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatMoney(totals.cash)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="eyebrow">Transferencia</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatMoney(totals.transfer)}</p>
          </div>
          <div className="p-4 text-center bg-surface-sunk">
            <p className="eyebrow">Total</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatMoney(total)}</p>
          </div>
        </div>

        {closing && (
          <div className="px-5 py-3 border-t border-line text-tiny text-txt-soft space-y-1">
            <p>
              Cerrada a las {formatTime(closing.closed_at)}
              {closing.notes ? ` — "${closing.notes}"` : ""}
            </p>
            {closing.counted_cash_cents != null && closing.difference_cents != null && (
              <p>
                Efectivo contado: {formatMoney(closing.counted_cash_cents)}
                {closing.difference_cents !== 0 && (
                  <span className={closing.difference_cents > 0 ? "text-plate-blue" : "text-plate-red"}>
                    {" · "}
                    {closing.difference_cents > 0
                      ? `sobraron ${formatMoney(closing.difference_cents)}`
                      : `faltaron ${formatMoney(-closing.difference_cents)}`}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {isToday && (
        <div className="grid sm:grid-cols-2 gap-3">
          <OpenRegisterForm />
          <CloseRegisterForm expectedCashCents={expectedCashCents} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Efectivo" value={formatMoney(totals.cash)} accent="green" icon={<IconCash />} />
        <StatCard
          label="Transferencia"
          value={formatMoney(totals.transfer)}
          accent="blue"
          icon={<IconTransfer />}
        />
        <StatCard label="Balance" value={formatMoney(total)} accent="amber" icon={<IconWallet />} />
      </div>

      {/* Los dos listados, lado a lado en escritorio para no dejar media
          pantalla vacía */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="h3 flex items-center gap-2">
            <IconActivity className="size-4 text-txt-faint" />
            Movimientos de esta caja ({active.length})
          </h2>
          {payments.length > 0 && (
            <a href={`/panel/caja/export?date=${date}`} className="btn-ghost btn-sm">
              Exportar
            </a>
          )}
        </div>

        {payments.length === 0 ? (
          <EmptyState
            title="Sin ventas"
            description="Todavía no se registró ninguna venta este día."
          />
        ) : (
          <ul className="datalist">
            {payments.map((p) => {
              const sale = saleTotals.get(p.membership_id);
              return (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3">
                  <div className={`flex-1 min-w-0 ${p.voided_at ? "opacity-60" : ""}`}>
                    <p className={`text-base font-medium truncate ${p.voided_at ? "line-through" : ""}`}>
                      {p.members?.full_name ?? "Socio eliminado"}
                    </p>
                    <p className="mt-0.5 text-tiny text-txt-faint">
                      {p.plan_name} · {paymentMethodLabel[p.method]} · {formatTime(p.paid_at)}
                    </p>
                    {p.voided_at && (
                      <p className="mt-0.5 text-tiny text-plate-red">
                        Anulado por {p.voided_by_name ?? "un admin"} el{" "}
                        {formatDateTime(p.voided_at)}
                        {p.void_reason ? ` — "${p.void_reason}"` : ""}
                      </p>
                    )}
                  </div>
                  {isManager && !p.voided_at && sale && (
                    <VoidSaleButton
                      paymentId={p.id}
                      saleTotalCents={sale.cents}
                      isSplit={sale.rows > 1}
                    />
                  )}
                  <span
                    className={`font-mono text-base font-medium shrink-0 ${
                      p.voided_at ? "line-through text-txt-faint" : ""
                    }`}
                  >
                    {formatMoney(p.amount_cents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="h3 mb-3">Historial de cajas</h2>

        {history.length === 0 ? (
          <p className="text-base text-txt-soft">Todavía no se cerró ninguna caja.</p>
        ) : (
          <ul className="datalist">
            {history.map((h) => (
              <li key={h.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  href={`/panel/caja?date=${h.closing_date}`}
                  className="min-w-0 hover:text-plate-blue transition-colors"
                >
                  <p className="text-base font-medium">{formatDate(h.closing_date)}</p>
                  <p className="mt-0.5 text-tiny text-txt-faint">
                    Efvo. {formatMoney(h.total_cash_cents)} · Transf.{" "}
                    {formatMoney(h.total_transfer_cents)} · {h.payments_count}{" "}
                    {h.payments_count === 1 ? "venta" : "ventas"}
                  </p>
                </Link>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-base font-medium">
                    {formatMoney(h.total_cash_cents + h.total_transfer_cents)}
                  </span>
                  <a
                    href={`/panel/caja/export?date=${h.closing_date}`}
                    title="Descargar CSV"
                    className="text-txt-faint hover:text-plate-blue transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>

      {voids.length > 0 && (
        <section className="card p-5">
          <h2 className="h3 mb-1">Cobros anulados</h2>
          <p className="mb-3 text-tiny text-txt-soft">
            Quién anuló cada venta, cuándo y por qué. Las más recientes primero.
          </p>
          <ul className="datalist">
            {voids.map((v) => (
              <li key={v.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-medium truncate">
                    {v.members?.full_name ?? "Socio eliminado"}
                    <span className="font-normal text-txt-faint"> · {v.plan_name}</span>
                  </p>
                  <p className="mt-0.5 text-tiny text-txt-faint">
                    Anulado por{" "}
                    <span className="font-medium text-txt-soft">
                      {v.voided_by_name ?? "un admin"}
                    </span>{" "}
                    el {formatDateTime(v.voided_at)} · venta del{" "}
                    <Link
                      href={`/panel/caja?date=${v.local_date}`}
                      className="hover:text-plate-blue transition-colors"
                    >
                      {formatDate(v.local_date)}
                    </Link>
                  </p>
                  {v.void_reason && (
                    <p className="mt-0.5 text-tiny text-txt-soft">“{v.void_reason}”</p>
                  )}
                </div>
                <span className="font-mono text-base font-medium shrink-0 line-through text-txt-faint">
                  {formatMoney(v.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
