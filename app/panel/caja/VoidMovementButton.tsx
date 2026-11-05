"use client";

import { useActionState, useState } from "react";
import { voidCashMovement } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney } from "@/lib/labels";

/**
 * "Anular" en un gasto o ingreso (Más opciones → Anular movimientos). Igual
 * que con los cobros: pide motivo y no borra nada.
 */
export function VoidMovementButton({
  movementId,
  amountCents,
  isExpense,
}: {
  movementId: string;
  amountCents: number;
  isExpense: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(voidCashMovement, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 min-h-8 px-2 rounded-control text-tiny font-medium text-txt-faint hover:text-plate-red hover:bg-surface-hover transition-colors"
      >
        Anular
      </button>
    );
  }

  return (
    <form
      action={action}
      className="order-last basis-full mt-2 rounded-control border border-line-strong p-3 space-y-2.5"
    >
      <input type="hidden" name="movement_id" value={movementId} />
      <p className="text-tiny text-plate-red">
        Se anula {isExpense ? "el gasto" : "el ingreso"} de {formatMoney(amountCents)}. Sale de los
        totales de esa caja y queda registrado quién lo anuló.
      </p>
      <Field label="Motivo">
        <input
          name="reason"
          required
          autoFocus
          maxLength={500}
          className="field text-tiny"
        />
      </Field>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <SubmitButton className="btn-danger btn-sm" pendingLabel="Anulando…">
          Confirmar anulación
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}
