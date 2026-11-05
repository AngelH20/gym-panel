import type { NextConfig } from "next";
import { HSTS_HEADER, STATIC_SECURITY_HEADERS } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  // Sin dominios remotos para el optimizador de imágenes (/_next/image): la
  // app no usa next/image (las fotos van con <img> común) y con
  // "*.supabase.co" cualquiera podía usar el sitio como proxy de imágenes de
  // CUALQUIER proyecto de Supabase, gastando la cuota de Vercel y sirviendo
  // contenido ajeno desde este dominio. Si algún día se usa next/image con
  // fotos de Storage, habilitar SOLO el host de este proyecto.
  images: {
    remotePatterns: [],
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
