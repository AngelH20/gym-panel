"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: boolean };

/** Tope para notas y motivos: texto libre que queda guardado en la caja. */
const MAX_TEXT = 500;

/** Precio en pesos (input del form) -> centavos. */
function parseAmountCents(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export async function openCashRegister(_prev: unknown, formData: FormData): Promise<Result> {
  const startingCashCents = parseAmountCents(formData.get("starting_cash"));
  if (startingCashCents == null) return { error: "Ingresá el fondo inicial en pesos." };

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > MAX_TEXT) return { error: `Las notas no pueden pasar de ${MAX_TEXT} caracteres.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_register", {
    p_starting_cash_cents: startingCashCents,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}

/**
 * Anula una venta (los dos movimientos si fue pago mixto). No borra nada:
 * queda tachada en la caja con quién, cuándo y por qué. Si la caja de ese
 * día ya estaba cerrada, la base recalcula sus totales.
 */
export async function voidSale(_prev: unknown, formData: FormData): Promise<Result> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribí el motivo de la anulación." };
  if (reason.length > MAX_TEXT) return { error: `El motivo no puede pasar de ${MAX_TEXT} caracteres.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", {
    p_payment_id: paymentId,
    p_reason: reason,
    p_cancel_membership: formData.get("cancel_membership") === "on",
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  revalidatePath("/panel");
  return { ok: true };
}

export async function closeCashRegister(_prev: unknown, formData: FormData): Promise<Result> {
  const countedCashCents = parseAmountCents(formData.get("counted_cash"));
  if (countedCashCents == null) return { error: "Ingresá el efectivo contado en pesos." };

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > MAX_TEXT) return { error: `Las notas no pueden pasar de ${MAX_TEXT} caracteres.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_register", {
    p_counted_cash_cents: countedCashCents,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}
