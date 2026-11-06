"use client";

import { useActionState, useEffect, useState } from "react";
import { openCashRegister } from "./actions";
import { Field, FormError, MoneyInput, SubmitButton } from "@/components/Form";
import { formatTime } from "@/lib/labels";

/**
 * Siempre visible, esté abierta, cerrada o lo que sea: si la caja ya está
 * abierta, el propio server action devuelve el error ("La caja de hoy ya
 * está abierta") en vez de que el botón desaparezca.
 *
 * Con la caja ya abierta (según lo último que trajo la página) el botón pasa
 * a secundario y lo dice: en el celular esta tarjeta queda primera, y un
 * "Abrir caja" azul ahí arriba invitaba a tocarlo de nuevo.
 */
export function OpenRegisterForm({ openedAt }: { openedAt?: string | null }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(openCashRegister, null);
  // Controlados: React 19 vacía los campos no controlados después de cada
  // envío, también si vuelve un error.
  const [startingCash, setStartingCash] = useState("");
  const [notes, setNotes] = useState("");

  // Abierta bien: se pliega y queda vacío (antes lo vaciaba React solo).
  useEffect(() => {
    if (state?.ok) {
      setConfirm(false);
      setStartingCash("");
      setNotes("");
    }
  }, [state]);

  if (!confirm) {
    return (
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="h3">Abrir caja</h2>
          <p className="mt-1 text-tiny text-txt-soft">
            {openedAt
              ? `Ya está abierta desde las ${formatTime(openedAt)}.`
              : "Declará el fondo inicial para poder empezar a cobrar."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className={openedAt ? "btn-ghost w-full" : "btn-primary w-full"}
        >
          Abrir caja
        </button>
        <FormError message={state?.error} />
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <h2 className="h3">Abrir caja</h2>

      <form action={action} className="space-y-3">
        <Field label="Fondo inicial" hint="El efectivo que hay en el cajón para arrancar el día.">
          <MoneyInput
            name="starting_cash"
            required
            enterKeyHint="next"
            value={startingCash}
            onChange={(e) => setStartingCash(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Notas (opcional)">
          <input
            name="notes"
            enterKeyHint="done"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field"
          />
        </Field>

        <FormError message={state?.error} />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Abriendo…">
            Confirmar apertura
          </SubmitButton>
          <button type="button" onClick={() => setConfirm(false)} className="btn-ghost btn-sm">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
