"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Traduce el error de Supabase a algo que diga qué pasó de verdad.
 * La versión anterior devolvía el mismo mensaje para todo, lo que hacía
 * imposible distinguir una contraseña mal tipeada de un email sin confirmar.
 */
function describeAuthError(message: string, status?: number): string {
  const m = message.toLowerCase();

  if (m.includes("email not confirmed")) {
    return "El usuario existe pero el email no está confirmado. En Supabase: Authentication → Users → los tres puntos del usuario → Confirm email.";
  }
  if (m.includes("invalid login credentials")) {
    return "Credenciales rechazadas por Supabase. Si la contraseña es correcta, revisá que el usuario esté confirmado.";
  }
  if (m.includes("invalid api key") || m.includes("no api key")) {
    return "La clave de API es inválida. Revisá NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local y reiniciá el servidor.";
  }
  if (m.includes("failed to fetch") || m.includes("fetch failed")) {
    return "No se pudo contactar a Supabase. Revisá NEXT_PUBLIC_SUPABASE_URL en .env.local.";
  }
  if (m.includes("too many requests") || status === 429) {
    return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
  }

  // Cualquier otra cosa: mostramos el mensaje crudo, es más útil que esconderlo.
  return `Supabase respondió: ${message}`;
}

/** Adónde volver después de entrar. Viene de la URL (?volver=), así que se
 *  acepta solo una ruta interna del panel o el kiosco del QR: nada de
 *  "//otro-sitio.com", "/\\otro-sitio.com" ni URLs absolutas, que el
 *  navegador interpretaría como otro dominio (open redirect). */
function safeReturnPath(raw: string): string {
  if (raw === "/qr-movil") return raw;
  if (/^\/panel(?:[/?#][^\\]*)?$/.test(raw) && !raw.startsWith("/panel//")) return raw;
  return "/panel";
}

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const volver = String(formData.get("volver") ?? "/panel");

  if (!email || !password) {
    return { error: "Completá el email y la contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Queda en la terminal, con el detalle completo para depurar.
    console.error("[login] Error de Supabase:", {
      message: error.message,
      status: error.status,
      code: error.code,
    });

    return { error: describeAuthError(error.message, error.status) };
  }

  // Autenticó bien. Ahora verificamos que esté en la allowlist de admins.
  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");

  if (rpcError) {
    console.error("[login] Error al verificar admin:", rpcError);
    await supabase.auth.signOut();
    return { error: "No se pudo verificar tu acceso al panel. Probá de nuevo en un momento." };
  }

  if (!isAdmin) {
    await supabase.auth.signOut();
    return {
      error:
        "Tu usuario existe y la contraseña es correcta, pero no está en la tabla admins. Corré el INSERT de la allowlist en Supabase.",
    };
  }

  revalidatePath("/", "layout");
  redirect(safeReturnPath(volver));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}