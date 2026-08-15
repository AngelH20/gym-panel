"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { sellMembership, setMemberStatus, deleteMember } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney } from "@/lib/labels";
import type { MemberOverview, Plan, PaymentMethod } from "@/lib/types";

export function MemberActions({
  member,
  plans,
}: {
  member: MemberOverview;
  plans: Plan[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const needsRenewal = member.effective_status !== "active";

  const [state, action] = useActionState(sellMembership, null);
  const [planId, setPlanId] = useState(member.plan_id ?? plans[0]?.id ?? "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const suggested =
    selectedPlan == null
      ? null
      : method === "cash"
        ? selectedPlan.price_cash_cents
        : selectedPlan.price_transfer_cents;

  // Sugerir el precio de lista al elegir plan/medio; el admin lo puede pisar
  // (descuentos, promos). No lo pisamos si ya lo tocó a mano.
  useEffect(() => {
    setAmount(suggested != null ? String(suggested / 100) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, method]);

  return (
    <section className="card overflow-hidden">
      <div className="p-5">
        <h2 className="h3">{needsRenewal ? "Activar pase" : "Renovar pase"}</h2>

        {plans.length === 0 ? (
          <p className="mt-2 text-base text-txt-soft">
            Primero creá un plan en la sección Planes.
          </p>
        ) : (
          <>
            <p className="mt-1.5 mb-4 text-base text-txt-soft">
              Se cierra el período actual y arranca uno nuevo desde hoy, con las
              entradas del plan completas. Se registra en caja, pero acá no se
              cobra nada de verdad.
            </p>

            <form action={action} className="space-y-3">
              <input type="hidden" name="member_id" value={member.id} />

              <select
                name="plan_id"
                required
                className="field"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.uses_per_period} entradas
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                {(["cash", "transfer"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex items-center justify-between gap-2 rounded-control border px-3.5 py-2.5 text-base cursor-pointer transition-colors ${
                      method === m
                        ? "border-plate-blue bg-plate-blue/6"
                        : "border-line hover:border-line-strong"
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
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field font-mono"
                  placeholder="80000"
                />
              </Field>

              <FormError message={state?.error} />

              <SubmitButton
                className={needsRenewal ? "btn-primary w-full" : "btn-dark w-full"}
                pendingLabel="Activando…"
              >
                {needsRenewal ? "Activar pase" : "Renovar"}
              </SubmitButton>
            </form>
          </>
        )}
      </div>

      {/*
        Las acciones destructivas quedan plegadas. Renovar es lo que hacés todos
        los días; borrar un socio, casi nunca. La jerarquía debe reflejarlo.
      */}
      <div className="border-t border-line">
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full px-5 py-3 flex items-center justify-between
                     text-tiny text-txt-soft hover:text-txt hover:bg-surface-hover transition-colors"
          aria-expanded={showMore}
        >
          Más acciones
          <svg
            viewBox="0 0 24 24"
            className={`size-4 transition-transform ${showMore ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {showMore && (
          <div className="px-5 pb-5 pt-1 flex flex-wrap gap-2">
            <form action={setMemberStatus}>
              <input type="hidden" name="id" value={member.id} />
              <input
                type="hidden"
                name="status"
                value={member.member_status === "suspended" ? "active" : "suspended"}
              />
              <button className="btn-ghost btn-sm">
                {member.member_status === "suspended"
                  ? "Reactivar socio"
                  : "Suspender socio"}
              </button>
            </form>

            {confirmDelete ? (
              <form action={deleteMember} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={member.id} />
                <span className="text-tiny text-plate-red">
                  Se borran también sus entradas.
                </span>
                <button className="btn-danger btn-sm">Confirmar</button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn-ghost btn-sm"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-ghost btn-sm !text-plate-red"
              >
                Borrar socio
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
