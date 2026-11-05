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
      <span className="block mb-1.5 text-tiny font-semibold text-txt">
        {label}
      </span>
      {children}
      {hint && <span className="block mt-1.5 text-tiny text-txt-faint">{hint}</span>}
    </label>
  );
}

/** Botón que se desactiva solo mientras la Server Action está corriendo. */
export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
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
      className="flex gap-2.5 rounded-control border border-plate-red/40
                 bg-plate-red/10 px-3.5 py-3 text-tiny font-medium text-plate-red"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4 shrink-0 mt-px"
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

/** Estado vacío: una invitación a actuar, no un cartel de tristeza. */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border-2 border-dashed border-line-strong px-6 py-12 text-center">
      <h3 className="h2">{title}</h3>
      <p className="mt-2 text-base text-txt-soft max-w-sm mx-auto">
        {description}
      </p>
      {children && <div className="mt-6 flex justify-center gap-2">{children}</div>}
    </div>
  );
}
