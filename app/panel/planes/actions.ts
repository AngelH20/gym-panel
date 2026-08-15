"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: boolean };

function parseUses(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Precio en pesos (input del form) -> centavos. Vacío = sin precio cargado. */
function parsePriceCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
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
  const uses = parseUses(formData.get("uses_per_period"));
  const days = parseUses(formData.get("period_days"));

  if (!name) return { error: "El plan necesita un nombre." };
  if (!uses) return { error: "La cantidad de entradas tiene que ser un número mayor a 0." };
  if (!days) return { error: "La duración en días tiene que ser un número mayor a 0." };

  const supabase = await createClient();

  const payload = {
    name,
    description: description || null,
    uses_per_period: uses,
    period: periodFor(days),
    period_days: days,
    price_cash_cents: parsePriceCents(formData.get("price_cash")),
    price_transfer_cents: parsePriceCents(formData.get("price_transfer")),
    is_active: formData.get("is_active") === "on",
  };

  const { error } = id
    ? await supabase.from("plans").update(payload).eq("id", id)
    : await supabase.from("plans").insert(payload);

  if (error) return { error: `No se pudo guardar el plan: ${error.message}` };

  revalidatePath("/panel/planes");
  return { ok: true };
}

export async function togglePlan(formData: FormData) {
  const id = String(formData.get("id"));
  const next = formData.get("next") === "true";

  const supabase = await createClient();
  await supabase.from("plans").update({ is_active: next }).eq("id", id);

  revalidatePath("/panel/planes");
}

export async function deletePlan(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  // Si el plan ya se vendió, la FK lo protege (on delete restrict). En ese caso
  // lo desactivamos en lugar de borrarlo: el historial tiene que quedar intacto.
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) {
    await supabase.from("plans").update({ is_active: false }).eq("id", id);
  }

  revalidatePath("/panel/planes");
}
