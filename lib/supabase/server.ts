import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components y Server Actions.
 * Respeta las políticas de RLS: solo ve lo que el admin logueado puede ver.
 *
 * En Next 15 cookies() es asíncrono, de ahí el await.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Los Server Components no pueden escribir cookies. El middleware
            // ya se encarga de refrescar la sesión, así que se puede ignorar.
          }
        },
      },
    }
  );
}
