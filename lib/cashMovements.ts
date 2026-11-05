import type { createClient } from "@/lib/supabase/server";
import type { CashClosing, CashMovement, CashMovementKind } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Gastos e ingresos de caja (ver sql/32_cash_movements.sql). */

export const cashMovementKindLabel: Record<CashMovementKind, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

/** Tope de un gasto o ingreso, en pesos. Igual que el check de la tabla. */
export const MAX_MOVEMENT_PESOS = 10_000_000;
/** Largo máximo del motivo. Igual que el check de la tabla. */
export const MAX_MOVEMENT_REASON = 200;

export type MovementTotals = {
  incomeCash: number;
  incomeTransfer: number;
  expenseCash: number;
  expenseTransfer: number;
};

/**
 * Gastos e ingresos de un día. Si la consulta falla (por ejemplo, la tabla
 * todavía no existe porque no se aplicó sql/32), se toma como que no hubo
 * ninguno: la caja tiene que seguir andando igual.
 */
export async function fetchCashMovements(
  supabase: Supabase,
  date: string,
  ascending = false
): Promise<CashMovement[]> {
  try {
    const { data, error } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("local_date", date)
      .order("created_at", { ascending });
    if (error) return [];
    return (data ?? []) as CashMovement[];
  } catch {
    return [];
  }
}

/** Movimientos anulados, los más recientes primero (Más opciones → Cobros
 *  anulados). Mismo criterio: si falla, ninguno. */
export async function fetchVoidedCashMovements(
  supabase: Supabase,
  limit = 100
): Promise<CashMovement[]> {
  try {
    const { data, error } = await supabase
      .from("cash_movements")
      .select("*")
      .not("voided_at", "is", null)
      .order("voided_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as CashMovement[];
  } catch {
    return [];
  }
}

/** Suma de los movimientos vigentes (sin anulados), por tipo y medio. */
export function sumMovements(movements: CashMovement[]): MovementTotals {
  const t: MovementTotals = { incomeCash: 0, incomeTransfer: 0, expenseCash: 0, expenseTransfer: 0 };
  for (const m of movements) {
    if (m.voided_at) continue;
    if (m.kind === "income") {
      if (m.method === "cash") t.incomeCash += m.amount_cents;
      else t.incomeTransfer += m.amount_cents;
    } else {
      if (m.method === "cash") t.expenseCash += m.amount_cents;
      else t.expenseTransfer += m.amount_cents;
    }
  }
  return t;
}

/**
 * Totales de gastos e ingresos del día. Si la caja está cerrada, manda el
 * cierre (lo que quedó fijado, igual que con los cobros); si el cierre es de
 * antes de sql/32 y no trae las columnas, se calcula de los movimientos.
 */
export function movementTotalsFor(
  closing: CashClosing | null,
  movements: CashMovement[]
): MovementTotals {
  const live = sumMovements(movements);
  if (!closing) return live;
  return {
    incomeCash: closing.income_cash_cents ?? live.incomeCash,
    incomeTransfer: closing.income_transfer_cents ?? live.incomeTransfer,
    expenseCash: closing.expense_cash_cents ?? live.expenseCash,
    expenseTransfer: closing.expense_transfer_cents ?? live.expenseTransfer,
  };
}
