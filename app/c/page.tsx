import { createAdminClient } from "@/lib/supabase/admin";
import { CheckInPanel } from "./CheckInPanel";

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
  const { t } = await searchParams;
  const supabase = createAdminClient();

  const { data: gymRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "gym_name")
    .maybeSingle();

  const gymName = (gymRow?.value as string) ?? "CAREF";

  return (
    <main className="min-h-dvh flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2.5 justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-8 shrink-0 object-contain" />
          <span className="font-display text-lg font-semibold">{gymName}</span>
        </div>

        <p className="text-center text-base text-txt-soft">
          Ingresá tu DNI para registrar la entrada.
        </p>

        <CheckInPanel qrToken={t ?? ""} />
      </div>
    </main>
  );
}
