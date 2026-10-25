import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { qrDataUrl } from "@/lib/qr";
import { signOut } from "@/app/login/actions";
import { RotatingQR } from "@/app/panel/acceso/RotatingQR";
import { IconQr } from "@/components/icons";
import { SubmitButton } from "@/components/Form";

/**
 * Pantalla "kiosco" para dejar un celular apoyado en el mostrador: SOLO el
 * QR rotativo y un botón para volver al panel. Nada de navegación ni datos
 * de socios, así que si alguien que no es del staff agarra el teléfono no
 * puede ver ni tocar nada más. Vive fuera de /panel a propósito, para no
 * heredar el layout con sidebar/nav — se protege acá mismo en vez de en el
 * middleware.
 *
 * "Volver al panel" cierra la sesión y manda a /login: para entrar al panel
 * de verdad hace falta la contraseña de nuevo, no alcanza con tocar un botón.
 */
export default async function QrMovilPage() {
  const supabase = await createClient();

  // Todo junto: la validación de sesión y los datos del QR son viajes
  // independientes a Supabase, no hace falta encadenarlos.
  const [
    {
      data: { user },
    },
    { data: isAdmin },
    { data: token },
    { data: secondsLeft },
    { data: secondsRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_admin"),
    supabase.rpc("current_qr_token"),
    supabase.rpc("qr_token_seconds_left"),
    supabase.from("settings").select("value").eq("key", "qr_rotate_seconds").maybeSingle(),
  ]);

  if (!user) {
    redirect("/login?volver=/qr-movil");
  }

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/login?volver=/qr-movil");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await qrDataUrl(url);

  const periodSeconds = Math.max(5, Number(secondsRow?.value ?? 60));

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6 bg-surface">
      <div className="text-center space-y-2">
        <span className="eyebrow inline-flex items-center gap-1.5 justify-center text-plate-blue">
          <IconQr className="size-3.5" />
          Acceso
        </span>
        <p className="text-base text-txt-soft">
          Escaneá este código para registrar tu entrada al gimnasio.
        </p>
      </div>

      <RotatingQR
        initialDataUrl={dataUrl}
        initialSecondsLeft={(secondsLeft as number) ?? periodSeconds}
        periodSeconds={periodSeconds}
      />

      <form action={signOut}>
        <SubmitButton pendingLabel="Saliendo…" className="btn-ghost btn-sm">
          Volver al panel
        </SubmitButton>
      </form>
    </main>
  );
}
