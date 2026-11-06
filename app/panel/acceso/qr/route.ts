import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { qrDataUrl } from "@/lib/qr";

// El QR vence en un minuto: que no lo guarde ningún proxy ni el navegador.
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET simple para el polling de RotatingQR.tsx. Un setInterval no puede
 * llamar Server Actions sin chocar con el router de Next.
 *
 * El middleware solo exige una sesión, y el layout de /panel (que chequea la
 * allowlist) NO corre para los route handlers: por eso acá se pregunta el
 * rol explícitamente. Sin esto, cualquier usuario autenticado de Supabase
 * Auth que no sea staff podía sacar el QR vigente (y el de la próxima
 * ventana) y marcar entradas sin estar en el gimnasio.
 *
 * ?next=1 devuelve el QR de la PRÓXIMA ventana (current_qr_token(1)) para que
 * el cliente lo tenga listo antes del vencimiento y el cambio sea instantáneo.
 * En ese caso "secondsLeft" es lo que le queda a la ventana actual, o sea
 * cuánto falta para que ese QR entre en vigencia.
 */
export async function GET(request: Request) {
  const wantsNext = new URL(request.url).searchParams.get("next") === "1";
  const supabase = await createClient();

  // En paralelo con el resto para no sumar un viaje a Supabase: si no es
  // staff, el token calculado simplemente se descarta.
  const [
    { data: role },
    { data: token, error: tokenError },
    { data: secondsLeft, error: secondsError },
  ] = await Promise.all([
    supabase.rpc("current_admin_role"),
    supabase.rpc("current_qr_token", wantsNext ? { p_window_offset: 1 } : {}),
    supabase.rpc("qr_token_seconds_left"),
  ]);

  // Cualquier rol: el staff y también el celular del mostrador (rol
  // "celular"), que existe justamente para esto. current_qr_token() aplica la
  // misma regla en la base (sql/38_rol_celular.sql).
  if (!role) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE });
  }

  if (tokenError) console.error("[qr] current_qr_token:", tokenError);
  if (secondsError) console.error("[qr] qr_token_seconds_left:", secondsError);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await qrDataUrl(url);

  return NextResponse.json(
    {
      dataUrl,
      secondsLeft: (secondsLeft as number) ?? 60,
    },
    { headers: NO_STORE }
  );
}
