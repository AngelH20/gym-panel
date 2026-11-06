import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Claims del JWT de la sesión (sub = id del usuario, email...), o null si no
 * hay sesión válida.
 *
 * getClaims() verifica la firma acá mismo con la clave pública del proyecto
 * (ES256, JWKS cacheado por auth-js), sin ir hasta Supabase Auth como hace
 * getUser(). Cacheado por request igual que getCurrentAdminRole: el layout de
 * /panel y las páginas que necesitan saber quién está logueado (Usuarios) lo
 * comparten sin pagar otra verificación ni otro viaje.
 *
 * Solo identifica: los datos los sigue cuidando la RLS, que valida el mismo
 * JWT en cada consulta.
 */
export const getSessionClaims = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});
