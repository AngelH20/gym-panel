"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/actionGuard";

/**
 * Botón de pánico: regenera el secreto que firma el QR y el código de
 * acceso (rotate_access_secret() en 15_security_hardening.sql). Invalida al
 * instante cualquier QR ya generado, mostrado, impreso o fotografiado,
 * incluso el que está en pantalla ahora mismo en /panel/acceso.
 *
 * Cualquier staff (el profesor también tiene que poder apretarlo), pero no
 * el celular del mostrador: misma regla que la base (is_admin()).
 */
export async function invalidateAccessSecret(): Promise<{ error?: string }> {
  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };

  const { error } = await guard.supabase.rpc("rotate_access_secret");

  if (error) {
    console.error("[acceso] Error al rotar el secreto:", error);
    return { error: "No se pudo invalidar el QR. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/acceso");
  return {};
}
