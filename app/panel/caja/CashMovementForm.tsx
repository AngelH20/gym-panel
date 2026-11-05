"use client";

import { useActionState, useEffect, useState } from "react";
import { addCashMovement } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { MAX_MOVEMENT_PESOS, MAX_MOVEMENT_REASON } from "@/lib/cashMovements";

/**
 * "Registrar gasto o ingreso": plata que sale o entra de la caja sin ser la
 * venta de un pase (pagar la limpieza, vender una botella de agua). Plegado
 * por defecto; solo se muestra con la caja de hoy abierta.
 */
export function CashMovementForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addCashMovement, null);
  const [kind, setKind] = useState<"expense" | "income">("expense");

  // Guardado: se pliega solo y queda listo para el próximo.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="h3">Gastos e ingresos</h2>
          <p className="mt-1 text-tiny text-txt-soft">
            Plata que sale o entra de la caja y no es un pase.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full border border-line">
          Registrar gasto o ingreso
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <h2 className="h3">Registrar gasto o ingreso</h2>

      <form action={action} className="space-y-3">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Tipo</legend>
          {(
            [
              ["expense", "Gasto"],
              ["income", "Ingreso"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-9 cursor-pointer items-center justify-center rounded-control border text-tiny font-medium transition-colors ${
                kind === value ? "border-txt text-txt" : "border-line text-txt-soft hover:bg-surface-hover"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <Field label="Monto">
          <input
            name="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MOVEMENT_PESOS}
            step="1"
            required
            className="field font-mono"
            placeholder="5000"
            autoFocus
          />
        </Field>

        <Field label="Medio">
          <select name="method" defaultValue="cash" className="field">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </Field>

        <Field label="Motivo">
          <input
            name="reason"
            required
            maxLength={MAX_MOVEMENT_REASON}
            className="field"
            placeholder={kind === "expense" ? "Ej: pago de la limpieza" : "Ej: venta de agua"}
          />
        </Field>

        <FormError message={state?.error} />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Guardando…">
            {kind === "expense" ? "Registrar gasto" : "Registrar ingreso"}
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
