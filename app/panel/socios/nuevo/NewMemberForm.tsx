"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createMember } from "../actions";
import {
  PaymentFields,
  EMPTY_PAYMENT,
  suggestAmounts,
  type PaymentDraft,
} from "../PaymentFields";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney, formatDate, projectedRenewalEnd } from "@/lib/labels";
import type { Plan } from "@/lib/types";

const DRAFT_KEY = "caref:nuevo-socio:draft";

type Draft = {
  full_name: string;
  dni: string;
  phone: string;
  email: string;
  photo_url: string;
  notes: string;
  birth_date: string;
  plan_id: string;
  payment: PaymentDraft;
};

const EMPTY_DRAFT: Draft = {
  full_name: "",
  dni: "",
  phone: "",
  email: "",
  photo_url: "",
  notes: "",
  birth_date: "",
  plan_id: "",
  payment: EMPTY_PAYMENT,
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const saved = JSON.parse(raw);
    // Un borrador guardado antes del pago mixto no trae "payment": los
    // defaults lo cubren en vez de romper el formulario.
    return { ...EMPTY_DRAFT, ...saved, payment: { ...EMPTY_PAYMENT, ...saved.payment } };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage puede fallar en privado/incógnito; no es crítico.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // idem
  }
}

export function NewMemberForm({
  plans,
  cajaAbierta,
  today,
}: {
  plans: Plan[];
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
  const [planId, setPlanId] = useState("");
  const [payment, setPayment] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [startDate, setStartDate] = useState(today);
  const [hydrated, setHydrated] = useState(false);

  // Restaura lo que había quedado sin enviar (p. ej. si te fuiste a abrir
  // la caja y volviste). Recién después de hidratar corre el efecto que
  // guarda, para no pisar el borrador con el estado vacío del primer render.
  useEffect(() => {
    const d = loadDraft();
    setFullName(d.full_name);
    setDni(d.dni);
    setPhone(d.phone);
    setEmail(d.email);
    setPhotoUrl(d.photo_url);
    setNotes(d.notes);
    setBirthDate(d.birth_date);
    if (cajaAbierta) {
      setPlanId(d.plan_id);
      setPayment(d.payment);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft({
      full_name: fullName,
      dni,
      phone,
      email,
      photo_url: photoUrl,
      notes,
      birth_date: birthDate,
      plan_id: planId,
      payment,
    });
  }, [hydrated, fullName, dni, phone, email, photoUrl, notes, birthDate, planId, payment]);

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
    <form action={action} onSubmit={() => clearDraft()} className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="card p-5 space-y-4">
          <Field label="Nombre y apellido">
            <input
              name="full_name"
              required
              className="field"
              placeholder="Martina Gómez"
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
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              title="8 dígitos numéricos"
              className="field font-mono"
              placeholder="30111222"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input
                name="phone"
                className="field font-mono"
                placeholder="11 5555-0101"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>

            <Field label="Email">
              <input
                name="email"
                type="email"
                className="field"
                placeholder="Opcional"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Foto (URL)" hint="Opcional. La subida de archivos llega más adelante.">
            <input
              name="photo_url"
              className="field"
              placeholder="https://…"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
            />
          </Field>

          <Field
            label="Fecha de nacimiento"
            hint="Opcional. Si la cargás, el día que cumpla años se lo saludamos al entrar."
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

          <Field label="Notas">
            <textarea
              name="notes"
              rows={3}
              className="field resize-y"
              placeholder="Opcional"
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
                Opcional. El período arranca hoy (o la fecha que elijas) y vence el día 10 de un mes.
              </p>
            </div>

            {!cajaAbierta && (
              <div className="rounded-control border border-plate-amber/35 bg-plate-amber/12 p-3.5 space-y-2">
                <p className="text-tiny text-plate-amberInk">
                  La caja de hoy no está abierta. Abrila primero si querés cobrar y activar un pase
                  ahora — el socio se puede crear igual, y activás el pase después.
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
                    className={`text-left rounded-control border px-3.5 py-2.5 transition-colors ${
                      active
                        ? "border-plate-blue bg-plate-blue/6"
                        : "border-line bg-surface-sunk hover:border-line-strong"
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
                  <p className="rounded-control border border-line bg-surface px-3.5 py-3 text-tiny text-txt-soft">
                    Con esta fecha, el pase va a valer hasta el{" "}
                    <span className="font-medium text-txt">{formatDate(projectedEnd)}</span>{" "}
                    (el vencimiento es siempre el día 10 de un mes).
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
        Crear socio
      </SubmitButton>
    </form>
  );
}
