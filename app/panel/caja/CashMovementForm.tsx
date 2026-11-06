"use client";

import { useActionState, useEffect, useState } from "react";
import { addCashMovement } from "./actions";
import { Field, FormError, FormSuccess, MoneyInput, SubmitButton } from "@/components/Form";
import { MAX_MOVEMENT_PESOS, MAX_MOVEMENT_REASON } from "@/lib/cashMovements";
import { formatMoney } from "@/lib/labels";

/**
 * "Registrar gasto o ingreso": plata que sale o entra de la caja sin ser la
 * venta de un pase (pagar la limpieza, vender una botella de agua). Plegado
 * por defecto; solo se muestra con la caja de hoy abierta.
 */
export function CashMovementForm() {
  const [open, setOpen] = useState(false);
  // Lo último que se guardó, para confirmarlo con la tarjeta ya plegada.
  const [saved, setSaved] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="h3">Gastos e ingresos</h2>
          <p className="mt-1 text-tiny text-txt-soft">
            Plata que sale o entra de la caja y no es un pase.
          </p>
        </div>
        <FormSuccess message={saved} />
        <button
          type="button"
          onClick={() => {
            setSaved(null);
            setOpen(true);
          }}
          className="btn-ghost w-full border border-line"
        >
          Registrar gasto o ingreso
        </button>
      </div>
    );
  }

  // Se monta de cero cada vez que se abre: sin el error ni los datos de la
  // vez anterior.
  return (
    <OpenForm
      onClose={() => setOpen(false)}
      onSaved={(message) => {
        setSaved(message);
        setOpen(false);
      }}
    />
  );
}

function OpenForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [state, action] = useActionState(addCashMovement, null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  // Controlados a propósito: React 19 vacía los campos no controlados de un
  // <form action> después de cada envío, también cuando el server action
  // devuelve un error, y se perdía lo escrito.
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");

  // Guardado: se pliega solo, avisa qué quedó anotado y queda listo para el
  // próximo.
  useEffect(() => {
    if (state?.ok) {
      const pesos = Math.round(Number(amount) || 0);
      onSaved(
        `${kind === "expense" ? "Gasto" : "Ingreso"} de ${formatMoney(pesos * 100)} registrado.`
      );
    }
    // Solo cuando vuelve la respuesta: amount/kind son los que se mandaron.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
              className={`flex min-h-10 coarse:min-h-11 cursor-pointer items-center justify-center rounded-control border text-tiny font-medium transition-colors
                has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plate-blue ${
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
          <MoneyInput
            name="amount"
            min={1}
            max={MAX_MOVEMENT_PESOS}
            required
            enterKeyHint="next"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Medio">
          <select
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="field"
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </Field>

        <Field label="Motivo">
          <input
            name="reason"
            required
            enterKeyHint="done"
            placeholder={kind === "expense" ? "Ej: artículos de limpieza" : "Ej: venta de agua"}
            maxLength={MAX_MOVEMENT_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="field"
          />
        </Field>

        <FormError message={state?.error} />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Guardando…">
            {kind === "expense" ? "Registrar gasto" : "Registrar ingreso"}
          </SubmitButton>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
