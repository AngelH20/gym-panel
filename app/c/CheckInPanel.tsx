"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  // El resultado reemplaza al formulario: el foco va al mensaje, así un
  // lector de pantalla lo lee y el foco no queda perdido en la nada.
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state) setDismissed(false);
  }, [state]);

  const result = dismissed ? null : state;

  useEffect(() => {
    if (result) messageRef.current?.focus();
  }, [result]);

  if (result) {
    const success = result.ok;
    const isRepeat = result.code === "ALREADY_CHECKED_IN";
    // Un QR vencido no se arregla reintentando el mismo intento: hay que
    // escanear de nuevo. No tiene sentido ofrecer "marcar otra entrada" acá.
    const needsRescan = result.code === "BAD_QR";
    // Gesto lindo: si hoy es el cumpleaños del socio, lo festejamos distinto
    // en vez de la tarjeta verde de siempre.
    const isBirthday = success && result.is_birthday;
    // Pase pausado: no es un error del socio, así que no va en rojo. El
    // mensaje (de la base) ya dice hasta cuándo y qué hacer si volvió antes.
    const isPaused = result.code === "PAUSED";

    return (
      <section
        className={`card p-6 text-center space-y-4 ${
          isBirthday
            ? "border-plate-amber"
            : success
              ? "border-plate-green"
              : isPaused
                ? "border-plate-blue"
                : "border-plate-red"
        }`}
      >
        {isPaused && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-txt-soft">
              <span className="size-1.5 rounded-full bg-plate-blue" aria-hidden="true" />
              Pase pausado
            </span>
          </div>
        )}

        {isBirthday && (
          <div className="flex justify-center">
            <span className="badge text-tiny px-3 py-1">
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
            className={`mx-auto flex size-14 items-center justify-center rounded-full border border-line ${
              success ? "text-plate-green" : "text-plate-red"
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

        <p
          ref={messageRef}
          tabIndex={-1}
          role="status"
          className="text-title font-semibold text-balance focus:outline-none"
        >
          {result.message}
        </p>

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
    <section>
      <form action={action} className="space-y-5">
        <input type="hidden" name="qr_token" value={qrToken} />

        <Field label="Tu DNI" hint="8 dígitos, sin puntos ni espacios.">
          <input
            name="dni"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="go"
            required
            pattern="[0-9]{8}"
            minLength={8}
            title="8 dígitos numéricos"
            className="field min-h-14 text-center num text-[1.5rem] font-medium tracking-[0.12em]"
            autoFocus
            onChange={(e) => {
              // Si lo tipean o pegan con puntos ("30.123.456"), quedan los
              // números (con puntos no entraba: el campo corta en 8).
              const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
              if (digits !== e.target.value) e.target.value = digits;
            }}
          />
        </Field>

        <SubmitButton pendingLabel="Registrando…" className="btn-primary w-full min-h-12 text-base">
          Marcar entrada
        </SubmitButton>
      </form>
    </section>
  );
}
