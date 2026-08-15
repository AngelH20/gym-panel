"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: boolean };

/** Precio en pesos (input del form) -> centavos. */
function parseAmountCents(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export async function openCashRegister(_prev: unknown, formData: FormData): Promise<Result> {
  const startingCashCents = parseAmountCents(formData.get("starting_cash"));
  if (startingCashCents == null) return { error: "Ingresá el fondo inicial en pesos." };

  const notes = String(formData.get("notes") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_register", {
    p_starting_cash_cents: startingCashCents,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}

export async function closeCashRegister(_prev: unknown, formData: FormData): Promise<Result> {
  const countedCashCents = parseAmountCents(formData.get("counted_cash"));
  if (countedCashCents == null) return { error: "Ingresá el efectivo contado en pesos." };

  const notes = String(formData.get("notes") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_register", {
    p_counted_cash_cents: countedCashCents,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}
