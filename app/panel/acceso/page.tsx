import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { IconQr } from "@/components/icons";
import { RotatingQR } from "./RotatingQR";

/**
 * Solo el QR, grande, y nada más: es la pantalla que queda abierta en una
 * tablet o monitor apoyado en el mostrador. Rota cada qr_rotate_seconds
 * (30s por defecto) para que valga como prueba de que el que escanea está
 * mirando esta pantalla en este momento, no una captura vieja. El anterior
 * sigue sirviendo qr_grace_seconds más (20s) para no cortar a nadie que lo
 * escaneó justo antes de que cambiara.
 */
export default async function AccesoPage() {
  const supabase = await createClient();

  const [{ data: token }, { data: secondsLeft }, { data: secondsRow }] = await Promise.all([
    supabase.rpc("current_qr_token"),
    supabase.rpc("qr_token_seconds_left"),
    supabase.from("settings").select("value").eq("key", "qr_rotate_seconds").maybeSingle(),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await QRCode.toDataURL(url, {
    width: 720,
    margin: 1,
    color: { dark: "#16191A", light: "#FBFBFA" },
    errorCorrectionLevel: "M",
  });

  const periodSeconds = Math.max(5, Number(secondsRow?.value ?? 30));

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-6">
      <div className="text-center space-y-2">
        <span className="eyebrow inline-flex items-center gap-1.5 justify-center text-plate-blue">
          <IconQr className="size-3.5" />
          Acceso
        </span>
        <p className="text-base text-txt-soft whitespace-nowrap">
          Escaneá este código QR para poder registrar tu entrada al gimnasio.
        </p>
      </div>

      <RotatingQR
        initialDataUrl={dataUrl}
        initialSecondsLeft={(secondsLeft as number) ?? periodSeconds}
        periodSeconds={periodSeconds}
      />
    </div>
  );
}
