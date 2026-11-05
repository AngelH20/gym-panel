import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes y archivos públicos sueltos (íconos,
    // robots, manifest, fuentes): ninguno necesita sesión ni cabeceras por
    // request, y así no pagan el arranque del middleware.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|woff2?)$).*)",
    // Todo /panel y /qr-movil SIEMPRE, aunque terminen en ".png" o ".txt":
    // la regla de arriba se salteaba, por ejemplo, /panel/socios/<id>.png
    // (la ficha de socio con un id que termina en extensión), que salía sin
    // CSP. El layout igual pedía sesión, pero la página quedaba sin nonce.
    "/panel/:path*",
    "/qr-movil/:path*",
  ],
};
