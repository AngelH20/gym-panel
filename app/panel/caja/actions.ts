"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/labels";
import { MAX_MOVEMENT_PESOS, MAX_MOVEMENT_REASON } from "@/lib/cashMovements";

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

/**
 * Cierra la caja de hoy o, si viene `date` con un día anterior, la de ese
 * día que quedó abierta (close_past_cash_register). En un día anterior el
 * efectivo contado es opcional: puede que ya no se pueda contar.
 */
export async function closeCashRegister(_prev: unknown, formData: FormData): Promise<Result> {
  const rawDate = String(formData.get("date") ?? "").trim();
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return { error: "Fecha inválida." };
  const pastDate = rawDate && rawDate < todayLocal() ? rawDate : null;

  const rawCounted = String(formData.get("counted_cash") ?? "").trim();
  const countedCashCents = parseAmountCents(rawCounted);
  if (pastDate ? rawCounted !== "" && countedCashCents == null : countedCashCents == null) {
    return { error: "Ingresá el efectivo contado en pesos." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > MAX_TEXT) return { error: `Las notas no pueden pasar de ${MAX_TEXT} caracteres.` };

  const supabase = await createClient();
  const { error } = pastDate
    ? await supabase.rpc("close_past_cash_register", {
        p_date: pastDate,
        p_counted_cash_cents: rawCounted === "" ? null : countedCashCents,
        p_notes: notes || null,
      })
    : await supabase.rpc("close_cash_register", {
        p_counted_cash_cents: countedCashCents,
        p_notes: notes || null,
      });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  // El aviso de "caja sin cerrar" también está en Inicio.
  revalidatePath("/panel");
  return { ok: true };
}

/**
 * Registra un gasto o un ingreso en la caja de hoy (cualquier staff: el
 * profesor también paga la limpieza). La base exige la caja abierta y sin
 * cerrar.
 */
export async function addCashMovement(_prev: unknown, formData: FormData): Promise<Result> {
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "expense" && kind !== "income") return { error: "Elegí si es un gasto o un ingreso." };

  const method = String(formData.get("method") ?? "");
  if (method !== "cash" && method !== "transfer") {
    return { error: "Elegí si fue en efectivo o por transferencia." };
  }

  // Pesos enteros, sin puntos ni comas: "5000", no "5.000" ni "5000,50".
  const rawAmount = String(formData.get("amount") ?? "").trim();
  if (!/^\d+$/.test(rawAmount)) return { error: "Ingresá el monto en pesos, sin puntos ni centavos." };
  const pesos = Number(rawAmount);
  if (!Number.isSafeInteger(pesos) || pesos <= 0) return { error: "El monto tiene que ser mayor a cero." };
  if (pesos > MAX_MOVEMENT_PESOS) return { error: "El monto es demasiado grande. Revisalo." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribí el motivo (ej: pago de la limpieza)." };
  if (reason.length > MAX_MOVEMENT_REASON) {
    return { error: `El motivo no puede pasar de ${MAX_MOVEMENT_REASON} caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_cash_movement", {
    p_kind: kind,
    p_amount_cents: pesos * 100,
    p_method: method,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}

/** Anula un gasto o ingreso (dueño o programador). No se borra: queda
 *  tachado con quién, cuándo y por qué. Si ese día ya estaba cerrado, la base
 *  recalcula el cierre. */
export async function voidCashMovement(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("movement_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Movimiento inválido." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribí el motivo de la anulación." };
  if (reason.length > MAX_TEXT) return { error: `El motivo no puede pasar de ${MAX_TEXT} caracteres.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_cash_movement", { p_id: id, p_reason: reason });

  if (error) return { error: error.message };

  revalidatePath("/panel/caja");
  return { ok: true };
}
