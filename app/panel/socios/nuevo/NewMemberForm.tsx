"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createMember } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatMoney, formatDate, addDaysLocal } from "@/lib/labels";
import type { Plan, PaymentMethod } from "@/lib/types";

const DRAFT_KEY = "caref:nuevo-socio:draft";

type Draft = {
  full_name: string;
  dni: string;
  phone: string;
  email: string;
  photo_url: string;
  notes: string;
  plan_id: string;
  method: PaymentMethod;
  amount: string;
};

const EMPTY_DRAFT: Draft = {
  full_name: "",
  dni: "",
  phone: "",
  email: "",
  photo_url: "",
  notes: "",
  plan_id: "",
  method: "cash",
  amount: "",
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
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
  const [planId, setPlanId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
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
    if (cajaAbierta) {
      setPlanId(d.plan_id);
      setMethod(d.method);
      setAmount(d.amount);
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
      plan_id: planId,
      method,
      amount,
    });
  }, [hydrated, fullName, dni, phone, email, photoUrl, notes, planId, method, amount]);

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

  const projectedEnd = selectedPlan ? addDaysLocal(startDate, selectedPlan.period_days - 1) : null;
  const alreadyExpired = projectedEnd != null && projectedEnd < today;

  function choosePlan(plan: Plan) {
    if (!cajaAbierta) return;
    if (planId === plan.id) {
      setPlanId("");
      setAmount("");
      return;
    }
    setPlanId(plan.id);
    const suggested = method === "cash" ? plan.price_cash_cents : plan.price_transfer_cents;
    setAmount(suggested != null ? String(suggested / 100) : "");
  }

  function chooseMethod(m: PaymentMethod) {
    setMethod(m);
    if (selectedPlan) {
      const suggested = m === "cash" ? selectedPlan.price_cash_cents : selectedPlan.price_transfer_cents;
      setAmount(suggested != null ? String(suggested / 100) : "");
    }
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
                Opcional. El período arranca hoy (o la fecha que elijas) y dura los días del plan.
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
                        {p.uses_per_period} entr. / {p.period_days} días
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

                {alreadyExpired && (
                  <p className="rounded-control border border-plate-amber/35 bg-plate-amber/12 px-3.5 py-3 text-tiny text-plate-amberInk">
                    Con esta fecha y este plan, el pase ya vencería el {formatDate(projectedEnd)}.
                    Revisá la fecha o el plan antes de confirmar.
                  </p>
                )}

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
                          onChange={() => chooseMethod(m)}
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
      </div>

      <FormError message={state?.error} />

      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingLabel="Creando…">
        Crear socio
      </SubmitButton>
    </form>
  );
}
