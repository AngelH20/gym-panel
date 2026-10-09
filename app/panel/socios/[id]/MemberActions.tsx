"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  sellMembership,
  setMemberStatus,
  deleteMember,
  updateMembershipEnd,
  updateMembershipPlan,
} from "../actions";
import {
  PaymentFields,
  EMPTY_PAYMENT,
  suggestAmounts,
  type PaymentDraft,
} from "../PaymentFields";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatDate, projectedRenewalEnd } from "@/lib/labels";
import type { AdminRole, MemberOverview, Membership, Plan } from "@/lib/types";

export function MemberActions({
  member,
  plans,
  today,
  latestMembership,
  role,
  familySize = 1,
}: {
  member: MemberOverview;
  plans: Plan[];
  today: string;
  latestMembership: Membership | null;
  role?: AdminRole | null;
  /** Integrantes de su familia, él incluido. Desde 3 va el pack familiar. */
  familySize?: number;
}) {
  const isManager = role === "superadmin" || role === "admin";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const needsRenewal = member.effective_status !== "active";

  const [state, action] = useActionState(sellMembership, null);
  const [statusState, statusAction] = useActionState(setMemberStatus, null);
  const [deleteState, deleteAction] = useActionState(deleteMember, null);
  const [expirationState, expirationAction] = useActionState(updateMembershipEnd, null);
  const [planFixState, planFixAction] = useActionState(updateMembershipPlan, null);
  const [planId, setPlanId] = useState(member.plan_id ?? plans[0]?.id ?? "");
  const [payment, setPayment] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [startDate, setStartDate] = useState(today);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);

  // Sugerir el precio de lista al elegir el plan; el admin lo puede pisar
  // (descuentos, promos). Al cambiar de medio de pago lo resugiere el propio
  // PaymentFields.
  useEffect(() => {
    setPayment((current) => suggestAmounts(current, selectedPlan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

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

              {familySize >= 3 && plans.some((p) => p.is_family) && (
                <p className="rounded-control border border-plate-blue/30 bg-plate-blue/6 px-3.5 py-3 text-tiny text-txt-soft">
                  Su familia tiene {familySize} integrantes: si es del tercero en adelante, le
                  corresponde el pack familiar.
                </p>
              )}

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

              <PaymentFields plan={selectedPlan} value={payment} onChange={setPayment} />

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
                {/*
                  Corregir el pase mal cargado. La alternativa vieja era
                  volver a venderle el pase correcto, y eso dejaba un segundo
                  cobro en la caja del día: el total quedaba inflado por un
                  error de tipeo. Esto cambia el plan y nada más.
                */}
                {plans.length > 0 && (
                  <form action={planFixAction} className="pt-2 space-y-2">
                    <input type="hidden" name="membership_id" value={latestMembership.id} />
                    <input type="hidden" name="member_id" value={member.id} />

                    <Field
                      label="Corregir el plan del pase"
                      hint="Si le cargaste el plan equivocado. No toca la caja: no registra un cobro nuevo ni cambia el que ya está anotado."
                    >
                      <select
                        name="plan_id"
                        required
                        defaultValue={latestMembership.plan_id}
                        className="field"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.uses_per_period} entradas
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="flex flex-wrap items-end gap-2">
                      <Field
                        label="Entradas (opcional)"
                        hint="Vacío = las del plan elegido. Las ya usadas se respetan."
                      >
                        <input
                          name="uses_total"
                          type="number"
                          min={1}
                          step="1"
                          inputMode="numeric"
                          placeholder={String(latestMembership.uses_total)}
                          className="field font-mono w-28"
                        />
                      </Field>
                      <SubmitButton className="btn-ghost btn-sm" pendingLabel="Guardando…">
                        Guardar plan
                      </SubmitButton>
                    </div>
                  </form>
                )}
                <FormError message={planFixState?.error} />

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
