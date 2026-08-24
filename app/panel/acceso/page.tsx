import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { IconQr, IconShield } from "@/components/icons";
import { RotatingQR } from "./RotatingQR";
import { InvalidateAccessButton } from "./InvalidateAccessButton";

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

  const [{ data: token }, { data: secondsLeft }, { data: secondsRow }, { data: graceRow }, { data: modeRow }] =
    await Promise.all([
      supabase.rpc("current_qr_token"),
      supabase.rpc("qr_token_seconds_left"),
      supabase.from("settings").select("value").eq("key", "qr_rotate_seconds").maybeSingle(),
      supabase.from("settings").select("value").eq("key", "qr_grace_seconds").maybeSingle(),
      supabase.from("settings").select("value").eq("key", "access_mode").maybeSingle(),
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
  const graceSeconds = Math.max(0, Number(graceRow?.value ?? 20));
  const accessMode = String(modeRow?.value ?? "off").replace(/"/g, "");
  const protectionOn = accessMode !== "off";

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

      <section className="card p-5 w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="h3 flex items-center gap-1.5">
            <IconShield className="size-4" />
            Seguridad
          </h2>
          <span
            className={
              protectionOn
                ? "badge border-plate-green/35 bg-plate-green/12 text-plate-green"
                : "badge border-plate-red/35 bg-plate-red/12 text-plate-red"
            }
          >
            {protectionOn ? "QR rotativo activo" : "Validación de QR apagada"}
          </span>
        </div>

        <dl className="datalist">
          <div className="py-2 flex items-baseline justify-between gap-3">
            <dt className="text-tiny text-txt-faint">Rotación</dt>
            <dd className="text-tiny font-mono">
              cada {periodSeconds}s (+{graceSeconds}s de gracia)
            </dd>
          </div>
          <div className="py-2 flex items-baseline justify-between gap-3">
            <dt className="text-tiny text-txt-faint">Intentos por dispositivo</dt>
            <dd className="text-tiny font-mono">12 cada 2 min</dd>
          </div>
        </dl>

        <InvalidateAccessButton />

        <p className="text-tiny text-txt-faint">
          Usalo si un QR quedó visible en una foto o pantalla compartida: corta al
          instante todos los códigos ya generados, incluido el de esta pantalla.
        </p>
      </section>
    </div>
  );
}
