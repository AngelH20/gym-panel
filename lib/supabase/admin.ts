// Si algún día un componente "use client" importa este archivo (directa o
// indirectamente), el build falla en vez de mandar el código que lee la
// service_role al navegador.
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role: saltea RLS por completo.
 *
 * Se usa para el check-in público (donde no hay usuario logueado) y para la
 * gestión de cuentas en /panel/usuarios (crear/borrar usuarios de Supabase
 * Auth, algo que la API normal no permite). En ambos casos el chequeo de
 * quién puede hacer qué se hace ANTES, con el cliente normal (RLS), nunca
 * confiando en que el llamador ya esté autorizado. Nunca importar esto
 * desde un componente de cliente.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Copiala de Supabase -> Settings -> API."
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
