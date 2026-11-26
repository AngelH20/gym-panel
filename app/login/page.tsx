import { LoginForm } from "./LoginForm";
import { LegalFooter } from "@/components/LegalFooter";

/** Los tokens del tema claro, fijos: la pantalla de entrada se ve siempre
 *  igual, tenga el dispositivo el modo oscuro o no. */
const LIGHT_TOKENS = {
  colorScheme: "light",
  "--color-txt": "22 24 29",
  "--color-txt-soft": "86 91 103",
  "--color-txt-faint": "112 117 129",
  "--color-txt-onAccent": "255 255 255",
  "--color-surface": "255 255 255",
  "--color-surface-sunk": "245 246 248",
  "--color-surface-hover": "246 247 249",
  "--color-line": "232 234 238",
  "--color-line-strong": "211 214 221",
  "--color-plate-red": "200 42 42",
  "--color-plate-blue": "36 82 194",
} as React.CSSProperties;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;

  return (
    <main
      // text-txt acá y no solo en <body>: el color que hereda del body ya
      // viene calculado con los tokens del modo oscuro, y sin esto lo que no
      // tiene clase de color (el nombre "CAREF") quedaba gris claro sobre blanco.
      className="min-h-dvh flex items-start sm:items-center justify-center bg-surface text-txt px-6 pt-16 pb-12 sm:py-12"
      style={LIGHT_TOKENS}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-11 object-contain" />
          <div>
            <p className="text-base font-semibold leading-tight">CAREF</p>
            <p className="text-tiny text-txt-faint">Panel de gestión</p>
          </div>
        </div>

        <h1 className="mt-10 h1">Entrar al panel</h1>
        <p className="mt-1 mb-8 text-base text-txt-soft">
          Usá el email con el que te dieron de alta.
        </p>

        <LoginForm volver={volver ?? "/panel"} />

        <LegalFooter className="mt-10" />
      </div>
    </main>
  );
}
