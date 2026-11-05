import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

/**
 * Una sola familia, Archivo variable, con el eje de ancho cargado:
 *   cuerpo  -> ancho normal. Grotesca robusta, muy legible en chico.
 *   títulos -> condensada y pesada (font-display), como el marcador de un
 *              reloj de sala: entra grande en la pantalla del celular.
 *   números -> cifras tabulares, apenas angostas (font-mono).
 * Ver tailwind.config.ts y globals.css.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
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
    { media: "(prefers-color-scheme: light)", color: "#13264A" },
    { media: "(prefers-color-scheme: dark)", color: "#13264A" },
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
      <body className={archivo.variable}>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
