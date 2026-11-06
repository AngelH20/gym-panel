"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, isUuid, parsePesosToCents, requireRole } from "@/lib/actionGuard";

type Result = { error?: string; ok?: boolean };

/** Topes de un plan. Ningún plan real se acerca (el más largo es anual), y
 *  sin tope un número gigante llegaba a la base: entradas fuera del rango de
 *  integer, o una duración que hacía fallar el cálculo de vencimientos. */
const MAX_USES = 1000;
const MAX_DAYS = 400;

function parseCount(raw: FormDataEntryValue | null, max: number): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Precio en pesos (input del form) -> centavos. Vacío = sin precio cargado.
 *  undefined = vino algo que no es un precio válido. */
function parsePriceCents(raw: FormDataEntryValue | null): number | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return parsePesosToCents(s) ?? undefined;
}

/** No hay selector de período en la UI: se infiere de la duración. */
function periodFor(days: number): "day" | "week" | "month" {
  if (days <= 1) return "day";
  if (days <= 7) return "week";
  return "month";
}

export async function savePlan(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const uses = parseCount(formData.get("uses_per_period"), MAX_USES);
  const days = parseCount(formData.get("period_days"), MAX_DAYS);
  const priceCash = parsePriceCents(formData.get("price_cash"));
  const priceTransfer = parsePriceCents(formData.get("price_transfer"));

  if (id && !isUuid(id)) return { error: "No se encontró el plan. Recargá la página." };
  if (!name) return { error: "El plan necesita un nombre." };
  if (name.length > 80) return { error: "El nombre del plan no puede pasar de 80 caracteres." };
  if (description.length > 500) return { error: "La descripción no puede pasar de 500 caracteres." };
  if (!uses) return { error: `La cantidad de entradas tiene que ser un número entre 1 y ${MAX_USES}.` };
  if (!days) return { error: `La duración tiene que ser un número de días entre 1 y ${MAX_DAYS}.` };
  if (priceCash === undefined || priceTransfer === undefined) {
    return { error: "Revisá los precios: tienen que ser números en pesos, sin puntos." };
  }

  // Precios y planes son cosa del dueño (la RLS de plans dice lo mismo).
  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { supabase } = guard;

  const payload = {
    name,
    description: description || null,
    uses_per_period: uses,
    period: periodFor(days),
    period_days: days,
    price_cash_cents: priceCash,
    price_transfer_cents: priceTransfer,
    is_active: formData.get("is_active") === "on",
  };

  const { error, count } = id
    ? await supabase.from("plans").update(payload, { count: "exact" }).eq("id", id)
    : await supabase.from("plans").insert(payload, { count: "exact" });

  if (error) {
    return { error: dbErrorMessage("planes", error, "No se pudo guardar el plan. Probá de nuevo.") };
  }
  if (!count) return { error: "No se encontró el plan. Recargá la página." };

  revalidatePath("/panel/planes");
  return { ok: true };
}

export async function togglePlan(formData: FormData) {
  const id = String(formData.get("id"));
  const next = formData.get("next") === "true";
  if (!isUuid(id)) return;

  const guard = await requireRole("manager");
  if (!guard.ok) return;
  await guard.supabase.from("plans").update({ is_active: next }).eq("id", id);

  revalidatePath("/panel/planes");
}

export async function deletePlan(formData: FormData) {
  const id = String(formData.get("id"));
  if (!isUuid(id)) return;

  const guard = await requireRole("manager");
  if (!guard.ok) return;
  const { supabase } = guard;

  // Si el plan ya se vendió, la FK lo protege (on delete restrict). En ese caso
  // lo desactivamos en lugar de borrarlo: el historial tiene que quedar intacto.
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) {
    await supabase.from("plans").update({ is_active: false }).eq("id", id);
  }

  revalidatePath("/panel/planes");
}
