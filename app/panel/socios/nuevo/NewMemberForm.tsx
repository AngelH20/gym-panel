"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createMember } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney } from "@/lib/labels";
import type { Plan, PaymentMethod } from "@/lib/types";

export function NewMemberForm({ plans }: { plans: Plan[] }) {
  const [state, action] = useActionState(createMember, null);

  const [planId, setPlanId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const suggested =
    selectedPlan == null
      ? null
      : method === "cash"
        ? selectedPlan.price_cash_cents
        : selectedPlan.price_transfer_cents;

  useEffect(() => {
    setAmount(suggested != null ? String(suggested / 100) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, method]);

  return (
    <form action={action} className="card p-5 space-y-4">
      <Field label="Nombre y apellido">
        <input name="full_name" required className="field" placeholder="Martina Gómez" autoFocus />
      </Field>

      <Field label="DNI" hint="8 dígitos, sin puntos ni espacios. Es lo que tipea en el kiosco de la entrada.">
        <input
          name="dni"
          required
          inputMode="numeric"
          pattern="[0-9]{8}"
          minLength={8}
          maxLength={8}
          title="8 dígitos numéricos"
          className="field font-mono"
          placeholder="30111222"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input name="phone" className="field font-mono" placeholder="11 5555-0101" />
        </Field>

        <Field label="Email">
          <input name="email" type="email" className="field" placeholder="Opcional" />
        </Field>
      </div>

      <Field label="Foto (URL)" hint="Opcional. La subida de archivos llega más adelante.">
        <input name="photo_url" className="field" placeholder="https://…" />
      </Field>

      {plans.length > 0 && (
        <div className="rounded-control bg-surface-sunk border border-line p-4 space-y-3">
          <Field
            label="Activar pase ahora"
            hint="El período arranca hoy y dura los días del plan."
          >
            <select
              name="plan_id"
              className="field bg-surface"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              <option value="">No activar todavía</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.uses_per_period} entradas / {p.period_days} días
                </option>
              ))}
            </select>
          </Field>

          {planId && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "transfer"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex items-center justify-between gap-2 rounded-control border px-3.5 py-2.5 text-base cursor-pointer transition-colors ${
                      method === m
                        ? "border-plate-blue bg-plate-blue/6"
                        : "border-line bg-surface hover:border-line-strong"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="method"
                        value={m}
                        checked={method === m}
                        onChange={() => setMethod(m)}
                        className="accent-plate-blue"
                      />
                      {m === "cash" ? "Efectivo" : "Transferencia"}
                    </span>
                    {selectedPlan && (
                      <span className="font-mono text-tiny text-txt-faint">
                        {formatMoney(
                          m === "cash"
                            ? selectedPlan.price_cash_cents
                            : selectedPlan.price_transfer_cents
                        )}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <Field label="Monto cobrado">
                <input
                  name="amount"
                  type="number"
                  min={0}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field font-mono bg-surface"
                  placeholder="80000"
                />
              </Field>
            </>
          )}
        </div>
      )}

      <Field label="Notas">
        <textarea name="notes" rows={3} className="field resize-y" placeholder="Opcional" />
      </Field>

      <FormError message={state?.error} />

      <SubmitButton className="btn-primary w-full" pendingLabel="Creando…">
        Crear socio
      </SubmitButton>
    </form>
  );
}
