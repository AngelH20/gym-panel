"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/labels";

type Result = { error?: string };

/** Precio en pesos (input del form) -> centavos. */
function parseAmountCents(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Cómo se repartió el cobro entre los dos medios.
 *
 *  El form manda "mode": todo efectivo, todo transferencia, o mixto (un pase
 *  de $100.000 pagado con $60.000 por transferencia y $40.000 en efectivo).
 *  En mixto vienen los dos montos por separado; en los otros dos, uno solo.
 *  Cada medio con monto mayor a cero termina siendo su propio movimiento en
 *  la caja del día (ver sell_membership_split en 19_split_payment_and_plan_fix.sql). */
function parsePaymentSplit(formData: FormData): { cash: number; transfer: number } {
  // "method" es el nombre viejo del campo: se sigue aceptando por si quedó
  // alguna pantalla sin actualizar.
  const mode = String(formData.get("mode") ?? formData.get("method") ?? "cash");

  if (mode === "split") {
    return {
      cash: parseAmountCents(formData.get("amount_cash")),
      transfer: parseAmountCents(formData.get("amount_transfer")),
    };
  }

  const amount = parseAmountCents(formData.get("amount"));
  return mode === "transfer" ? { cash: 0, transfer: amount } : { cash: amount, transfer: 0 };
}

/** Fecha de inicio del pase, para poder cargar un pago con fecha retroactiva
 *  (ej: cobrado en efectivo sin sistema un día, cargado recién al día
 *  siguiente). Si viene vacía, mal formada o futura, se ignora y
 *  sell_membership arranca el período hoy (su default). */
function parseStartDate(raw: FormDataEntryValue | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value <= todayLocal() ? value : undefined;
}

/** DNI: exactamente 8 dígitos numéricos, sin puntos ni espacios. Es lo único
 *  que acepta la base (ver members_dni_format en 07_dni_strict.sql), así que
 *  se valida acá también para dar un error legible antes de pegarle a la DB. */
function parseDni(raw: FormDataEntryValue | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** Fecha de nacimiento: opcional. Si viene vacía o mal formada, se guarda
 *  null en vez de cortar el alta/edición por un campo que no es obligatorio. */
function parseBirthDate(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function createMember(_prev: unknown, formData: FormData): Promise<Result> {
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "El socio necesita un nombre." };

  const dni = parseDni(formData.get("dni"));
  if (!dni) return { error: "El DNI tiene que tener 8 dígitos numéricos." };

  const supabase = await createClient();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      full_name,
      dni,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      photo_url: String(formData.get("photo_url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      birth_date: parseBirthDate(formData.get("birth_date")),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("dni")) {
      return { error: "Ya hay un socio con ese DNI." };
    }
    if (error.code === "23505" || error.message.includes("duplicate")) {
      return { error: "Ya hay un socio con ese email." };
    }
    console.error("[socios] Error al crear socio:", error);
    return { error: "No se pudo crear el socio. Probá de nuevo en un momento." };
  }

  // Si eligió un plan en el alta, le activamos el pase y registramos el cobro.
  const plan_id = String(formData.get("plan_id") ?? "");
  if (plan_id) {
    const split = parsePaymentSplit(formData);
    const { error: sellError } = await supabase.rpc("sell_membership_split", {
      p_member_id: member.id,
      p_plan_id: plan_id,
      p_cash_cents: split.cash,
      p_transfer_cents: split.transfer,
      p_start: parseStartDate(formData.get("start_date")),
    });
    if (sellError) {
      revalidatePath("/panel/socios");
      redirect(`/panel/socios/${member.id}?aviso=pase_no_activado`);
    }
  }

  revalidatePath("/panel/socios");
  redirect(`/panel/socios/${member.id}`);
}

export async function updateMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "El socio necesita un nombre." };

  const dni = parseDni(formData.get("dni"));
  if (!dni) return { error: "El DNI tiene que tener 8 dígitos numéricos." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("members")
    .update({
      full_name,
      dni,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      photo_url: String(formData.get("photo_url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      welcome_message: String(formData.get("welcome_message") ?? "").trim() || null,
      birth_date: parseBirthDate(formData.get("birth_date")),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505" && error.message.includes("dni")) {
      return { error: "Ya hay otro socio con ese DNI." };
    }
    console.error("[socios] Error al actualizar socio:", error);
    return { error: "No se pudo guardar. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
  return {};
}

/** Suspender / reactivar. Es el único estado que se toca a mano. */
export async function setMemberStatus(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "active" | "suspended";

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("members")
    .update({ status }, { count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[socios] Error al cambiar el estado del socio:", error);
    return { error: "No se pudo guardar el cambio. Probá de nuevo en un momento." };
  }
  if (!count) {
    return { error: "No se pudo aplicar el cambio: no tenés permiso o el socio ya no existe." };
  }

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
  return {};
}

/** Renovar el pase y registrar el cobro: cierra el período anterior, abre uno
 *  nuevo y anota la venta en caja. Todo en una sola transacción del lado SQL. */
export async function sellMembership(_prev: unknown, formData: FormData): Promise<Result> {
  const member_id = String(formData.get("member_id"));
  const plan_id = String(formData.get("plan_id"));
  const split = parsePaymentSplit(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("sell_membership_split", {
    p_member_id: member_id,
    p_plan_id: plan_id,
    p_cash_cents: split.cash,
    p_transfer_cents: split.transfer,
    p_start: parseStartDate(formData.get("start_date")),
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);
  revalidatePath("/panel/caja");

  if (error) return { error: error.message };
  return {};
}

/** Corrige a mano el vencimiento de un pase puntual: para arreglar un
 *  cálculo raro, o para reactivar un pase que quedó marcado vencido después
 *  de un check-in rechazado, sin tener que rehacer toda la venta. */
export async function updateMembershipEnd(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id"));
  const member_id = String(formData.get("member_id"));
  const period_end = String(formData.get("period_end") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return { error: "Elegí una fecha válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_period_end", {
    p_membership_id: membership_id,
    p_period_end: period_end,
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);

  if (error) return { error: error.message };
  return {};
}

/** Corrige el plan de un pase ya vendido: para cuando se le cargó el plan
 *  equivocado al socio. NO registra ningún cobro — el movimiento que ya está
 *  en la caja queda como está, no se duplica ni se infla el total del día.
 *  Si el pase tiene entradas ya usadas, se respetan. */
export async function updateMembershipPlan(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id"));
  const member_id = String(formData.get("member_id"));
  const plan_id = String(formData.get("plan_id") ?? "");

  if (!plan_id) return { error: "Elegí un plan." };

  // Entradas: vacío = las que traiga el plan elegido. Se puede pisar a mano
  // para el caso en que el socio ya gastó más entradas de las que trae el
  // plan nuevo, que si no quedaría bloqueado.
  const rawUses = String(formData.get("uses_total") ?? "").trim();
  const uses = Number(rawUses);
  if (rawUses && (!Number.isInteger(uses) || uses < 1)) {
    return { error: "Las entradas tienen que ser un número entero de 1 o más." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_plan", {
    p_membership_id: membership_id,
    p_plan_id: plan_id,
    p_uses_override: rawUses ? uses : null,
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);

  if (error) return { error: error.message };
  return {};
}

export async function deleteMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("members")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[socios] Error al borrar socio:", error);
    return { error: "No se pudo borrar. Probá de nuevo en un momento." };
  }
  if (!count) {
    return { error: "No se pudo borrar: no tenés permiso o el socio ya no existe." };
  }

  revalidatePath("/panel/socios");
  redirect("/panel/socios");
}
