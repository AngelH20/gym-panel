import type { MetadataRoute } from "next";

/**
 * Sistema interno: nada se indexa (además de la meta robots noindex del
 * layout). No hay sitemap a propósito: no hay páginas públicas que listar.
 *
 * Los bots de vista previa de links quedan permitidos para que, al compartir
 * el link por WhatsApp o Telegram, se vea la tarjeta con el logo. Solo leen
 * las meta og:*; no indexan nada.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["facebookexternalhit", "WhatsApp", "TelegramBot", "Twitterbot"],
        allow: "/",
      },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
