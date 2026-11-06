"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createMember } from "../actions";
import {
  PaymentFields,
  EMPTY_PAYMENT,
  paymentTotal,
  suggestAmounts,
  type PaymentDraft,
} from "../PaymentFields";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney, formatDate, projectedRenewalEnd } from "@/lib/labels";
import type { Plan } from "@/lib/types";

/** Un socio existente al que se puede vincular como familiar. */
export type Relative = { id: string; full_name: string; family_id: string | null };

// El formulario arranca siempre vacío. Antes guardaba un borrador en
// localStorage y, si alguien dejaba un alta a medias, el próximo "Nuevo
// socio" aparecía con los datos de esa otra persona. Tampoco usa el
// autocompletado del navegador (autoComplete="off"): cada alta es alguien
// distinto.
export function NewMemberForm({
  plans: allPlans,
  members,
  cajaAbierta,
  today,
}: {
  plans: Plan[];
  members: Relative[];
  cajaAbierta: boolean;
  today: string;
}) {
  const [state, action] = useActionState(createMember, null);

  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [relativeId, setRelativeId] = useState("");
  const [planId, setPlanId] = useState("");
  const [payment, setPayment] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [startDate, setStartDate] = useState(today);

  // Pack familiar: con el nuevo socio, ¿cuántos quedan en la familia? Si el
  // familiar elegido no tenía familia, son 2; si no, los que ya había más él.
  const relative = members.find((x) => x.id === relativeId);
  const familySize = !relative
    ? 1
    : relative.family_id
      ? members.filter((x) => x.family_id === relative.family_id).length + 1
      : 2;
  const plans = useMemo(
    () => allPlans.filter((p) => !p.is_family || familySize >= 3),
    [allPlans, familySize]
  );

  // Si saca al familiar y el plan elegido era el familiar, se deselecciona.
  useEffect(() => {
    if (planId && !plans.some((p) => p.id === planId)) {
      setPlanId("");
      setPayment((current) => suggestAmounts(current, undefined));
    }
  }, [plans, planId]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);

  // Si la pantalla queda abierta pasada la medianoche, "today" cambia (ver
  // DateRefresher). Si no se tocó la fecha de pago (seguía en el valor por
  // defecto), la corremos con él; si ya la habían cambiado a mano, se deja.
  const prevToday = useRef(today);
  useEffect(() => {
    if (today !== prevToday.current) {
      setStartDate((current) => (current === prevToday.current ? today : current));
      prevToday.current = today;
    }
  }, [today]);

  const projectedEnd = selectedPlan ? projectedRenewalEnd(startDate) : null;

  function choosePlan(plan: Plan) {
    if (!cajaAbierta) return;
    if (planId === plan.id) {
      setPlanId("");
      setPayment((current) => suggestAmounts(current, undefined));
      return;
    }
    setPlanId(plan.id);
    setPayment((current) => suggestAmounts(current, plan));
  }

  return (
    <form action={action} autoComplete="off" className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="card p-5 space-y-4">
          <Field label="Nombre y apellido">
            <input
              name="full_name"
              required
              autoCapitalize="words"
              enterKeyHint="next"
              className="field"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>

          <Field label="DNI" hint="8 dígitos, sin puntos ni espacios.">
            <input
              name="dni"
              required
              inputMode="numeric"
              enterKeyHint="next"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              title="8 dígitos numéricos"
              className="field font-mono"
              value={dni}
              // Si lo tipean o pegan con puntos ("30.123.456"), quedan los números.
              onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                enterKeyHint="next"
                className="field font-mono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>

            <Field label="Email (opcional)">
              <input
                name="email"
                type="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Foto (URL)" hint="Opcional. La subida de archivos llega más adelante.">
            <input
              name="photo_url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://…"
              className="field"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
            />
          </Field>

          <Field
            label="Fecha de nacimiento"
            hint="Opcional: si la cargás, le decimos feliz cumpleaños el día que entra."
          >
            <input
              name="birth_date"
              type="date"
              max={today}
              className="field font-mono"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </Field>

          {members.length > 0 && (
            <Field
              label="Es familiar de"
              hint={
                familySize >= 3
                  ? `Con este socio la familia queda en ${familySize}: le corresponde el pack familiar.`
                  : "Opcional. Desde el tercer integrante de una familia va el pack familiar."
              }
            >
              <select
                name="relative_id"
                className="field"
                value={relativeId}
                onChange={(e) => setRelativeId(e.target.value)}
              >
                <option value="">Nadie</option>
                {members.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Notas (opcional)">
            <textarea
              name="notes"
              rows={3}
              className="field resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        {plans.length > 0 && (
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="h3">Activar pase ahora</h2>
              <p className="mt-1 text-tiny text-txt-faint">
                Opcional. Arranca hoy (o la fecha que elijas) y vence el mismo día del mes
                siguiente.
              </p>
            </div>

            {!cajaAbierta && (
              <div className="note space-y-2.5">
                <p className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-plate-amber" aria-hidden="true" />
                  <span>
                  La caja de hoy no está abierta. Abrila primero si querés cobrar y activar un pase
                  ahora — el socio se puede crear igual, y activás el pase después.
                  </span>
                </p>
                <Link href="/panel/caja" className="btn-ghost btn-sm">
                  Ir a Caja
                </Link>
              </div>
            )}

            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${!cajaAbierta ? "opacity-50 pointer-events-none" : ""}`}
              aria-disabled={!cajaAbierta}
            >
              {plans.map((p) => {
                const active = planId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePlan(p)}
                    aria-pressed={active}
                    className={`text-left rounded-control border px-3.5 py-3 transition-colors ${
                      active
                        ? "border-plate-blue ring-1 ring-plate-blue"
                        : "border-line-strong bg-surface hover:border-txt-faint"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-medium">{p.name}</span>
                      <span className="text-tiny text-txt-faint shrink-0">
                        {p.uses_per_period} entradas
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-tiny">
                      <span>
                        <span className="text-txt-faint">Efvo. </span>
                        <span className="font-mono font-medium">{formatMoney(p.price_cash_cents)}</span>
                      </span>
                      <span>
                        <span className="text-txt-faint">Transf. </span>
                        <span className="font-mono font-medium">{formatMoney(p.price_transfer_cents)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <input type="hidden" name="plan_id" value={cajaAbierta ? planId : ""} />

            {cajaAbierta && planId && (
              <>
                <Field
                  label="Fecha de pago"
                  hint="Si cobraste hace unos días y recién ahora lo cargás, poné la fecha real. El pase arranca ese día."
                >
                  <input
                    name="start_date"
                    type="date"
                    required
                    max={today}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="field font-mono bg-surface"
                  />
                </Field>

                {projectedEnd && (
                  <p className="note bg-surface">
                    Con esta fecha, el pase va a valer hasta el{" "}
                    <span className="font-medium text-txt">{formatDate(projectedEnd)}</span>.
                  </p>
                )}

                <PaymentFields
                  plan={selectedPlan}
                  value={payment}
                  onChange={setPayment}
                  inputClass="field font-mono bg-surface"
                  noteClass="bg-surface"
                />
              </>
            )}
          </div>
        )}
      </div>

      <FormError message={state?.error} />

      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingLabel="Creando…">
        {cajaAbierta && selectedPlan ? "Crear socio y activar pase" : "Crear socio"}
        {cajaAbierta && selectedPlan && paymentTotal(payment) > 0 && (
          <span className="num font-semibold">
            · {formatMoney(Math.round(paymentTotal(payment) * 100))}
          </span>
        )}
      </SubmitButton>
    </form>
  );
}
