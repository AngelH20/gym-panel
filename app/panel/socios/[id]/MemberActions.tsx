"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { sellMembership, setMemberStatus, deleteMember, updateMembershipEnd } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney, formatDate, projectedRenewalEnd } from "@/lib/labels";
import type { AdminRole, MemberOverview, Membership, Plan, PaymentMethod } from "@/lib/types";

export function MemberActions({
  member,
  plans,
  today,
  latestMembership,
  role,
}: {
  member: MemberOverview;
  plans: Plan[];
  today: string;
  latestMembership: Membership | null;
  role?: AdminRole | null;
}) {
  const isManager = role === "superadmin" || role === "admin";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const needsRenewal = member.effective_status !== "active";

  const [state, action] = useActionState(sellMembership, null);
  const [statusState, statusAction] = useActionState(setMemberStatus, null);
  const [deleteState, deleteAction] = useActionState(deleteMember, null);
  const [expirationState, expirationAction] = useActionState(updateMembershipEnd, null);
  const [planId, setPlanId] = useState(member.plan_id ?? plans[0]?.id ?? "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(today);

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

  // Si la pantalla queda abierta pasada la medianoche, "today" cambia (ver
  // DateRefresher). Si el admin no tocó la fecha de pago (seguía en el valor
  // por defecto), la corremos con él; si ya la había cambiado a mano, la
  // dejamos como está.
  const prevToday = useRef(today);
  useEffect(() => {
    if (today !== prevToday.current) {
      setStartDate((current) => (current === prevToday.current ? today : current));
      prevToday.current = today;
    }
  }, [today]);

  const projectedEnd = selectedPlan ? projectedRenewalEnd(startDate) : null;

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

              <Field
                label="Fecha de pago"
                hint="Si cobraste este pago hace unos días (por ejemplo, sin internet) poné la fecha real en que te pagaron. El pase arranca ese día."
              >
                <input
                  name="start_date"
                  type="date"
                  required
                  max={today}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="field font-mono"
                />
              </Field>

              {projectedEnd && (
                <p className="rounded-control border border-line bg-surface-sunk px-3.5 py-3 text-tiny text-txt-soft">
                  Con esta fecha, el pase va a valer hasta el{" "}
                  <span className="font-medium text-txt">{formatDate(projectedEnd)}</span>{" "}
                  (el vencimiento es siempre el día 10 de un mes).
                </p>
              )}

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
        Suspender es lo único que queda plegado: se usa poco y no es
        destructivo. Borrar socio, en cambio, va siempre visible: es la
        acción que la gente viene a buscar y no debería costar encontrarla.
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
          <div className="px-5 pb-4 pt-1 space-y-2">
            <form action={statusAction}>
              <input type="hidden" name="id" value={member.id} />
              <input
                type="hidden"
                name="status"
                value={member.member_status === "suspended" ? "active" : "suspended"}
              />
              <SubmitButton className="btn-ghost btn-sm" pendingLabel="Guardando…">
                {member.member_status === "suspended"
                  ? "Reactivar socio"
                  : "Suspender socio"}
              </SubmitButton>
            </form>
            <FormError message={statusState?.error} />

            {isManager && latestMembership && (
              <>
                <form action={expirationAction} className="flex flex-wrap items-end gap-2 pt-2">
                  <input type="hidden" name="membership_id" value={latestMembership.id} />
                  <input type="hidden" name="member_id" value={member.id} />
                  <Field
                    label="Cambiar vencimiento"
                    hint="Para corregir una fecha mal calculada o reactivar un pase que quedó marcado como vencido."
                  >
                    <input
                      name="period_end"
                      type="date"
                      required
                      min={latestMembership.period_start}
                      defaultValue={latestMembership.period_end}
                      className="field font-mono"
                    />
                  </Field>
                  <SubmitButton className="btn-ghost btn-sm" pendingLabel="Guardando…">
                    Guardar
                  </SubmitButton>
                </form>
                <FormError message={expirationState?.error} />
              </>
            )}
          </div>
        )}
      </div>

      {isManager && (
        <div className="border-t border-line px-5 py-4 space-y-2">
          {confirmDelete ? (
            <form action={deleteAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={member.id} />
              <span className="text-tiny text-plate-red">
                ¿Seguro? Se borran también sus entradas y el historial de pases.
              </span>
              <SubmitButton className="btn-danger btn-sm" pendingLabel="Borrando…">
                Confirmar borrado
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
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-ghost btn-sm !text-plate-red"
            >
              Borrar socio
            </button>
          )}
          <FormError message={deleteState?.error} />
        </div>
      )}
    </section>
  );
}
