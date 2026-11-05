import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Payment, CashClosing, CashOpening } from "@/lib/types";
import { formatDate, formatDateTime, paymentMethodLabel, todayLocal } from "@/lib/labels";
import { cashMovementKindLabel, fetchCashMovements, movementTotalsFor } from "@/lib/cashMovements";

/** Envuelve en comillas si hace falta (coma, comilla o salto de línea adentro).
 *
 *  Los textos que empiezan con = + - @ (o tab / retorno de carro) Excel los
 *  toma como fórmula al abrir el CSV: un socio cargado con nombre
 *  `=HYPERLINK("http://...")` ejecutaría eso en la compu del que exporta la
 *  caja. Se les antepone una comilla simple para que queden como texto. Los
 *  números (montos, que pueden ser negativos) no pasan por acá. */
function csvField(value: string | number): string {
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",") + "\r\n";
}

/**
 * CSV del día: detalle de cada pago + resumen de efectivo/transferencia/total.
 *
 * El middleware solo exige sesión y el layout de /panel no corre para los
 * route handlers, así que el rol se chequea acá (en paralelo con las
 * consultas, que igual pasan por la RLS).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get("date");
  // La fecha termina en el nombre del archivo (Content-Disposition): solo
  // se acepta AAAA-MM-DD, nada de comillas ni saltos de línea.
  if (rawDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return new NextResponse("Fecha inválida", { status: 400 });
  }
  const date = rawDate ?? todayLocal();

  const supabase = await createClient();

  const [
    { data: role },
    { data: paymentsRaw },
    { data: closingRaw },
    { data: openingRaw },
    movements,
  ] = await Promise.all([
      supabase.rpc("current_admin_role"),
      supabase
        .from("payments")
        .select("*, members(full_name)")
        .eq("local_date", date)
        .order("paid_at", { ascending: true }),
      supabase.from("cash_closings").select("*").eq("closing_date", date).maybeSingle(),
      supabase.from("cash_openings").select("*").eq("opening_date", date).maybeSingle(),
      // Gastos e ingresos (sql/32). Si la tabla no existe, vacío.
      fetchCashMovements(supabase, date, true),
    ]);

  if (!role) return new NextResponse("No autorizado", { status: 403 });

  const payments = (paymentsRaw ?? []) as (Payment & {
    members: { full_name: string } | null;
  })[];
  const closing = closingRaw as CashClosing | null;
  const opening = openingRaw as CashOpening | null;

  const active = payments.filter((p) => !p.voided_at);
  const totals = closing
    ? { cash: closing.total_cash_cents, transfer: closing.total_transfer_cents }
    : {
        cash: active.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount_cents, 0),
        transfer: active
          .filter((p) => p.method === "transfer")
          .reduce((s, p) => s + p.amount_cents, 0),
      };
  const total = totals.cash + totals.transfer;

  let csv = "﻿"; // BOM: Excel abre bien los acentos con esto.
  csv += csvRow(["Caja del", formatDate(date)]);
  csv += csvRow([
    "Estado",
    closing
      ? `Cerrada a las ${formatDateTime(closing.closed_at)}`
      : opening
        ? `Abierta a las ${formatDateTime(opening.opened_at)}`
        : "Sin abrir",
  ]);
  csv += "\r\n";

  csv += csvRow(["Hora", "Socio", "Plan", "Método", "Monto", "Cobró", "Anulado"]);
  for (const p of payments) {
    csv += csvRow([
      formatDateTime(p.paid_at),
      p.members?.full_name ?? p.member_name ?? "Socio eliminado",
      p.plan_name,
      paymentMethodLabel[p.method],
      p.amount_cents / 100,
      // Vacío hasta que se corra sql/31_cobrado_por.sql (select * no la trae).
      p.created_by_name ?? "",
      p.voided_at
        ? `Sí, por ${p.voided_by_name ?? "un admin"} el ${formatDateTime(p.voided_at)}${
            p.void_reason ? ` (${p.void_reason})` : ""
          }`
        : "",
    ]);
  }

  // Gastos e ingresos: monto con signo (− gasto, + ingreso).
  const mov = movementTotalsFor(closing, movements);
  if (movements.length > 0) {
    csv += "\r\n";
    csv += csvRow(["Gastos e ingresos"]);
    csv += csvRow(["Hora", "Tipo", "Motivo", "Método", "Monto", "Cargó", "Anulado"]);
    for (const m of movements) {
      csv += csvRow([
        formatDateTime(m.created_at),
        cashMovementKindLabel[m.kind],
        m.reason,
        paymentMethodLabel[m.method],
        (m.kind === "expense" ? -m.amount_cents : m.amount_cents) / 100,
        m.created_by_name ?? "",
        m.voided_at
          ? `Sí, por ${m.voided_by_name ?? "un admin"} el ${formatDateTime(m.voided_at)}${
              m.void_reason ? ` (${m.void_reason})` : ""
            }`
          : "",
      ]);
    }
  }

  csv += "\r\n";
  if (opening) csv += csvRow(["Fondo inicial", opening.starting_cash_cents / 100]);
  csv += csvRow(["Efectivo", totals.cash / 100]);
  csv += csvRow(["Transferencia", totals.transfer / 100]);
  csv += csvRow(["Total", total / 100]);
  if (movements.length > 0) {
    csv += csvRow(["Ingresos en efectivo", mov.incomeCash / 100]);
    csv += csvRow(["Ingresos por transferencia", mov.incomeTransfer / 100]);
    csv += csvRow(["Gastos en efectivo", -mov.expenseCash / 100]);
    csv += csvRow(["Gastos por transferencia", -mov.expenseTransfer / 100]);
    csv += csvRow([
      "Neto del día",
      (total + mov.incomeCash + mov.incomeTransfer - mov.expenseCash - mov.expenseTransfer) / 100,
    ]);
    if (opening && !closing) {
      csv += csvRow([
        "Efectivo esperado",
        (opening.starting_cash_cents + totals.cash + mov.incomeCash - mov.expenseCash) / 100,
      ]);
    }
  }

  if (closing?.counted_cash_cents != null && closing.difference_cents != null) {
    csv += "\r\n";
    csv += csvRow(["Efectivo esperado", (closing.expected_cash_cents ?? 0) / 100]);
    csv += csvRow(["Efectivo contado", closing.counted_cash_cents / 100]);
    csv += csvRow(["Diferencia", closing.difference_cents / 100]);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="caja-${date}.csv"`,
      // Tiene cobros con nombres de socios: que no quede en ningún caché.
      "Cache-Control": "private, no-store",
    },
  });
}
