"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  sellMembership,
  setMemberStatus,
  deleteMember,
  archiveMember,
  updateMembershipEnd,
  updateMembershipPlan,
} from "../actions";
import {
  PaymentFields,
  EMPTY_PAYMENT,
  paymentTotal,
  suggestAmounts,
  type PaymentDraft,
} from "../PaymentFields";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/Form";
import { formatDate, formatMoney, projectedEndForPlan } from "@/lib/labels";
import type { AdminRole, MemberOverview, Membership, Plan } from "@/lib/types";
import { isManagerRole, isProgramadorRole } from "@/lib/roles";

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
  const isManager = isManagerRole(role);
  const isProgramador = isProgramadorRole(role);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveState, archiveAction] = useActionState(archiveMember, null);
  const [showMore, setShowMore] = useState(false);
  // Un pase pausado sigue vigente: se renueva, no se "activa".
  const needsRenewal =
    member.effective_status !== "active" && member.effective_status !== "paused";
  // Entradas del pase vigente que se perderían al cobrar uno nuevo.
  const remainingUses = needsRenewal ? 0 : member.uses_remaining ?? 0;

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

  const projectedEnd = selectedPlan ? projectedEndForPlan(startDate, selectedPlan) : null;
  const totalCents = Math.round(paymentTotal(payment) * 100);

  // Cobro hecho: en vez de dejar el formulario listo para un segundo toque
  // (y un segundo cobro en la caja), se muestra qué quedó registrado y hay
  // que pedir a propósito "Cargar otro cobro". Lo que se mandó se guarda al
  // enviar, porque la respuesta de la acción no trae esos datos.
  const submitted = useRef<{ end: string | null; cents: number; renewal: boolean } | null>(null);
  const [done, setDone] = useState<typeof submitted.current>(null);
  useEffect(() => {
    if (state && !state.error && submitted.current) {
      setDone(submitted.current);
      submitted.current = null;
    }
  }, [state]);

  function startAnother() {
    setDone(null);
    setStartDate(today);
    setPayment((current) => suggestAmounts(current, selectedPlan));
  }

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
              Arranca un período nuevo con todas las entradas del plan, y el cobro
              queda anotado en la caja del día.
            </p>

            {done ? (
              <div className="space-y-3">
                <div className="rounded-control border border-plate-green/40 bg-plate-green/6 px-3.5 py-3">
                  <FormSuccess
                    message={`${done.renewal ? "Pase renovado" : "Pase activado"}${
                      done.end ? ` hasta el ${formatDate(done.end)}` : ""
                    }. ${
                      done.cents > 0
                        ? `Quedó anotado en la caja: ${formatMoney(done.cents)}.`
                        : "Sin cobro en la caja."
                    }`}
                  />
                </div>
                <button type="button" onClick={startAnother} className="btn-ghost w-full">
                  Cargar otro cobro
                </button>
              </div>
            ) : (
            <form
              action={action}
              onSubmit={() => {
                submitted.current = { end: projectedEnd, cents: totalCents, renewal: !needsRenewal };
              }}
              className="space-y-3"
            >
              <input type="hidden" name="member_id" value={member.id} />

              <Field label="Plan">
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
              </Field>

              {familySize >= 3 && plans.some((p) => p.is_family) && (
                <p className="note">
                  Su familia tiene {familySize} integrantes: si es del tercero en adelante, le
                  corresponde el pack familiar.
                </p>
              )}

              <Field
                label="Fecha de pago"
                hint="Si te pagaron otro día (por ejemplo, sin internet), poné esa fecha: el pase arranca ese día."
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
                <p className="note">
                  Con esta fecha, el pase va a valer hasta el{" "}
                  <span className="font-medium text-txt">{formatDate(projectedEnd)}</span>.
                </p>
              )}

              {/* Vender un pase da de baja el que está vigente (renew_membership
                  pasa el activo a 'expired'): que no se pierdan entradas sin
                  que recepción lo note, por ejemplo al cobrar un "Día". */}
              {remainingUses > 0 && (
                <p role="status" className="flex gap-2 rounded-control border border-line px-3.5 py-3 text-tiny text-txt-soft">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-plate-amber" aria-hidden="true" />
                  <span>
                    Tiene{" "}
                    <span className="num font-medium text-txt">
                      {remainingUses} {remainingUses === 1 ? "entrada" : "entradas"}
                    </span>
                    {member.plan_name && <> de {member.plan_name}</>}
                    {member.period_end && (
                      <>
                        {" "}hasta el <span className="num font-medium text-txt">{formatDate(member.period_end)}</span>
                      </>
                    )}
                    . Si cobrás este pase, {remainingUses === 1 ? "la pierde" : "las pierde"}.
                  </span>
                </p>
              )}

              <PaymentFields plan={selectedPlan} value={payment} onChange={setPayment} />

              <FormError message={state?.error} />
              {/* "Abrí la caja antes de registrar cobros" / "ya está cerrada":
                  el arreglo está en otra pantalla, se deja el atajo a mano. */}
              {state?.error && /caja/i.test(state.error) && (
                <Link href="/panel/caja" className="btn-ghost btn-sm">
                  Ir a Caja
                </Link>
              )}

              {/* El monto en el botón: es la última mirada antes de cobrar. */}
              <SubmitButton
                className={needsRenewal ? "btn-primary w-full" : "btn-dark w-full"}
                pendingLabel={needsRenewal ? "Activando…" : "Renovando…"}
              >
                {needsRenewal ? "Activar pase" : "Renovar"}
                {totalCents > 0 && (
                  <span className="num font-semibold">· {formatMoney(totalCents)}</span>
                )}
              </SubmitButton>
            </form>
            )}
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
          type="button"
          onClick={() => setShowMore(!showMore)}
          aria-controls="socio-mas-acciones"
          className="w-full px-5 min-h-11 flex items-center justify-between
                     text-tiny font-medium text-txt-soft hover:text-txt hover:bg-surface-hover transition-colors"
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
          <div id="socio-mas-acciones" className="px-5 pb-4 pt-1 space-y-2">
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
          {confirmArchive ? (
            <form action={archiveAction} className="space-y-2">
              <input type="hidden" name="id" value={member.id} />
              <p className="text-tiny text-txt-soft">
                Se le cancela el pase vigente (no va a poder entrar), sale de su familia y deja
                de aparecer en las listas. Sus pagos y entradas se conservan. Si vuelve, lo
                reactivás desde Socios → Dados de baja.
              </p>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="btn-danger btn-sm" pendingLabel="Guardando…">
                  Confirmar baja
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setConfirmArchive(false)}
                  className="btn-ghost btn-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setConfirmArchive(true)}
              className="btn-danger btn-sm"
            >
              Dar de baja
            </button>
          )}
          <FormError message={archiveState?.error} />
        </div>
      )}

      {isProgramador && (
        <div className="border-t border-line px-5 py-4 space-y-2">
          {confirmDelete ? (
            <form action={deleteAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={member.id} />
              <span className="text-tiny text-plate-red">
                ¿Seguro? Se borran sus datos, entradas e historial de pases. Los cobros quedan
                en la caja con su nombre.
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
              className="min-h-9 text-tiny text-txt-faint underline-offset-4 hover:underline hover:text-plate-red transition-colors"
              title="Solo para errores de carga, como un socio duplicado"
            >
              Borrar definitivamente (error de carga)
            </button>
          )}
          <FormError message={deleteState?.error} />
        </div>
      )}
    </section>
  );
}
