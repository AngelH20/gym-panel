import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import type { Payment, CashClosing, CashOpening } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import {
  formatMoney,
  formatTime,
  formatDate,
  formatDateTime,
  todayLocal,
  paymentMethodLabel,
} from "@/lib/labels";
import { EmptyState } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { CloseRegisterForm } from "./CloseRegisterForm";
import { OpenRegisterForm } from "./OpenRegisterForm";
import { VoidSaleButton } from "./VoidSaleButton";
import { MoreOptions } from "./MoreOptions";

type PaymentRow = Payment & { members: { full_name: string } | null };

/** Las filas de una misma venta comparten pase. Si el pase se borró, la fila
 *  queda sola. */
function saleKey(p: Payment) {
  return p.membership_id ?? p.id;
}

function memberName(p: PaymentRow) {
  return p.members?.full_name ?? p.member_name ?? "Socio eliminado";
}

/** "YYYY-MM-DD" + N días, sin pasar por Date/huso horario. */
function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; ver?: string }>;
}) {
  const { date: dateParam, ver } = await searchParams;
  // "Más opciones": otras vistas de la misma pantalla.
  const showVoids = ver === "anulados";
  const showManage = ver === "anular";
  const today = todayLocal();
  const date = dateParam ?? today;
  const isToday = date === today;

  const supabase = await createClient();

  const [
    { data: paymentsRaw },
    { data: closingRaw },
    { data: openingRaw },
    { data: historyRaw },
    role,
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
      // Cacheado por request: el layout ya lo pidió, no es otro viaje.
      getCurrentAdminRole(),
      // Los anulados solo se piden cuando se abre esa vista.
      showVoids
        ? supabase
            .from("payments")
            .select("*, members(full_name)")
            .not("voided_at", "is", null)
            .order("voided_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as PaymentRow[] }),
    ]);

  const payments = (paymentsRaw ?? []) as PaymentRow[];
  const closing = closingRaw as CashClosing | null;
  const opening = openingRaw as CashOpening | null;
  const history = (historyRaw ?? []) as CashClosing[];
  const isManager = isManagerRole(role);
  const active = payments.filter((p) => !p.voided_at);

  // Lo que suma cada venta (un pago mixto son dos filas con el mismo pase).
  const saleTotals = new Map<string, { cents: number; rows: number }>();
  for (const p of active) {
    const s = saleTotals.get(saleKey(p)) ?? { cents: 0, rows: 0 };
    s.cents += p.amount_cents;
    s.rows += 1;
    saleTotals.set(saleKey(p), s);
  }

  // Una anulación de un pago mixto son dos filas: se muestra una sola vez.
  const voidsBySale = new Map<string, PaymentRow>();
  for (const v of (voidsRaw ?? []) as PaymentRow[]) {
    const key = `${saleKey(v)}|${v.voided_at}`;
    const prev = voidsBySale.get(key);
    if (prev) prev.amount_cents += v.amount_cents;
    else voidsBySale.set(key, { ...v });
  }
  const voids = [...voidsBySale.values()];

  if (showVoids) return <VoidsView voids={voids} />;

  // Anular es solo de dueño o programador (la base igual lo exige).
  if (showManage && isManager) {
    const voidedCents = payments
      .filter((p) => p.voided_at)
      .reduce((sum, p) => sum + p.amount_cents, 0);
    const activeCents = active.reduce((sum, p) => sum + p.amount_cents, 0);
    return (
      <ManageView
        date={date}
        isToday={isToday}
        payments={active}
        saleTotals={saleTotals}
        activeCents={activeCents}
        voidedCents={voidedCents}
      />
    );
  }

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
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description="Caja y movimientos del día."
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={`/panel/caja?date=${shiftDate(date, -1)}`}
              className="btn-ghost btn-sm px-2"
              aria-label="Día anterior"
              title="Día anterior"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
            <span className="min-w-[7.5rem] px-1 text-center num text-base font-medium">
              {formatDate(date)}
              {isToday && <span className="ml-1 text-tiny font-normal text-txt-faint">(hoy)</span>}
            </span>
            {!isToday ? (
              <Link
                href={`/panel/caja?date=${shiftDate(date, 1)}`}
                className="btn-ghost btn-sm px-2"
                aria-label="Día siguiente"
                title="Día siguiente"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            ) : (
              <span className="btn-ghost btn-sm px-2 invisible" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </span>
            )}
            <MoreOptions
              items={[
                  ...(isManager
                    ? [
                        {
                          href: `/panel/caja?ver=anular&date=${date}`,
                          label: isToday ? "Anular movimientos de hoy" : "Anular movimientos de este día",
                          hint: "Sacar un cobro de la caja (queda registrado)",
                        },
                      ]
                    : []),
                {
                  href: "/panel/caja?ver=anulados",
                  label: "Cobros anulados",
                  hint: "Quién anuló cada venta, cuándo y por qué",
                },
                ...(payments.length > 0
                  ? [
                      {
                        href: `/panel/caja/export?date=${date}`,
                        label: "Exportar este día",
                        hint: "Planilla CSV con los movimientos",
                        download: true,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        }
      />

      <section className="card">
        <div className="px-5 pt-5 flex items-center justify-between gap-3">
          <h2 className="h3">Estado de caja</h2>
          <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-txt-soft">
            <span
              className={`size-2 rounded-full ${
                closing ? "bg-line-strong" : opening ? "bg-plate-green" : "bg-plate-amber"
              }`}
              aria-hidden="true"
            />
            {closing ? "Cerrada" : opening ? "Abierta" : "Sin abrir"}
          </span>
        </div>

        {opening && !closing ? (
          <div className="px-5 pt-4 pb-5 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">Efectivo en caja</p>
              <p className="mt-1 num text-huge font-semibold [overflow-wrap:anywhere]">
                {formatMoney(expectedCashCents)}
              </p>
              <p className="mt-0.5 text-tiny text-txt-faint">
                Apertura + ventas en efectivo
              </p>
            </div>
            <div className="text-right">
              <p className="text-tiny text-txt-faint">Monto de apertura</p>
              <p className="mt-0.5 num text-base font-medium">
                {formatMoney(opening.starting_cash_cents)}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-4" aria-hidden="true" />
        )}

        <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
          <div className="px-3 sm:px-5 py-4 min-w-0">
            <dt className="eyebrow truncate">Efectivo</dt>
            <dd className="mt-0.5 num text-base sm:text-lg font-medium [overflow-wrap:anywhere]">{formatMoney(totals.cash)}</dd>
          </div>
          <div className="px-3 sm:px-5 py-4 min-w-0">
            <dt className="eyebrow truncate">Transferencia</dt>
            <dd className="mt-0.5 num text-base sm:text-lg font-medium [overflow-wrap:anywhere]">{formatMoney(totals.transfer)}</dd>
          </div>
          <div className="px-3 sm:px-5 py-4 min-w-0">
            <dt className="eyebrow truncate text-txt">Total</dt>
            <dd className="mt-0.5 num text-base sm:text-lg font-semibold [overflow-wrap:anywhere]">{formatMoney(total)}</dd>
          </div>
        </dl>

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
                    {", "}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Reabrir una caja ya cerrada borra el cierre: solo dueño o programador. */}
          {(!closing || isManager) && <OpenRegisterForm />}
          <CloseRegisterForm expectedCashCents={expectedCashCents} />
        </div>
      )}

      {/* Los dos listados, lado a lado en escritorio para no dejar media
          pantalla vacía */}
      {/* Los dos listados con la misma altura; cada uno se scrollea por
          dentro si no entra. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className={LIST_CARD}>
        <h2 className="h3 mb-3 shrink-0">
          Movimientos de esta caja <span className="num font-normal text-txt-faint">{active.length}</span>
        </h2>

        {payments.length === 0 ? (
          <EmptyState
            title="Sin ventas"
            description="Todavía no se registró ninguna venta este día."
          />
        ) : (
          <ul className={`datalist ${LIST_SCROLL}`}>
            {payments.map((p) => {
              return (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3">
                  <div className={`flex-1 min-w-0 ${p.voided_at ? "opacity-60" : ""}`}>
                    <p className={`text-base truncate ${p.voided_at ? "line-through" : ""}`}>
                      {memberName(p)}
                    </p>
                    <p className="mt-0.5 text-tiny text-txt-faint">
                      {p.plan_name} · {paymentMethodLabel[p.method]} · {formatTime(p.paid_at)}
                      {p.created_by_name && <> · Cobró: {p.created_by_name}</>}
                    </p>
                    {p.voided_at && (
                      <p className="mt-0.5 text-tiny text-plate-red">
                        Anulado por {p.voided_by_name ?? "un admin"} el{" "}
                        {formatDateTime(p.voided_at)}
                        {p.void_reason ? ` — "${p.void_reason}"` : ""}
                      </p>
                    )}
                  </div>
                  <span
                    className={`num text-base font-medium shrink-0 ${
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

      <section className={LIST_CARD}>
        <h2 className="h3 mb-3 shrink-0">
          Historial de cajas <span className="num font-normal text-txt-faint">{history.length}</span>
        </h2>

        {history.length === 0 ? (
          <p className="text-base text-txt-soft">Todavía no se cerró ninguna caja.</p>
        ) : (
          <ul className={`datalist ${LIST_SCROLL}`}>
            {history.map((h) => (
              <li key={h.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  href={`/panel/caja?date=${h.closing_date}`}
                  className="min-w-0 hover:text-plate-blue transition-colors"
                >
                  <p className="num text-base">{formatDate(h.closing_date)}</p>
                  <p className="mt-0.5 text-tiny text-txt-faint">
                    Efvo. {formatMoney(h.total_cash_cents)} · Transf.{" "}
                    {formatMoney(h.total_transfer_cents)} · {h.payments_count}{" "}
                    {h.payments_count === 1 ? "venta" : "ventas"}
                  </p>
                </Link>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="num text-base font-medium">
                    {formatMoney(h.total_cash_cents + h.total_transfer_cents)}
                  </span>
                  <a
                    href={`/panel/caja/export?date=${h.closing_date}`}
                    title="Descargar CSV"
                    aria-label="Descargar CSV"
                    className="flex size-9 items-center justify-center rounded-control text-txt-faint hover:text-txt hover:bg-surface-hover transition-colors"
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

    </div>
  );
}

const LIST_CARD = "card p-5 flex flex-col h-[26rem] lg:h-[34rem]";
const LIST_SCROLL = "flex-1 min-h-0 overflow-y-auto -mr-3 pr-3 [scrollbar-gutter:stable]";

/** Caja → Más opciones → Cobros anulados. */
function VoidsView({ voids }: { voids: PaymentRow[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobros anulados"
        description="Quién anuló cada venta, cuándo y por qué. Las más recientes primero."
        actions={<BackToCaja href="/panel/caja" />}
      />

      <section className="card p-5">
        {voids.length === 0 ? (
          <EmptyState title="Sin anulaciones" description="Todavía no se anuló ningún cobro." />
        ) : (
          <ul className="datalist">
            {voids.map((v) => (
              <li key={v.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-medium truncate">
                    {memberName(v)}
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
                      className="underline-offset-2 hover:underline hover:text-plate-blue transition-colors"
                    >
                      {formatDate(v.local_date)}
                    </Link>
                  </p>
                  {v.void_reason && (
                    <p className="mt-0.5 text-tiny text-txt-soft">“{v.void_reason}”</p>
                  )}
                </div>
                <span className="num text-base font-medium shrink-0 line-through text-txt-faint">
                  {formatMoney(v.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Caja → Más opciones → Anular movimientos (dueño o programador). Una fila
 *  por venta: un pago mixto son dos movimientos y se anulan juntos. */
function ManageView({
  date,
  isToday,
  payments,
  saleTotals,
  activeCents,
  voidedCents,
}: {
  date: string;
  isToday: boolean;
  payments: PaymentRow[];
  saleTotals: Map<string, { cents: number; rows: number }>;
  activeCents: number;
  voidedCents: number;
}) {
  const seen = new Set<string>();
  const sales = payments.filter((p) => {
    const k = saleKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isToday ? "Anular movimientos de hoy" : `Anular movimientos del ${formatDate(date)}`}
        description="El cobro sale del total de la caja y queda registrado en Cobros anulados: quién lo anuló, cuándo y por qué."
        actions={<BackToCaja href={`/panel/caja?date=${date}`} />}
      />

      <dl className="card grid grid-cols-2 divide-x divide-line">
        <div className="px-5 py-4 min-w-0">
          <dt className="eyebrow">Total de la caja</dt>
          <dd className="mt-0.5 num text-lg font-semibold">{formatMoney(activeCents)}</dd>
        </div>
        <div className="px-5 py-4 min-w-0">
          <dt className="eyebrow">Anulado {isToday ? "hoy" : "ese día"}</dt>
          <dd className="mt-0.5 num text-lg font-medium text-txt-soft">
            {voidedCents > 0 ? `− ${formatMoney(voidedCents)}` : formatMoney(0)}
          </dd>
        </div>
      </dl>

      <section className="card p-5">
        {sales.length === 0 ? (
          <EmptyState title="Nada para anular" description="No hay cobros vigentes en este día." />
        ) : (
          <ul className="datalist">
            {sales.map((p) => {
              const sale = saleTotals.get(saleKey(p)) ?? { cents: p.amount_cents, rows: 1 };
              return (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-base truncate">{memberName(p)}</p>
                    <p className="mt-0.5 text-tiny text-txt-faint">
                      {p.plan_name} ·{" "}
                      {sale.rows > 1 ? "Efectivo + transferencia" : paymentMethodLabel[p.method]} ·{" "}
                      {formatTime(p.paid_at)}
                    </p>
                  </div>
                  <VoidSaleButton paymentId={p.id} saleTotalCents={sale.cents} isSplit={sale.rows > 1} />
                  <span className="num text-base font-medium shrink-0">{formatMoney(sale.cents)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Volver a la pantalla principal de Caja. Es un <a> común (recarga la
 *  página) a propósito: vuelve siempre, con los totales recién calculados. */
function BackToCaja({ href }: { href: string }) {
  return (
    <a href={href} className="btn-ghost btn-sm gap-1.5 border border-line">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5m6-6-6 6 6 6" />
      </svg>
      Volver a la caja
    </a>
  );
}
