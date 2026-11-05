import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AdminRole } from "@/lib/types";

/**
 * Rol del usuario logueado (null = no está en la allowlist de admins).
 *
 * Envuelto en React.cache: el layout de /panel y varias páginas (caja, ficha
 * del socio, usuarios) lo piden en la MISMA request, y sin esto cada uno
 * pagaba su propio viaje a Supabase. cache() vive solo lo que dura una
 * request, así que no se comparte nunca entre usuarios ni entre requests.
 *
 * No reemplaza ningún chequeo: la barrera real sigue siendo la RLS
 * (sql/28_roles_programador_dueno.sql).
 */
export const getCurrentAdminRole = cache(async (): Promise<AdminRole | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_admin_role");
  return (data as AdminRole | null) ?? null;
});
