"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Mismo texto para todo lo que sea "no podés entrar con esto": la pantalla
 *  de login es pública y no tiene que contarle a nadie si un email existe,
 *  si la contraseña era correcta o si la cuenta está en la allowlist. */
const BAD_CREDENTIALS = "Email o contraseña incorrectos.";

/**
 * Traduce el error de Supabase a un mensaje para la pantalla. Es pública:
 * nada de mensajes crudos ni pistas de configuración (nombres de variables,
 * .env.local, pasos del dashboard). El detalle completo queda en el log del
 * servidor (console.error en signIn), que es donde se depura.
 */
function describeAuthError(message: string, status?: number): string {
  const m = message.toLowerCase();

  if (m.includes("too many requests") || status === 429) {
    return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
  }
  if (m.includes("invalid login credentials") || m.includes("email not confirmed")) {
    return BAD_CREDENTIALS;
  }
  return "No se pudo iniciar sesión. Probá de nuevo en un momento.";
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

  // Autenticó bien. Ahora verificamos que esté en la allowlist de admins:
  // cualquier rol del panel, o el celular del mostrador (sql/38).
  const { data: role, error: rpcError } = await supabase.rpc("current_admin_role");

  if (rpcError) {
    console.error("[login] Error al verificar admin:", rpcError);
    await supabase.auth.signOut();
    return { error: "No se pudo verificar tu acceso al panel. Probá de nuevo en un momento." };
  }

  if (!role) {
    // Usuario de Supabase Auth que no es del staff (por ejemplo, si el alta
    // pública del proyecto quedó habilitada): mismo mensaje que una
    // contraseña mal puesta, para no confirmarle que sus credenciales sirven.
    console.error("[login] Usuario autenticado que no está en admins:", email);
    await supabase.auth.signOut();
    return { error: BAD_CREDENTIALS };
  }

  revalidatePath("/", "layout");
  // El celular del mostrador va siempre al QR, venga de donde venga.
  redirect(role === "celular" ? "/qr-movil" : safeReturnPath(volver));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}