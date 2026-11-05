"use client";

import { useActionState, useState } from "react";
import { voidSale } from "./actions";
import { FormError, SubmitButton } from "@/components/Form";
import { formatMoney } from "@/lib/labels";

/**
 * "Anular" en una fila de la caja. Plegado por defecto: es una corrección
 * rara, no algo del día a día. Pide motivo, que queda en el historial.
 */
export function VoidSaleButton({
  paymentId,
  saleTotalCents,
  isSplit,
}: {
  paymentId: string;
  /** Suma de todos los movimientos de la venta (efectivo + transferencia). */
  saleTotalCents: number;
  isSplit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(voidSale, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 min-h-9 px-2 rounded-control text-tiny font-semibold text-txt-faint hover:text-plate-red hover:bg-plate-red/10 transition-colors"
      >
        Anular
      </button>
    );
  }

  return (
    <form
      action={action}
      className="order-last basis-full mt-2 rounded-control border border-plate-red/40 bg-plate-red/8 p-3 space-y-2.5"
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <p className="text-tiny text-plate-red">
        Se anula la venta completa ({formatMoney(saleTotalCents)}
        {isSplit ? ", efectivo y transferencia" : ""}). Sale de los totales de esa caja y
        queda registrado quién la anuló.
      </p>
      <input
        name="reason"
        required
        autoFocus
        className="field text-tiny"
        placeholder="Motivo (ej: se cargó por adelantado y no pagó)"
      />
      <label className="flex items-center gap-2.5 min-h-9 text-tiny text-txt-soft cursor-pointer">
        <input type="checkbox" name="cancel_membership" defaultChecked className="size-4" />
        Dar de baja también el pase
      </label>
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
