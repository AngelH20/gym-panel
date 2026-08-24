import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Permitimos servir las fotos de socios desde Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  // No hace falta anunciar el framework al mundo en cada respuesta.
  poweredByHeader: false,
};

export default nextConfig;
