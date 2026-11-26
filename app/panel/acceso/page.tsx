import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { qrDataUrl } from "@/lib/qr";
import { IconQr, IconShield } from "@/components/icons";
import { RotatingQR } from "./RotatingQR";
import { InvalidateAccessButton } from "./InvalidateAccessButton";

/**
 * Solo el QR, grande, y nada más: es la pantalla que queda abierta en una
 * tablet o monitor apoyado en el mostrador. Rota cada qr_rotate_seconds
 * (60s por defecto) para que valga como prueba de que el que escanea está
 * mirando esta pantalla en este momento, no una captura vieja. El anterior
 * sigue sirviendo qr_grace_seconds más (20s) para no cortar a nadie que lo
 * escaneó justo antes de que cambiara.
 */
export default async function AccesoPage() {
  const supabase = await createClient();

  const [{ data: token }, { data: secondsLeft }, { data: secondsRow }, { data: modeRow }] =
    await Promise.all([
      supabase.rpc("current_qr_token"),
      supabase.rpc("qr_token_seconds_left"),
      supabase.from("settings").select("value").eq("key", "qr_rotate_seconds").maybeSingle(),
      supabase.from("settings").select("value").eq("key", "access_mode").maybeSingle(),
    ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/c?t=${token ?? ""}`;

  const dataUrl = await qrDataUrl(url);

  const periodSeconds = Math.max(5, Number(secondsRow?.value ?? 60));
  const accessMode = String(modeRow?.value ?? "off").replace(/"/g, "");
  const protectionOn = accessMode !== "off";

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-6">
      <div className="text-center space-y-1">
        <h1 className="h1 sr-only md:not-sr-only">QR de acceso</h1>
        <p className="text-base sm:text-lg text-txt-soft text-balance">
          Escaneá este código para registrar tu entrada al gimnasio.
        </p>
      </div>

      <RotatingQR
        initialDataUrl={dataUrl}
        initialSecondsLeft={(secondsLeft as number) ?? periodSeconds}
        periodSeconds={periodSeconds}
      />

      {/*
        Solo en celular: para dejar el teléfono apoyado en el mostrador
        mostrando nada más que el QR (ver app/qr-movil/page.tsx). En
        escritorio no tiene sentido, por eso md:hidden.
      */}
      <Link
        href="/qr-movil"
        className="md:hidden card w-full max-w-xl px-4 py-3 flex items-center gap-3 text-base font-medium
                   hover:bg-surface-hover transition-colors"
      >
        <IconQr className="size-5 text-txt-faint shrink-0" />
        <span className="flex-1 min-w-0">
          QR vista móvil
          <span className="block text-tiny font-normal text-txt-faint">
            Deja el celular mostrando solo el código para que la gente entre
          </span>
        </span>
      </Link>

      <section className="card p-4 sm:p-5 w-full max-w-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h3 flex items-center gap-2">
            <IconShield className="size-4 text-txt-faint" />
            Seguridad
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 text-tiny font-medium ${
              protectionOn ? "text-txt-soft" : "text-plate-red"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${protectionOn ? "bg-plate-green" : "bg-plate-red"}`}
              aria-hidden="true"
            />
            {protectionOn ? "QR rotativo activo" : "Validación de QR apagada"}
          </span>
        </div>

        <dl className="datalist">
          <div className="py-2 flex items-baseline justify-between gap-3">
            <dt className="text-tiny text-txt-faint">Rotación</dt>
            <dd className="text-tiny num text-right">
              cada {periodSeconds}s
              <span className="block text-micro text-txt-faint font-sans">
                (tiempo de espera aumentado si justo se está escaneando)
              </span>
            </dd>
          </div>
        </dl>

        <InvalidateAccessButton />

        <p className="text-tiny text-txt-faint">
          Usalo si un QR quedó visible en una foto o pantalla compartida: invalida al toque
          todos los códigos vigentes, incluido este.
        </p>
      </section>
    </div>
  );
}

export const metadata: Metadata = { title: "QR de acceso" };
