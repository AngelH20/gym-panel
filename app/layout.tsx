import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

/**
 * Tres roles tipográficos:
 *   display -> Space Grotesk. Geométrica con carácter, para títulos.
 *   body    -> IBM Plex Sans. Neutral y muy legible en tamaños chicos.
 *   mono    -> IBM Plex Mono. TODO número va acá: usos, horarios, fechas.
 *              Un contador se lee mejor con anchos fijos.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CAREF · Panel",
  description: "Gestión de socios, pases y entradas.",
  // iOS detecta números "tipo teléfono" (como el DNI) y los envuelve en un
  // link <a href="tel:..."> ANTES de que React hidrate, lo que rompe el
  // árbol y tira "A tree hydrated but some attributes... didn't match".
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFBFA" },
    { media: "(prefers-color-scheme: dark)", color: "#101316" },
  ],
};

// Aplica la preferencia de tema guardada ANTES del primer paint, para que
// no se vea un flash del tema equivocado al cargar (solo hace falta cuando
// el usuario ya tocó el switch; si no, CSS solo sigue al sistema).
const themeScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
  try {
    var raw = localStorage.getItem('caref:custom-theme');
    if (raw) {
      var custom = JSON.parse(raw);
      var root = document.documentElement.style;
      if (custom.colors) {
        for (var k in custom.colors) root.setProperty(k, custom.colors[k]);
      }
      if (custom.fontScale) root.setProperty('--app-font-scale', custom.fontScale + '%');
    }
  } catch (e) {}
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El middleware genera un nonce por request y lo manda como header de
  // request (ver lib/supabase/middleware.ts); el CSP solo deja correr este
  // script inline si trae ese mismo nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  /* suppressHydrationWarning: el script de abajo le agrega data-theme a este
   * elemento ANTES de que React hidrate (para no flashear el tema
   * equivocado). Sin este flag, React compara ese atributo contra el HTML
   * que generó el server, no coincide, y tira "A tree hydrated but some
   * attributes...". Es el patrón estándar para theme scripts inline. */
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
