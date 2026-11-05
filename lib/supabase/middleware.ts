import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HSTS_HEADER, STATIC_SECURITY_HEADERS } from "@/lib/securityHeaders";

/** Nonce nuevo en cada request, para el CSP de abajo. Se genera con la Web
 *  Crypto API (no Buffer/Node): el middleware corre en el runtime Edge. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Cabeceras de seguridad para toda respuesta que pasa por acá (todo excepto
 * estáticos, ver matcher en middleware.ts). El CSP necesita el nonce para
 * permitir el script inline de tema en app/layout.tsx (y los que inyecta
 * el propio Next para el RSC payload, que lo toman solo si Content-Security-
 * Policy trae 'nonce-...' en script-src) sin recurrir a 'unsafe-inline'.
 */
/** Origen del proyecto de Supabase (fotos de Storage), para el img-src del
 *  CSP. Solo ESTE proyecto: con "https://*.supabase.co" una foto de socio
 *  podía apuntar a un bucket de cualquier otro proyecto (de un tercero) y
 *  servir de píxel de rastreo con la IP de cada navegador del staff. */
function supabaseImgOrigin(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

const SUPABASE_IMG_ORIGIN = supabaseImgOrigin();

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Los estilos inline (barras de progreso, previews de color) no se
    // pueden noncear fácilmente con las props style={} de React; es el
    // trade-off estándar que documenta el propio Next.js para este caso.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${SUPABASE_IMG_ORIGIN ? ` ${SUPABASE_IMG_ORIGIN}` : ""}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  // Las mismas que pone next.config.ts para todo el sitio (ver
  // lib/securityHeaders.ts); acá se repiten con .set (pisa, no duplica)
  // para que también las lleven los redirects que arma el middleware.
  for (const { key, value } of STATIC_SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  if (process.env.NODE_ENV === "production") {
    response.headers.set(HSTS_HEADER.key, HSTS_HEADER.value);
  }

  return response;
}

/**
 * Refresca la sesión en cada request y protege /panel.
 * Las rutas públicas (/c/... del check-in) pasan sin consultar la sesión.
 */
export async function updateSession(request: NextRequest) {
  const nonce = generateNonce();
  // Se propaga como header de REQUEST para que app/layout.tsx lo lea vía
  // headers() y se lo pase al script inline del tema como prop nonce.
  request.headers.set("x-nonce", nonce);

  const path = request.nextUrl.pathname;

  // El check-in de los socios (/c) es público y no usa la sesión: no tiene
  // sentido pagar el viaje a Supabase Auth en cada entrada que se registra
  // desde el celular. Solo lleva las cabeceras de seguridad.
  if (path === "/c" || path.startsWith("/c/")) {
    return applySecurityHeaders(NextResponse.next({ request }), nonce);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() en vez de getUser(): el proyecto firma los JWT con una clave
  // asimétrica (ES256), así que la firma se verifica acá mismo con la clave
  // pública (JWKS, que auth-js cachea 10 minutos) en lugar de ir hasta
  // Supabase Auth en CADA request del panel. Si la sesión venció, igual la
  // refresca y reescribe las cookies como antes. Con un token HS256 viejo
  // cae solo a getUser(). Esto es solo el portón de redirección: los datos
  // los sigue cuidando la RLS, que valida el mismo JWT en cada consulta.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  if (!user && path.startsWith("/panel")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", path);
    return applySecurityHeaders(NextResponse.redirect(url), nonce);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    url.search = "";
    return applySecurityHeaders(NextResponse.redirect(url), nonce);
  }

  return applySecurityHeaders(response, nonce);
}
