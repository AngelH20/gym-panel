import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Payment, CashClosing, CashOpening } from "@/lib/types";
import { formatDate, formatDateTime, paymentMethodLabel, todayLocal } from "@/lib/labels";

/** Envuelve en comillas si hace falta (coma, comilla o salto de línea adentro). */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",") + "\r\n";
}

/**
 * CSV del día: detalle de cada pago + resumen de efectivo/transferencia/total.
 * Protegida por el middleware de auth igual que el resto de /panel/*.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayLocal();

  const supabase = await createClient();

  const [{ data: paymentsRaw }, { data: closingRaw }, { data: openingRaw }] = await Promise.all([
    supabase
      .from("payments")
      .select("*, members(full_name)")
      .eq("local_date", date)
      .order("paid_at", { ascending: true }),
    supabase.from("cash_closings").select("*").eq("closing_date", date).maybeSingle(),
    supabase.from("cash_openings").select("*").eq("opening_date", date).maybeSingle(),
  ]);

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

  csv += csvRow(["Hora", "Socio", "Plan", "Método", "Monto", "Anulado"]);
  for (const p of payments) {
    csv += csvRow([
      formatDateTime(p.paid_at),
      p.members?.full_name ?? p.member_name ?? "Socio eliminado",
      p.plan_name,
      paymentMethodLabel[p.method],
      p.amount_cents / 100,
      p.voided_at
        ? `Sí, por ${p.voided_by_name ?? "un admin"} el ${formatDateTime(p.voided_at)}${
            p.void_reason ? ` (${p.void_reason})` : ""
          }`
        : "",
    ]);
  }

  csv += "\r\n";
  if (opening) csv += csvRow(["Fondo inicial", opening.starting_cash_cents / 100]);
  csv += csvRow(["Efectivo", totals.cash / 100]);
  csv += csvRow(["Transferencia", totals.transfer / 100]);
  csv += csvRow(["Total", total / 100]);

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
    },
  });
}
