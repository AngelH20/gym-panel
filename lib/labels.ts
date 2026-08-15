/**
 * Traducciones y formateo.
 *
 * Los valores de enum viven en inglés en la base (identificadores) y se
 * traducen acá. Un solo lugar para cambiar cómo se lee cada estado.
 */

import type { EffectiveStatus, MemberStatus, PlanPeriod, PaymentMethod } from "./types";

export const TIMEZONE = "America/Argentina/Buenos_Aires";

export const effectiveStatusLabel: Record<EffectiveStatus, string> = {
  active: "Al día",
  expired: "Vencido",
  exhausted: "Sin usos",
  suspended: "Suspendido",
  no_membership: "Sin pase",
};

/** Clases de color por estado. Verde = puede entrar; rojo = no. */
export const effectiveStatusStyle: Record<EffectiveStatus, string> = {
  active: "bg-ok/12 text-ok border-ok/35",
  expired: "bg-alert/10 text-alert border-alert/35",
  exhausted: "bg-alert/10 text-alert border-alert/35",
  suspended: "bg-ink/8 text-ink-soft border-plate",
  no_membership: "bg-ink/8 text-ink-soft border-plate",
};

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: "Activo",
  suspended: "Suspendido",
};

export const planPeriodLabel: Record<PlanPeriod, string> = {
  month: "por mes",
  week: "por semana",
  day: "por día",
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
};

/** Fecha "2026-08-12" -> "12/08/2026". Sin objetos Date, para evitar el
 *  clásico bug de restar un día por zona horaria. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Timestamp -> "12/08 19:42" en hora de Buenos Aires. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Timestamp -> "19:42". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Timestamp -> hora 0-23 en Buenos Aires, para agrupar por franja horaria. */
export function hourLocal(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(hour, 10);
}

/** "YYYY-MM-DD" -> 0 (lunes) .. 6 (domingo). Mediodía UTC evita corrimientos. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=dom..6=sáb
  return (jsDay + 6) % 7; // 0=lun..6=dom
}

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Hoy en Buenos Aires, como "YYYY-MM-DD". */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" - N días, sin pasar por el huso horario local del server. */
export function daysAgoLocal(n: number): string {
  const [y, m, d] = todayLocal().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** "2026-08-14" -> "vie". Mediodía UTC evita que el huso corra el día. */
export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: TIMEZONE })
    .format(dt)
    .replace(".", "");
}

/** Centavos -> "$ 35.000". Todavía no se usa; queda listo para cobranzas. */
export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** "Martina Gómez" -> "MG" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
