"use client";

import { useActionState, useState } from "react";
import { closeCashRegister } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatDate, formatMoney } from "@/lib/labels";

/**
 * Siempre visible, esté abierta, cerrada o lo que sea: si la caja ya está
 * cerrada, el propio server action devuelve el error ("La caja de hoy ya
 * está cerrada") en vez de que el botón desaparezca. Es más robusto que
 * ocultar el botón según un estado que el cliente podría tener desactualizado.
 */
export function CloseRegisterForm({
  expectedCashCents,
  pastDate,
}: {
  /** Fondo inicial + cobros en efectivo + ingresos en efectivo − gastos en efectivo. */
  expectedCashCents: number;
  /** Si viene, se cierra la caja de ese día anterior que quedó abierta. Ahí el
   *  efectivo contado es opcional: al otro día puede que ya no se pueda contar. */
  pastDate?: string;
}) {
  const title = pastDate ? `Cerrar la caja del ${formatDate(pastDate)}` : "Cerrar caja";
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(closeCashRegister, null);
  const [counted, setCounted] = useState("");

  if (!confirm) {
    return (
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="h3">{title}</h2>
          <p className="mt-1 text-tiny text-txt-soft">
            {pastDate
              ? "Quedó abierta. Cerrala para que sus totales queden fijos."
              : "Contá el efectivo del cajón y comparalo con lo esperado."}
          </p>
        </div>
        <button onClick={() => setConfirm(true)} className="btn-dark w-full">
          {pastDate ? "Cerrar esa caja" : "Cerrar caja"}
        </button>
        <FormError message={state?.error} />
      </div>
    );
  }

  const countedCents = Math.round((Number(counted) || 0) * 100);
  const diff = counted.trim() ? countedCents - expectedCashCents : null;

  return (
    <div className="card p-5 space-y-3">
      <h2 className="h3">{title}</h2>

      <form action={action} className="space-y-3">
        {pastDate && <input type="hidden" name="date" value={pastDate} />}
        <p className="text-tiny text-txt-soft">
          Esperado (fondo inicial + efectivo cobrado + ingresos − gastos en efectivo):{" "}
          <span className="num font-semibold text-txt">{formatMoney(expectedCashCents)}</span>
        </p>

        <Field
          label={pastDate ? "Efectivo contado (opcional)" : "Efectivo contado"}
          hint={pastDate ? "Si no lo contaste ese día, dejalo vacío: el cierre queda sin diferencia." : undefined}
        >
          <input
            name="counted_cash"
            type="number"
            min={0}
            step="1"
            required={!pastDate}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="field font-mono"
            placeholder="45000"
            autoFocus
          />
        </Field>

        {diff != null && diff !== 0 && (
          <p className={`text-tiny font-medium ${diff > 0 ? "text-plate-blue" : "text-plate-red"}`}>
            {diff > 0
              ? `Sobran ${formatMoney(diff)} respecto de lo esperado.`
              : `Faltan ${formatMoney(-diff)} respecto de lo esperado.`}
          </p>
        )}

        <input name="notes" className="field text-tiny" placeholder="Notas (opcional)" />

        <p className="text-tiny text-txt-faint">
          {pastDate
            ? "Una vez cerrada, solo el dueño puede corregirla anulando movimientos."
            : "Una vez cerrada, no se pueden cargar más ventas ni gastos con fecha de hoy."}
        </p>

        <FormError message={state?.error} />

        <div className="flex gap-2">
          <SubmitButton className="btn-danger btn-sm" pendingLabel="Cerrando…">
            Confirmar cierre
          </SubmitButton>
          <button type="button" onClick={() => setConfirm(false)} className="btn-ghost btn-sm">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
