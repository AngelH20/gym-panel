"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpKey } from "@/lib/clientIp";

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

const TOO_MANY = "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.";

/**
 * Tope propio de intentos por IP (sql/39_login_rate_limit.sql).
 *
 * El signInWithPassword sale del servidor de Vercel, así que el límite de
 * Supabase Auth ve la IP de Vercel y no la de quien prueba contraseñas: no
 * frena a nadie en particular y, si alguien lo agota, deja afuera a todo el
 * staff. Las funciones solo las puede llamar la service_role (sin sesión no
 * hay otra), y reciben únicamente la IP: nada de lo que tipeó el usuario.
 *
 * El intento se RESERVA antes de probar la contraseña (login_attempt_begin,
 * atómico por IP en la base): si se contara recién después de fallar, N
 * pedidos simultáneos pasarían todos el chequeo antes de que se anote
 * ninguno. Una reserva que no se libera cuenta como intento fallido.
 *
 * Si la base todavía no tiene sql/39, o la consulta falla, el login sigue
 * funcionando sin este tope (mejor eso que dejar a recepción sin entrar).
 */
type LoginLimiter = {
  /** La IP ya agotó sus intentos: ni se prueba la contraseña. */
  blocked: boolean;
  /** El intento no fue de credenciales (red, Supabase caído): no cuenta. */
  discard: () => Promise<void>;
  /** Entró: se limpian los intentos de la IP. */
  succeeded: () => Promise<void>;
};

async function reserveLoginAttempt(): Promise<LoginLimiter> {
  const ip = clientIpKey(await headers());
  const admin = createAdminClient();
  const log = (fn: string, message: string) =>
    console.error(`[login] ${fn} (¿falta aplicar sql/39?):`, message);

  const { data: attemptId, error } = await admin.rpc("login_attempt_begin", { p_ip: ip });
  if (error) {
    log("login_attempt_begin", error.message);
    // Sin la tabla/función: sin tope, como antes.
    return { blocked: false, discard: async () => {}, succeeded: async () => {} };
  }

  return {
    // NULL sin error = la base dijo que esta IP está frenada.
    blocked: attemptId == null,
    discard: async () => {
      const { error: e } = await admin.rpc("login_attempt_discard", { p_id: attemptId });
      if (e) log("login_attempt_discard", e.message);
    },
    succeeded: async () => {
      const { error: e } = await admin.rpc("login_record_success", { p_ip: ip });
      if (e) log("login_record_success", e.message);
    },
  };
}

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const volver = String(formData.get("volver") ?? "/panel");

  if (!email || !password) {
    return { error: "Completá el email y la contraseña." };
  }
  // Nada de mandarle a Supabase un email o una contraseña de megas: ningún
  // email válido pasa de 254 caracteres y bcrypt no mira más de 72 bytes.
  if (email.length > 254 || password.length > 200) {
    return { error: BAD_CREDENTIALS };
  }

  const limiter = await reserveLoginAttempt();
  if (limiter.blocked) {
    return { error: TOO_MANY };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Solo cuentan los rechazos por credenciales (la reserva queda como
    // intento fallido): un error de red o de Supabase no es un intento de
    // adivinar la contraseña, así que esa reserva se descarta.
    const m = error.message.toLowerCase();
    if (!m.includes("invalid login credentials") && !m.includes("email not confirmed")) {
      await limiter.discard();
    }
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
    // La contraseña era correcta: no es un intento de adivinarla.
    await limiter.discard();
    await supabase.auth.signOut();
    return { error: "No se pudo verificar tu acceso al panel. Probá de nuevo en un momento." };
  }

  if (!role) {
    // Usuario de Supabase Auth que no es del staff (por ejemplo, si el alta
    // pública del proyecto quedó habilitada): mismo mensaje que una
    // contraseña mal puesta, para no confirmarle que sus credenciales sirven.
    console.error("[login] Usuario autenticado que no está en admins:", email);
    // La reserva queda: cuenta como intento fallido.
    await supabase.auth.signOut();
    return { error: BAD_CREDENTIALS };
  }

  await limiter.succeeded();
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