import type { Metadata } from "next";
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
 *
 * Con una cuenta de rol "celular" (sql/38_rol_celular.sql) es lo ÚNICO que se
 * ve: ni siquiera aparece "Volver al panel". Esa cuenta no puede entrar al
 * panel (el layout la manda acá) ni leer nada en la base salvo el QR.
 */
export default async function QrMovilPage() {
  const supabase = await createClient();

  // Todo junto: la validación de sesión y los datos del QR son viajes
  // independientes a Supabase, no hace falta encadenarlos.
  const [
    {
      data: { user },
    },
    { data: role },
    { data: token },
    { data: secondsLeft },
    { data: rotateSeconds },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("current_admin_role"),
    supabase.rpc("current_qr_token"),
    supabase.rpc("qr_token_seconds_left"),
    // Función y no settings directo: el celular no puede leer settings.
    supabase.rpc("qr_rotate_seconds"),
  ]);

  if (!user) {
    redirect("/login?volver=/qr-movil");
  }

  // Cualquier rol del panel o el celular. Sin rol (no está en admins), afuera.
  if (!role) {
    await supabase.auth.signOut();
    redirect("/login?volver=/qr-movil");
  }

  const isQrDevice = role === "celular";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await qrDataUrl(url);

  const periodSeconds = Math.max(5, Number(rotateSeconds ?? 60));

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-4 py-8 bg-surface">
      <div className="text-center space-y-1">
        <h1 className="h1 inline-flex items-center gap-2 justify-center">
          <IconQr className="size-6 text-txt-faint" />
          QR de acceso
        </h1>
        <p className="text-base sm:text-lg text-txt-soft text-balance">
          Escaneá este código para registrar tu entrada al gimnasio.
        </p>
      </div>

      <RotatingQR
        initialDataUrl={dataUrl}
        initialSecondsLeft={(secondsLeft as number) ?? periodSeconds}
        periodSeconds={periodSeconds}
      />

      {!isQrDevice && (
        <form action={signOut} className="flex flex-col items-center gap-1.5">
          <SubmitButton pendingLabel="Saliendo…" className="btn-ghost btn-sm">
            Volver al panel
          </SubmitButton>
          {/* Que no sorprenda: el botón cierra la sesión a propósito. */}
          <p className="text-tiny text-txt-faint">Te va a pedir la contraseña de nuevo.</p>
        </form>
      )}
    </main>
  );
}

export const metadata: Metadata = { title: "QR de acceso" };
