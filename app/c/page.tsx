import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckInPanel } from "./CheckInPanel";
import { LegalFooter } from "@/components/LegalFooter";

/**
 * El nombre del gimnasio es igual para todos y casi nunca cambia (no hay
 * pantalla para editarlo), pero esta es la ruta más transitada: la abre cada
 * socio que escanea el QR. Se guarda en la caché de datos de Next unos
 * minutos, así la página no espera un viaje a Supabase en cada entrada. No es
 * un dato por usuario ni por rol: cachearlo no filtra nada.
 */
const getGymName = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data: gymRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "gym_name")
      .maybeSingle();
    return (gymRow?.value as string) ?? "CAREF";
  },
  ["checkin-gym-name"],
  { revalidate: 300 }
);

/**
 * Kiosco fijo de check-in. Ruta pública, sin sesión. El QR de /panel/acceso
 * apunta acá con ?t=<token que rota cada 40s>. El socio se identifica
 * adentro, con su DNI; el token solo prueba que el QR escaneado es reciente.
 */
export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ t }, gymName] = await Promise.all([searchParams, getGymName()]);

  return (
    <main
      // text-txt acá y no solo en <body>: el color que hereda del body ya
      // viene calculado con los tokens del modo oscuro, y sin esto el nombre
      // del gimnasio y el mensaje del resultado quedaban gris claro sobre blanco.
      className="min-h-dvh flex flex-col items-center bg-surface text-txt"
      style={
        {
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
          "--color-plate-amber": "214 146 20",
          "--color-plate-amber-ink": "150 98 0",
          "--color-plate-green": "26 128 80",
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-sm px-5 pt-14 pb-8 flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-caref.svg" alt="" className="size-14 shrink-0 object-contain" />
        <span className="text-title font-semibold">{gymName}</span>
        <p className="text-base text-txt-soft text-balance">
          Ingresá tu DNI para registrar la entrada.
        </p>
      </div>

      <div className="w-full max-w-sm px-5 pb-10 space-y-5">

        <CheckInPanel qrToken={t ?? ""} />
      </div>

      <LegalFooter className="mt-auto pb-6" />
    </main>
  );
}

export const metadata: Metadata = { title: "Registrar entrada" };
