import type { MemberOverview } from "./types";
import { TIMEZONE } from "./labels";

/**
 * Socios "inactivos": pagan (tienen un pase activo y vigente) pero no vienen.
 *
 * Es la ÚNICA definición: Inicio ("No vienen hace 15 días o más") y el filtro
 * "Inactivos" de Socios la usan. Si
 * cambia la regla (por ejemplo, para dejar afuera a los pases pausados),
 * se cambia acá y listo.
 */

/** A partir de cuántos días sin venir se considera inactivo. */
export const INACTIVE_DAYS = 15;

/**
 * Lo que hace falta de member_overview para decidirlo. Si la regla suma una
 * columna (p. ej. la del pase pausado), agregala acá y TypeScript marca las
 * listas que la tienen que pedir: Inicio (DASHBOARD_COLUMNS) y Socios
 * (LIST_COLUMNS). La ficha la toma de MEMBER_DETAIL_COLUMNS, que se tipa
 * como MemberOverview entero: ahí hay que sumarla a mano.
 */
export type InactivityFields = Pick<
  MemberOverview,
  "effective_status" | "last_check_in_at" | "period_start"
>;

/** Timestamp -> "YYYY-MM-DD" en hora de Buenos Aires. */
function localDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Días entre dos fechas "YYYY-MM-DD" (to - from), sin pasar por el huso. */
function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Cuántos días hace que no viene, contando desde lo último entre su última
 * entrada y el arranque del pase actual. Así un pase recién sacado tiene sus
 * 15 días de gracia (aunque haga meses que no venía: si renovó, vino a
 * pagar), y el que nunca entró en este pase cuenta desde que arrancó.
 *
 * Null si no tiene un pase activo y vigente: a esos no se los mide.
 */
export function daysWithoutComing(m: InactivityFields, today: string): number | null {
  // "active" en member_overview = no suspendido, pase activo, sin vencer y
  // con entradas. Vencidos, sin entradas, sin pase y suspendidos quedan
  // afuera: de esos se ocupan las listas de cobro.
  if (m.effective_status !== "active" || !m.period_start) return null;
  const lastVisit = m.last_check_in_at ? localDateOf(m.last_check_in_at) : null;
  const since = lastVisit && lastVisit > m.period_start ? lastVisit : m.period_start;
  return daysBetween(since, today);
}

/** ¿Vino durante el pase actual? (para decir "no vino nunca desde que arrancó"). */
export function cameDuringCurrentPass(m: InactivityFields): boolean {
  if (!m.last_check_in_at || !m.period_start) return false;
  return localDateOf(m.last_check_in_at) >= m.period_start;
}

export function isInactive(m: InactivityFields, today: string): boolean {
  const days = daysWithoutComing(m, today);
  return days != null && days >= INACTIVE_DAYS;
}
