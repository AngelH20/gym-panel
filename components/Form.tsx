"use client";

import { useFormStatus } from "react-dom";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-tiny font-medium text-txt">
        {label}
      </span>
      {children}
      {hint && <span className="block mt-1.5 text-tiny text-txt-faint">{hint}</span>}
    </label>
  );
}

/**
 * Monto en pesos enteros: teclado numérico en el celular, "$" adelante para
 * que se lea como plata, y la ruedita del mouse no le cambia el valor sin
 * querer al scrollear la página (un clásico con type="number").
 */
export function MoneyInput({
  className = "field font-mono",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative block">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-faint"
        aria-hidden="true"
      >
        $
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step="1"
        autoComplete="off"
        onWheel={(e) => e.currentTarget.blur()}
        {...props}
        className={`${className} pl-7`}
      />
    </span>
  );
}

/** Botón que se desactiva solo mientras la Server Action está corriendo
 *  (así un doble toque no manda dos veces lo mismo). */
export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  className = "btn-primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  /** Además del envío en curso: por ejemplo, mientras falta un dato. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} className={className}>
      {pending && (
        <span
          className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Mensaje de error. No se disculpa: dice qué pasó y cómo seguir. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="flex gap-2 text-tiny font-medium text-plate-red"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4 shrink-0 mt-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
      </svg>
      {message}
    </p>
  );
}

/** Confirmación de que algo salió bien. Verde y con tilde, para que se vea
 *  de reojo; role="status" para que un lector de pantalla también lo diga. */
export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <p role="status" className="flex gap-2 text-tiny font-medium text-plate-green">
      <svg
        viewBox="0 0 24 24"
        className="size-4 shrink-0 mt-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {message}
    </p>
  );
}

/** Estado vacío: una invitación a actuar, no un cartel de tristeza. */
export function EmptyState({
  title,
  description,
  children,
  headingLevel = 3,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  /** Directo bajo el h1 de la página va 2; dentro de una sección con h2, 3. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="rounded-card border border-dashed border-line-strong px-6 py-14 text-center">
      <Heading className="h3">{title}</Heading>
      <p className="mt-1 text-tiny text-txt-soft max-w-sm mx-auto">
        {description}
      </p>
      {children && <div className="mt-5 flex justify-center gap-2">{children}</div>}
    </div>
  );
}
