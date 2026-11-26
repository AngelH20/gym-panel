import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

/**
 * Una sola familia: Geist, una sans neutra y sencilla. La jerarquía sale
 * de tamaño y peso; los números usan cifras tabulares (ver globals.css).
 */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const SITE_DESCRIPTION =
  "Panel de gestión y registro de entradas de CAREF, Centro de Alto Rendimiento y Entrenamiento de la Fuerza.";

export const metadata: Metadata = {
  // Base para las URLs absolutas de og:image y og:url. Sin la variable (en
  // local) Next usa localhost y avisa en la consola; en Vercel está cargada.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: { default: "CAREF", template: "%s · CAREF" },
  description: SITE_DESCRIPTION,
  applicationName: "CAREF",
  // Es un sistema interno con datos de socios: nada de esto tiene que
  // aparecer en buscadores. robots.ts además lo bloquea para los crawlers.
  robots: { index: false, follow: false, nocache: true },
  // Tarjeta al compartir un link (WhatsApp, Telegram, etc.). La imagen sale
  // de app/opengraph-image.jpg, que Next enlaza solo.
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "CAREF",
    title: "CAREF",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "CAREF", description: SITE_DESCRIPTION },
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
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#111215" },
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
      <body className={geist.variable}>
        {/* suppressHydrationWarning: el navegador oculta el nonce después de
            usarlo (el atributo queda vacío en el DOM, por seguridad), y React
            lo tomaba como una diferencia server/cliente en cada página. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
