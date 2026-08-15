"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };

/** Precio en pesos (input del form) -> centavos. */
function parseAmountCents(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** DNI: exactamente 8 dígitos numéricos, sin puntos ni espacios. Es lo único
 *  que acepta la base (ver members_dni_format en 07_dni_strict.sql), así que
 *  se valida acá también para dar un error legible antes de pegarle a la DB. */
function parseDni(raw: FormDataEntryValue | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
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
    return { error: `No se pudo crear el socio: ${error.message}` };
  }

  // Si eligió un plan en el alta, le activamos el pase y registramos el cobro.
  const plan_id = String(formData.get("plan_id") ?? "");
  if (plan_id) {
    const method = String(formData.get("method") ?? "cash") as "cash" | "transfer";
    const { error: sellError } = await supabase.rpc("sell_membership", {
      p_member_id: member.id,
      p_plan_id: plan_id,
      p_amount_cents: parseAmountCents(formData.get("amount")),
      p_method: method,
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
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505" && error.message.includes("dni")) {
      return { error: "Ya hay otro socio con ese DNI." };
    }
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
  return {};
}

/** Suspender / reactivar. Es el único estado que se toca a mano. */
export async function setMemberStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "active" | "suspended";

  const supabase = await createClient();
  await supabase.from("members").update({ status }).eq("id", id);

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
}

/** Renovar el pase y registrar el cobro: cierra el período anterior, abre uno
 *  nuevo y anota la venta en caja. Todo en una sola transacción del lado SQL. */
export async function sellMembership(_prev: unknown, formData: FormData): Promise<Result> {
  const member_id = String(formData.get("member_id"));
  const plan_id = String(formData.get("plan_id"));
  const method = String(formData.get("method") ?? "cash") as "cash" | "transfer";
  const amount_cents = parseAmountCents(formData.get("amount"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("sell_membership", {
    p_member_id: member_id,
    p_plan_id: plan_id,
    p_amount_cents: amount_cents,
    p_method: method,
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);
  revalidatePath("/panel/caja");

  if (error) return { error: error.message };
  return {};
}

export async function deleteMember(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("members").delete().eq("id", id);

  revalidatePath("/panel/socios");
  redirect("/panel/socios");
}
