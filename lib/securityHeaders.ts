/**
 * Cabeceras de seguridad fijas (todas menos el CSP, que lleva un nonce por
 * request y se arma en lib/supabase/middleware.ts).
 *
 * Se usan en dos lugares con los mismos valores:
 *   - next.config.ts, para TODAS las rutas, incluidos los estáticos
 *     (/_next/static, el logo, las imágenes) que el matcher del middleware
 *     deja afuera;
 *   - el middleware, que las vuelve a poner en las respuestas que arma él
 *     (redirects de login, por ejemplo).
 *
 * Permissions-Policy: la cámara queda bloqueada a propósito. El QR del
 * mostrador lo escanea la app de cámara del celular del socio, que abre
 * /c en el navegador; ninguna página de este sitio usa getUserMedia.
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/** HSTS solo en producción: en dev, mandarlo sobre HTTP puede hacer que el
 *  navegador recuerde forzar HTTPS para localhost y rompa el servidor local. */
export const HSTS_HEADER = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
} as const;
