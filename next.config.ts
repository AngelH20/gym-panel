import type { NextConfig } from "next";
import { HSTS_HEADER, STATIC_SECURITY_HEADERS } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  images: {
    // Permitimos servir las fotos de socios desde Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  // No hace falta anunciar el framework al mundo en cada respuesta.
  poweredByHeader: false,

  // Cabeceras de seguridad para TODO, también los estáticos que no pasan
  // por el middleware. El CSP con nonce lo pone el middleware (ver
  // lib/supabase/middleware.ts): no puede ir acá porque cambia por request.
  async headers() {
    const headers = [...STATIC_SECURITY_HEADERS];
    if (process.env.NODE_ENV === "production") headers.push(HSTS_HEADER);

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
