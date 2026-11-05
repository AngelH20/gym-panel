"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/types";
import { ALL_ROLES, isManagerRole, isProgramadorRole } from "@/lib/roles";

type Result = { error?: string };

/** Rol de quien hace el pedido. La RLS de admins es la barrera de verdad
 *  (sql/28_roles_programador_dueno.sql), pero lo chequeamos acá también
 *  para devolver un mensaje claro y, sobre todo, antes de tocar Supabase
 *  Auth con la service_role, que no pasa por RLS. */
async function currentRole(): Promise<AdminRole | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_admin_role");
  return (data as AdminRole | null) ?? null;
}

/** El dueño solo maneja cuentas de profesor; el programador, todas. */
function canManageRole(actor: AdminRole | null, target: AdminRole): boolean {
  if (isProgramadorRole(actor)) return true;
  return isManagerRole(actor) && target === "profesor";
}

/** ¿Sacar a esta cuenta (borrarla o bajarle el rol) dejaría el sistema sin
 *  ningún programador? Sin este chequeo, nadie podría volver a cambiar roles. */
async function wouldLeaveNoProgramador(excludeId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("admins")
    .select("id", { count: "exact", head: true })
    .eq("role", "programador")
    .neq("id", excludeId);
  return (count ?? 0) === 0;
}

export async function createStaffAccount(_prev: unknown, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "profesor") as AdminRole;

  if (!ALL_ROLES.includes(role)) return { error: "Rol inválido." };
  if (!canManageRole(await currentRole(), role)) {
    return { error: "No tenés permiso para crear una cuenta con ese rol." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "Completá un email válido." };
  }
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  // Supabase Auth (bcrypt) ignora todo lo que pase de 72 bytes.
  if (new TextEncoder().encode(password).length > 72) {
    return { error: "La contraseña no puede pasar de 72 caracteres." };
  }
  if (full_name && full_name.length > 120) return { error: "El nombre es demasiado largo." };

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
  if (!isProgramadorRole(await currentRole())) {
    return { error: "Solo el programador puede cambiar roles." };
  }

  const id = String(formData.get("id"));
  const role = String(formData.get("role")) as AdminRole;
  if (!ALL_ROLES.includes(role)) return { error: "Rol inválido." };

  if (role !== "programador" && (await wouldLeaveNoProgramador(id))) {
    return { error: "No podés sacarle programador al único que queda. Creá otro primero." };
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
  const actor = await currentRole();
  if (!isManagerRole(actor)) {
    return { error: "No tenés permiso para borrar cuentas." };
  }

  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("admins")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "No se pudo borrar: la cuenta ya no existe." };
  if (!canManageRole(actor, target.role as AdminRole)) {
    return { error: "Solo podés borrar cuentas de profesor." };
  }

  if (await wouldLeaveNoProgramador(id)) {
    return { error: "No podés borrar al único programador. Creá otro primero." };
  }

  // El user_id sale de la fila borrada, no del formulario: así nadie puede
  // borrar el login de Auth de otra cuenta mandando un id cambiado.
  const { data: deleted, error } = await supabase
    .from("admins")
    .delete()
    .eq("id", id)
    .select("user_id");

  if (error) {
    console.error("[usuarios] Error al borrar la cuenta:", error);
    return { error: "No se pudo borrar la cuenta." };
  }
  if (!deleted?.length) {
    return { error: "No se pudo borrar la cuenta." };
  }

  // Además de sacarlo de la allowlist, borramos el login de Auth para que
  // ni siquiera pueda autenticarse (aunque ya no entraría al panel igual).
  const userId = deleted[0].user_id as string | null;
  if (userId) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(userId).catch((e) => {
      console.error("[usuarios] Error al borrar el usuario de Auth:", e);
    });
  }

  revalidatePath("/panel/usuarios");
  return {};
}
