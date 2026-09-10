import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

/**
 * GET simple para el polling de RotatingQR.tsx. Un setInterval no puede
 * llamar Server Actions sin chocar con el router de Next. Protegida por el
 * middleware de auth igual que el resto de /panel/*.
 *
 * ?next=1 devuelve el QR de la PRÓXIMA ventana (current_qr_token(1)) para que
 * el cliente lo tenga listo antes del vencimiento y el cambio sea instantáneo.
 * En ese caso "secondsLeft" es lo que le queda a la ventana actual, o sea
 * cuánto falta para que ese QR entre en vigencia.
 */
export async function GET(request: Request) {
  const wantsNext = new URL(request.url).searchParams.get("next") === "1";
  const supabase = await createClient();

  const [{ data: token, error: tokenError }, { data: secondsLeft, error: secondsError }] =
    await Promise.all([
      supabase.rpc("current_qr_token", wantsNext ? { p_window_offset: 1 } : {}),
      supabase.rpc("qr_token_seconds_left"),
    ]);

  if (tokenError) console.error("[qr] current_qr_token:", tokenError);
  if (secondsError) console.error("[qr] qr_token_seconds_left:", secondsError);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await QRCode.toDataURL(url, {
    width: 720,
    margin: 1,
    color: { dark: "#16191A", light: "#FBFBFA" },
    errorCorrectionLevel: "M",
  });

  return NextResponse.json({
    dataUrl,
    secondsLeft: (secondsLeft as number) ?? 30,
  });
}
