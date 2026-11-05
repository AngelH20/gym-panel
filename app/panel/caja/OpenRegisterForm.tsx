"use client";

import { useActionState, useEffect, useState } from "react";
import { openCashRegister } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";

/**
 * Siempre visible, esté abierta, cerrada o lo que sea: si la caja ya está
 * abierta, el propio server action devuelve el error ("La caja de hoy ya
 * está abierta") en vez de que el botón desaparezca.
 */
export function OpenRegisterForm() {
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
            Declará el fondo inicial para poder empezar a cobrar.
          </p>
        </div>
        <button onClick={() => setConfirm(true)} className="btn-primary w-full">
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
          <input
            name="starting_cash"
            type="number"
            min={0}
            step="1"
            required
            value={startingCash}
            onChange={(e) => setStartingCash(e.target.value)}
            className="field font-mono"
            autoFocus
          />
        </Field>

        <Field label="Notas (opcional)">
          <input
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field text-tiny"
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
