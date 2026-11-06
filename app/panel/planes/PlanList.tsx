"use client";

import { useActionState, useState } from "react";
import { savePlan, togglePlan, deletePlan } from "./actions";
import { Field, FormError, MoneyInput, SubmitButton, EmptyState } from "@/components/Form";
import { formatMoney } from "@/lib/labels";
import type { Plan } from "@/lib/types";

export function PlanList({
  plans,
  usage,
}: {
  plans: Plan[];
  usage: Record<string, number>;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3 lg:items-start">
      {plans.length === 0 && editing !== "new" && (
        <div className="lg:col-span-2 2xl:col-span-3">
          <EmptyState
            title="Todavía no hay planes"
            description="Creá el primero para poder darle un pase a un socio."
          >
            <button type="button" onClick={() => setEditing("new")} className="btn-primary">
              Crear plan
            </button>
          </EmptyState>
        </div>
      )}

      {plans.map((plan) =>
        editing === plan.id ? (
          <div key={plan.id} className="lg:col-span-2 2xl:col-span-3">
            <PlanForm plan={plan} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <PlanRow
            key={plan.id}
            plan={plan}
            soldCount={usage[plan.id] ?? 0}
            onEdit={() => setEditing(plan.id)}
          />
        )
      )}

      {editing === "new" ? (
        <div className="lg:col-span-2 2xl:col-span-3">
          <PlanForm onDone={() => setEditing(null)} />
        </div>
      ) : (
        plans.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="lg:col-span-2 2xl:col-span-3 w-full rounded-card border border-dashed border-line-strong
                       min-h-12 py-3 text-tiny font-medium text-txt-soft
                       hover:border-txt-faint hover:text-txt hover:bg-surface-hover
                       transition-colors"
          >
            + Agregar plan
          </button>
        )
      )}
    </div>
  );
}

function PlanRow({
  plan,
  soldCount,
  onEdit,
}: {
  plan: Plan;
  soldCount: number;
  onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`card h-full p-5 ${plan.is_active ? "" : "opacity-65"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="h3 truncate">{plan.name}</h2>
            {!plan.is_active && (
              <span className="badge border-line-strong bg-surface-sunk text-txt-soft">
                Inactivo
              </span>
            )}
          </div>

          {plan.description && (
            <p className="mt-1 text-base text-txt-soft">{plan.description}</p>
          )}
        </div>
      </div>

      {/* Los dos números que definen el plan, con peso propio */}
      <div className="mt-4 flex items-baseline gap-6">
        <div>
          <span className="num text-huge font-semibold">
            {plan.uses_per_period}
          </span>
          <span className="ml-1.5 text-tiny text-txt-soft">entradas</span>
        </div>
        <div>
          <span className="num text-base font-medium text-txt-faint">
            {plan.period_days}
          </span>
          <span className="ml-1.5 text-tiny text-txt-faint">días (sin efecto)</span>
        </div>
      </div>
      <p className="mt-2 text-micro text-txt-faint">
        No depende de este número: vence el mismo día del mes siguiente al que paga.
      </p>

      {(plan.price_cash_cents != null || plan.price_transfer_cents != null) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-tiny">
          <span>
            <span className="text-txt-faint">Efectivo </span>
            <span className="font-mono font-medium">{formatMoney(plan.price_cash_cents)}</span>
          </span>
          <span>
            <span className="text-txt-faint">Transferencia </span>
            <span className="font-mono font-medium">{formatMoney(plan.price_transfer_cents)}</span>
          </span>
        </div>
      )}

      {soldCount > 0 && (
        <p className="mt-3 text-tiny text-txt-faint">
          Vendido {soldCount} {soldCount === 1 ? "vez" : "veces"}
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
        {confirmDelete ? (
          // Borrar no tiene vuelta atrás: se confirma en el lugar.
          <form action={deletePlan} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={plan.id} />
            <span className="text-tiny text-plate-red">¿Borrar el plan {plan.name}?</span>
            <SubmitButton className="btn-danger btn-sm" pendingLabel="Borrando…">
              Sí, borrar
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-ghost btn-sm"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <>
            <button type="button" onClick={onEdit} className="btn-ghost btn-sm">
              Editar
            </button>

            <form action={togglePlan}>
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="next" value={String(!plan.is_active)} />
              <SubmitButton className="btn-ghost btn-sm" pendingLabel="Guardando…">
                {plan.is_active ? "Desactivar" : "Reactivar"}
              </SubmitButton>
            </form>

            {soldCount === 0 && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn-danger btn-sm"
              >
                Borrar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan?: Plan; onDone: () => void }) {
  // Controlados: React 19 vacía (vuelve al valor inicial) los campos no
  // controlados después de cada envío, también si vuelve un error, y se
  // perdía lo que se había cambiado.
  const [draft, setDraft] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    uses_per_period: String(plan?.uses_per_period ?? 12),
    period_days: String(plan?.period_days ?? 30),
    price_cash: plan?.price_cash_cents != null ? String(plan.price_cash_cents / 100) : "",
    price_transfer:
      plan?.price_transfer_cents != null ? String(plan.price_transfer_cents / 100) : "",
    is_active: plan?.is_active ?? true,
  });
  type TextKey = Exclude<keyof typeof draft, "is_active">;
  const bind = (name: TextKey) => ({
    name,
    value: draft[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [name]: e.target.value })),
  });

  const [state, action] = useActionState(
    async (prev: unknown, fd: FormData) => {
      const res = await savePlan(prev, fd);
      if (res.ok) onDone();
      return res;
    },
    null
  );

  return (
    <form action={action} className="card p-5 space-y-4 border-line-strong">
      <h2 className="h3">{plan ? "Editar plan" : "Nuevo plan"}</h2>

      {plan && <input type="hidden" name="id" value={plan.id} />}

      <Field label="Nombre">
        <input {...bind("name")} required autoCapitalize="sentences" className="field" />
      </Field>

      <Field label="Descripción" hint="Opcional. Es lo que ve el socio.">
        <input {...bind("description")} className="field" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Entradas incluidas">
          <input
            {...bind("uses_per_period")}
            type="number"
            inputMode="numeric"
            min={1}
            step="1"
            required
            className="field font-mono"
          />
        </Field>

        <Field
          label="Días de duración"
          hint="No afecta el vencimiento: depende del día en que paga."
        >
          <input
            {...bind("period_days")}
            type="number"
            inputMode="numeric"
            min={1}
            step="1"
            required
            className="field font-mono"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio efectivo" hint="En pesos, sin puntos.">
          <MoneyInput {...bind("price_cash")} />
        </Field>

        <Field label="Precio transferencia">
          <MoneyInput {...bind("price_transfer")} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 min-h-11 text-base cursor-pointer">
        <input
          type="checkbox"
          name="is_active"
          checked={draft.is_active}
          onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
          className="size-4 rounded accent-plate-blue"
        />
        Disponible para vender
      </label>

      <FormError message={state?.error} />

      <div className="flex gap-2">
        <SubmitButton className="btn-primary" pendingLabel="Guardando…">
          Guardar plan
        </SubmitButton>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
