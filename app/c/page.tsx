import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckInPanel } from "./CheckInPanel";

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
      className="min-h-dvh flex flex-col items-center bg-surface-sunk"
      style={
        {
          colorScheme: "light",
          "--color-txt": "13 24 43",
          "--color-txt-soft": "66 79 100",
          "--color-txt-faint": "98 111 132",
          "--color-txt-onAccent": "255 255 255",
          "--color-surface": "255 255 255",
          "--color-surface-sunk": "233 237 242",
          "--color-surface-hover": "243 245 248",
          "--color-line": "218 224 231",
          "--color-line-strong": "168 179 194",
          "--color-plate-red": "180 35 45",
          "--color-plate-blue": "31 95 175",
          "--color-plate-amber": "232 170 20",
          "--color-plate-amber-ink": "122 88 0",
          "--color-plate-green": "22 122 72",
        } as React.CSSProperties
      }
    >
      <div className="chrome w-full bg-ink text-txt-onDark px-5 pt-8 pb-14 flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-caref.svg" alt="" className="size-16 shrink-0 object-contain" />
        <span className="font-display text-[2rem] leading-none font-black">{gymName}</span>
        <p className="text-base text-txt-onDarkSoft text-balance">
          Ingresá tu DNI para registrar la entrada.
        </p>
      </div>

      <div className="w-full max-w-sm px-4 -mt-8 pb-10 space-y-5">

        <CheckInPanel qrToken={t ?? ""} />
      </div>
    </main>
  );
}
