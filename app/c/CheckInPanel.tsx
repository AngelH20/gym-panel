"use client";

import { useActionState, useEffect, useState } from "react";
import { checkIn } from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import { UsesTally } from "@/components/UsesTally";
import { Avatar } from "@/components/Avatar";

/**
 * Kiosco fijo: lo usa un socio distinto en cada vuelta, así que después de
 * mostrar el resultado hay que volver al formulario en blanco para el
 * siguiente. "Marcar otra entrada" es un reset puramente local: no puede
 * reenviar el form vacío, porque eso pisaría el resultado con un error.
 */
export function CheckInPanel({ qrToken }: { qrToken: string }) {
  const [state, action] = useActionState(checkIn, null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (state) setDismissed(false);
  }, [state]);

  const result = dismissed ? null : state;

  if (result) {
    const success = result.ok;
    const isRepeat = result.code === "ALREADY_CHECKED_IN";
    // Un QR vencido no se arregla reintentando el mismo intento: hay que
    // escanear de nuevo. No tiene sentido ofrecer "marcar otra entrada" acá.
    const needsRescan = result.code === "BAD_QR";
    // Gesto lindo: si hoy es el cumpleaños del socio, lo festejamos distinto
    // en vez de la tarjeta verde de siempre.
    const isBirthday = success && result.is_birthday;

    return (
      <section
        className={`card p-6 text-center space-y-4 border-2 shadow-lift ${
          isBirthday
            ? "border-plate-amber"
            : success
              ? "border-plate-green"
              : "border-plate-red"
        }`}
      >
        {isBirthday && (
          <div className="flex justify-center">
            <span className="badge text-tiny px-3 py-1 border-plate-amber/60 bg-plate-amber/20 text-plate-amberInk">
              🎂 ¡Feliz cumpleaños!
            </span>
          </div>
        )}

        {result.member_name ? (
          <div className="flex justify-center">
            <Avatar name={result.member_name} url={result.photo_url} size={72} />
          </div>
        ) : (
          <span
            className={`mx-auto flex size-16 items-center justify-center rounded-full ${
              success
                ? "bg-plate-green text-txt-onAccent"
                : "bg-plate-red text-txt-onAccent"
            }`}
            aria-hidden="true"
          >
            {success ? (
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
            )}
          </span>
        )}

        <p className="font-display text-title font-extrabold text-balance">{result.message}</p>

        {result.code === "CHECKED_IN" &&
          result.uses_total != null &&
          result.uses_remaining != null && (
            <div className="pt-1 flex justify-center">
              <UsesTally total={result.uses_total} remaining={result.uses_remaining} size="md" />
            </div>
          )}

        {isRepeat && result.visits_today != null && result.visits_today > 1 && (
          <p className="text-tiny text-txt-faint">
            Entrada n.º {result.visits_today} de hoy.
          </p>
        )}

        {!needsRescan && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="btn-ghost w-full min-h-12 text-base"
            >
              Marcar otra entrada
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card p-5 shadow-lift">
      <form action={action} className="space-y-5">
        <input type="hidden" name="qr_token" value={qrToken} />

        <Field label="Tu DNI" hint="8 dígitos, sin puntos ni espacios.">
          <input
            name="dni"
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="[0-9]{8}"
            minLength={8}
            maxLength={8}
            title="8 dígitos numéricos"
            className="field min-h-16 text-center font-mono text-[1.75rem] font-semibold tracking-[0.15em]"
            placeholder="30111222"
            autoFocus
          />
        </Field>

        <SubmitButton pendingLabel="Registrando…" className="btn-primary w-full min-h-14 text-lg">
          Marcar entrada
        </SubmitButton>
      </form>
    </section>
  );
}
