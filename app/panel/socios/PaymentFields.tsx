"use client";

import { Field } from "@/components/Form";
import { formatMoney } from "@/lib/labels";
import type { Plan } from "@/lib/types";

/**
 * Cómo se cobró el pase: todo por un medio, o repartido entre los dos.
 *
 * "split" es el caso del mostrador: un pase de $100.000 que se paga con
 * $60.000 por transferencia y $40.000 en efectivo. Del lado del servidor cada
 * medio deja su propio movimiento en la caja del día, así los totales por
 * medio y el arqueo del efectivo siguen saliendo solos.
 */
export type PaymentMode = "cash" | "transfer" | "split";

export type PaymentDraft = {
  mode: PaymentMode;
  /** Monto único, en pesos. Se usa en modo "cash" y "transfer". */
  amount: string;
  /** Las dos patas del pago mixto, en pesos. Solo se usan en modo "split". */
  cash: string;
  transfer: string;
};

export const EMPTY_PAYMENT: PaymentDraft = {
  mode: "cash",
  amount: "",
  cash: "",
  transfer: "",
};

const MODE_LABEL: Record<PaymentMode, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  split: "Mixto",
};

/** Precio de lista del plan para un medio, en pesos y listo para un input. */
function listPrice(plan: Plan | undefined, method: "cash" | "transfer"): string {
  const cents = method === "cash" ? plan?.price_cash_cents : plan?.price_transfer_cents;
  return cents != null ? String(cents / 100) : "";
}

/** Pesos tipeados -> número. Vacío o basura cuenta como 0. */
function pesos(value: string): number {
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Lo que suma el cobro, en pesos. Para mostrar el total del pago mixto. */
export function paymentTotal(draft: PaymentDraft): number {
  return draft.mode === "split"
    ? pesos(draft.cash) + pesos(draft.transfer)
    : pesos(draft.amount);
}

/**
 * Rellena los montos con el precio de lista del plan. Se llama al cambiar de
 * plan o de medio de pago; el sugerido siempre se puede pisar a mano
 * (descuentos, promos).
 *
 * En modo mixto no se sugiere nada: cuánto va por cada lado lo decide quien
 * cobra, y arrancar en blanco evita tener que borrar un número puesto de más.
 */
export function suggestAmounts(draft: PaymentDraft, plan: Plan | undefined): PaymentDraft {
  if (draft.mode === "split") return { ...draft, cash: "", transfer: "" };
  return { ...draft, amount: listPrice(plan, draft.mode) };
}

export function PaymentFields({
  plan,
  value,
  onChange,
  /** Los campos van sobre fondo hundido salvo en el alta, donde la tarjeta
   *  del pase ya está hundida y el contraste va al revés. */
  inputClass = "field font-mono",
  noteClass = "bg-surface-sunk",
}: {
  plan: Plan | undefined;
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  inputClass?: string;
  noteClass?: string;
}) {
  const total = paymentTotal(value);

  function setMode(mode: PaymentMode) {
    onChange(suggestAmounts({ ...value, mode }, plan));
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {(["cash", "transfer", "split"] as const).map((m) => (
          <label
            key={m}
            className={`flex flex-col gap-0.5 rounded-control border px-3 py-2.5 text-tiny font-semibold cursor-pointer transition-colors ${
              value.mode === m
                ? "border-plate-blue bg-plate-blue/8 ring-1 ring-plate-blue"
                : "border-line-strong hover:border-txt-faint"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={value.mode === m}
                onChange={() => setMode(m)}
                className="accent-plate-blue"
              />
              {MODE_LABEL[m]}
            </span>
            <span className="font-mono text-micro font-normal text-txt-faint pl-5">
              {m === "split"
                ? "Los dos"
                : formatMoney(m === "cash" ? plan?.price_cash_cents : plan?.price_transfer_cents)}
            </span>
          </label>
        ))}
      </div>

      {value.mode === "split" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="En efectivo">
              <input
                name="amount_cash"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                value={value.cash}
                onChange={(e) => onChange({ ...value, cash: e.target.value })}
                className={inputClass}
                placeholder="40000"
              />
            </Field>
            <Field label="Por transferencia">
              <input
                name="amount_transfer"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                value={value.transfer}
                onChange={(e) => onChange({ ...value, transfer: e.target.value })}
                className={inputClass}
                placeholder="60000"
              />
            </Field>
          </div>

          <p
            className={`rounded-control border border-line ${noteClass} px-3.5 py-3 text-tiny text-txt-soft flex items-center justify-between gap-3`}
          >
            <span>Total cobrado</span>
            <span className="font-display text-title leading-none font-extrabold text-txt">
              {formatMoney(Math.round(total * 100))}
            </span>
          </p>
        </>
      ) : (
        <Field label="Monto cobrado">
          <input
            name="amount"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            required
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            className={inputClass}
            placeholder="80000"
          />
        </Field>
      )}
    </>
  );
}
