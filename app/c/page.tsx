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
      className="min-h-dvh flex flex-col items-center bg-surface"
      style={
        {
          colorScheme: "light",
          "--color-txt": "23 27 31",
          "--color-txt-soft": "86 92 92",
          "--color-txt-faint": "138 144 144",
          "--color-surface": "251 251 250",
          "--color-surface-sunk": "241 242 240",
          "--color-surface-hover": "245 246 244",
          "--color-line": "223 225 221",
          "--color-line-strong": "200 204 199",
          "--color-plate-blue": "42 109 177",
        } as React.CSSProperties
      }
    >
      <div className="w-full bg-plate-blue text-white px-5 py-5 flex items-center gap-2.5 justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-caref.svg" alt="" className="size-8 shrink-0 object-contain" />
        <span className="font-display text-lg font-semibold">{gymName}</span>
      </div>

      <div className="w-full max-w-sm px-5 py-10 space-y-5">
        <p className="text-center text-base text-txt-soft">
          Ingresá tu DNI para registrar la entrada.
        </p>

        <CheckInPanel qrToken={t ?? ""} />
      </div>
    </main>
  );
}
