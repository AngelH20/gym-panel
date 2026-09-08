"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/types";

type Result = { error?: string };

const ROLES: AdminRole[] = ["superadmin", "admin", "profesor"];

/** Todas las mutaciones de esta pantalla son de superadmin exclusivamente.
 *  La RLS de admins ya lo exige (ver sql/18_roles.sql), pero lo chequeamos
 *  acá también para poder devolver un mensaje claro en vez de un error crudo
 *  de Postgres, y antes de tocar Supabase Auth (que no tiene RLS). */
async function requireSuperadmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_superadmin");
  return Boolean(data);
}

/** ¿Sacar a esta cuenta (borrarla o bajarle el rol) dejaría el sistema sin
 *  ningún superadmin? Sin este chequeo, alguien se puede quedar afuera de
 *  su propio panel sin forma de volver a entrar. */
async function wouldLeaveNoSuperadmin(excludeId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("admins")
    .select("id", { count: "exact", head: true })
    .eq("role", "superadmin")
    .neq("id", excludeId);
  return (count ?? 0) === 0;
}

export async function createStaffAccount(_prev: unknown, formData: FormData): Promise<Result> {
  if (!(await requireSuperadmin())) {
    return { error: "No tenés permiso para crear cuentas." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "profesor") as AdminRole;

  if (!email) return { error: "Completá el email." };
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  if (!ROLES.includes(role)) return { error: "Rol inválido." };

  // Crear el login de verdad (Supabase Auth) requiere la service_role key:
  // el alta pública está apagada a propósito, así que no hay otra forma de
  // dar de alta un usuario nuevo que no sea desde el servidor.
  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { error: "Ya existe un usuario de Supabase Auth con ese email." };
    }
    return { error: `No se pudo crear el usuario: ${createError.message}` };
  }

  const { error: insertError } = await admin.from("admins").insert({
    user_id: created.user.id,
    email,
    full_name,
    role,
  });

  if (insertError) {
    // No dejamos un usuario de Auth huérfano (sin fila en admins, no podría
    // entrar al panel igual, pero queda ocupando el email para siempre).
    await admin.auth.admin.deleteUser(created.user.id);
    if (insertError.code === "23505") return { error: "Ya hay una cuenta con ese email." };
    console.error("[usuarios] Error al guardar la cuenta:", insertError);
    return { error: "No se pudo guardar la cuenta. Probá de nuevo." };
  }

  revalidatePath("/panel/usuarios");
  return {};
}

export async function updateStaffRole(_prev: unknown, formData: FormData): Promise<Result> {
  if (!(await requireSuperadmin())) {
    return { error: "No tenés permiso para cambiar roles." };
  }

  const id = String(formData.get("id"));
  const role = String(formData.get("role")) as AdminRole;
  if (!ROLES.includes(role)) return { error: "Rol inválido." };

  if (role !== "superadmin" && (await wouldLeaveNoSuperadmin(id))) {
    return { error: "No podés sacarle superadmin al único que queda. Creá otro primero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("admins").update({ role }).eq("id", id);

  if (error) {
    console.error("[usuarios] Error al cambiar el rol:", error);
    return { error: "No se pudo cambiar el rol." };
  }

  revalidatePath("/panel/usuarios");
  return {};
}

export async function deleteStaffAccount(_prev: unknown, formData: FormData): Promise<Result> {
  if (!(await requireSuperadmin())) {
    return { error: "No tenés permiso para borrar cuentas." };
  }

  const id = String(formData.get("id"));
  const user_id = String(formData.get("user_id") ?? "");

  if (await wouldLeaveNoSuperadmin(id)) {
    return { error: "No podés borrar al único superadmin. Creá otro primero." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("admins")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[usuarios] Error al borrar la cuenta:", error);
    return { error: "No se pudo borrar la cuenta." };
  }
  if (!count) {
    return { error: "No se pudo borrar: la cuenta ya no existe." };
  }

  // Además de sacarlo de la allowlist, borramos el login de Auth para que
  // ni siquiera pueda autenticarse (aunque ya no entraría al panel igual).
  if (user_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(user_id).catch((e) => {
      console.error("[usuarios] Error al borrar el usuario de Auth:", e);
    });
  }

  revalidatePath("/panel/usuarios");
  return {};
}
