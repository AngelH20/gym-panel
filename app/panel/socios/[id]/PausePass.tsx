"use client";

import { useActionState, useEffect, useState } from "react";
import { pauseMembership, resumeMembership } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { addDaysLocal, formatDate, formatDateTime, formatDayMonth } from "@/lib/labels";

/** Mismo tope que pause_membership en sql/33_pause_membership.sql. */
const MAX_PAUSE_DAYS = 90;

/** Días entre dos fechas "YYYY-MM-DD" (b - a), sin pasar por el huso horario. */
function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Pausa del pase, dentro de la tarjeta del pase en la ficha. Todos ven si
 * está pausado; pausar y reanudar es solo del dueño/programador (la base lo
 * controla igual, esto solo oculta los botones).
 */
export function PausePass({
  membershipId,
  periodEnd,
  today,
  pausedUntil,
  pausedAt,
  pausedByName,
  pauseReason,
  canPause,
  canManage,
}: {
  membershipId: string;
  periodEnd: string;
  today: string;
  /** Fecha de vuelta si el pase está pausado HOY; null si no. */
  pausedUntil: string | null;
  pausedAt?: string | null;
  pausedByName?: string | null;
  pauseReason?: string | null;
  /** Pase vigente, con entradas y sin pausa: se puede pausar. */
  canPause: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [pauseState, pauseAction] = useActionState(pauseMembership, null);
  const [resumeState, resumeAction] = useActionState(resumeMembership, null);

  // Si se pausó bien, se cierra el formulario (la página ya se revalidó).
  useEffect(() => {
    if (pauseState && !pauseState.error) {
      setOpen(false);
      setUntil("");
    }
  }, [pauseState]);

  if (pausedUntil) {
    // Si vuelve hoy, los días que no usó se descuentan del vencimiento.
    const resumedEnd = addDaysLocal(periodEnd, -daysBetween(today, pausedUntil));

    return (
      <div className="border-t border-line px-5 py-4 space-y-2">
        <p className="flex items-center gap-1.5 text-base font-medium">
          <span className="size-1.5 rounded-full bg-plate-blue" aria-hidden="true" />
          Pausado hasta el <span className="num">{formatDayMonth(pausedUntil)}</span>
        </p>
        <p className="text-tiny text-txt-faint">
          {pausedByName ? `Lo pausó ${pausedByName}` : "Pausado"}
          {pausedAt ? ` el ${formatDateTime(pausedAt)}` : ""}
          {pauseReason ? ` · ${pauseReason}` : ""}. No puede entrar hasta esa fecha.
        </p>

        {canManage && (
          <form action={resumeAction} className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <input type="hidden" name="membership_id" value={membershipId} />
            <SubmitButton className="btn-ghost btn-sm" pendingLabel="Reanudando…">
              Reanudar
            </SubmitButton>
            <span className="text-tiny text-txt-faint">
              Si vuelve hoy, el vencimiento pasa del{" "}
              <span className="num">{formatDate(periodEnd)}</span> al{" "}
              <span className="num text-txt">{formatDate(resumedEnd)}</span>.
            </span>
          </form>
        )}
        <FormError message={resumeState?.error} />
      </div>
    );
  }

  if (!canManage || !canPause) return null;

  const min = addDaysLocal(today, 1);
  const max = addDaysLocal(today, MAX_PAUSE_DAYS);
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(until) && until >= min && until <= max;
  const pauseDays = validUntil ? daysBetween(today, until) : 0;

  return (
    <div className="border-t border-line px-5 py-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm">
          Pausar pase
        </button>
      ) : (
        <form action={pauseAction} className="space-y-3">
          <input type="hidden" name="membership_id" value={membershipId} />

          <Field
            label="Vuelve el"
            hint={`Desde ese día puede volver a entrar. Hasta ${MAX_PAUSE_DAYS} días.`}
          >
            <input
              name="until"
              type="date"
              required
              min={min}
              max={max}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="field font-mono"
            />
          </Field>

          <Field label="Motivo (opcional)">
            <input
              name="reason"
              type="text"
              maxLength={300}
              className="field"
            />
          </Field>

          {validUntil && (
            <p className="note">
              {pauseDays === 1 ? "1 día" : `${pauseDays} días`} de pausa: el vencimiento pasa del{" "}
              <span className="num">{formatDate(periodEnd)}</span> al{" "}
              <span className="num font-medium text-txt">
                {formatDate(addDaysLocal(periodEnd, pauseDays))}
              </span>
              .
            </p>
          )}

          <FormError message={pauseState?.error} />

          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn-dark btn-sm" pendingLabel="Pausando…">
              Pausar
            </SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
