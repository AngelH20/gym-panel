"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Botón de pánico: regenera el secreto que firma el QR y el código de
 * acceso (rotate_access_secret() en 15_security_hardening.sql). Invalida al
 * instante cualquier QR ya generado, mostrado, impreso o fotografiado,
 * incluso el que está en pantalla ahora mismo en /panel/acceso.
 */
export async function invalidateAccessSecret(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_access_secret");

  if (error) {
    console.error("[acceso] Error al rotar el secreto:", error);
    return { error: "No se pudo invalidar el QR. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/acceso");
  return {};
}
