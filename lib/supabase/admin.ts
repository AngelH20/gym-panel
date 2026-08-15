import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role: saltea RLS por completo.
 *
 * SOLO se usa para el check-in público, donde no hay usuario logueado y
 * necesitamos invocar perform_check_in(). Nunca importar esto desde un
 * componente de cliente.
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
