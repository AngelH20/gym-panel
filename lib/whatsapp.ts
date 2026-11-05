import { formatDayMonth } from "./labels";
import type { MemberOverview } from "./types";
import { cameDuringCurrentPass, daysWithoutComing, isInactive } from "./inactive";

/**
 * Links de WhatsApp (wa.me) con el mensaje ya escrito, para que recepción
 * le escriba a un socio en un toque: abre WhatsApp con el texto cargado y
 * la persona solo tiene que mandarlo (o retocarlo).
 *
 * Todo puro, sin consultas: sirve igual en el servidor que en el navegador.
 */

/**
 * Teléfono argentino como lo cargan en recepción -> formato de wa.me
 * ("549" + característica + número, 13 dígitos, sin 0 ni 15).
 *
 *   "299 15-412-3456"  -> "5492994123456"
 *   "0299 4123456"     -> "5492994123456"
 *   "+54 9 11 2345-6789" -> "5491123456789"
 *   "11 15 2345 6789"  -> "5491123456789"
 *
 * Un número que arranca con + (o 00) y otro código de país se deja como
 * está. Si no se puede armar un número válido (falta la característica,
 * sobran o faltan dígitos) devuelve null y no se muestra el botón.
 */
export function normalizeArgentinePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const international = /^\s*(\+|00)/.test(raw);
  let digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;

  if (international || digits.startsWith("54")) {
    if (digits.startsWith("54")) {
      digits = digits.slice(2);
      // "+54 9 ..." ya viene con el 9 de celular: se saca y se vuelve a poner.
      if (digits.length === 11 && digits.startsWith("9")) digits = digits.slice(1);
    } else {
      // Otro país: se confía en lo que cargaron, si el largo es razonable.
      return digits.length >= 8 && digits.length <= 15 ? digits : null;
    }
  }

  // El 0 de larga distancia de la característica ("0299").
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Característica + 15 + número: el 15 va justo después de la
  // característica, que tiene 2 (solo "11"), 3 o 4 dígitos.
  if (digits.length === 12) {
    const areaLengths = digits.startsWith("11") ? [2] : [3, 4];
    const areaLen = areaLengths.find((n) => digits.slice(n, n + 2) === "15");
    if (areaLen == null) return null;
    digits = digits.slice(0, areaLen) + digits.slice(areaLen + 2);
  }

  // En Argentina característica + número son siempre 10 dígitos, y las
  // características empiezan con 1, 2 o 3.
  if (digits.length !== 10 || !/^[1-3]/.test(digits)) return null;
  return `549${digits}`;
}

/** Link de wa.me con el mensaje armado. Null si el teléfono no sirve. */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const number = normalizeArgentinePhone(phone);
  if (!number) return null;
  return text
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${number}`;
}

/** "MARTINA GÓMEZ" / "martina gómez" -> "Martina". Respeta lo que ya viene
 *  bien escrito ("María José" -> "María"). */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  const allSameCase = first === first.toUpperCase() || first === first.toLowerCase();
  return allSameCase
    ? first.charAt(0).toLocaleUpperCase("es-AR") + first.slice(1).toLocaleLowerCase("es-AR")
    : first;
}

// ---------------------------------------------------------------------------
// Plantillas. Cortas, cálidas y en voseo. Cada una recibe el nombre completo
// (se usa el de pila) y el nombre del gimnasio (settings.gym_name).
// ---------------------------------------------------------------------------

type Base = { fullName: string; gymName: string };

/** "hoy" / "mañana" / "el 20/10". */
function whenLabel(periodEnd: string | null | undefined, daysLeft: number | null | undefined) {
  if (daysLeft === 0) return "hoy";
  if (daysLeft === 1) return "mañana";
  return `el ${formatDayMonth(periodEnd)}`;
}

/** Pase por vencer: por fecha o porque le quedan pocas entradas. */
export function expiringMessage({
  fullName,
  gymName,
  periodEnd,
  daysLeft,
  usesRemaining,
}: Base & {
  periodEnd: string | null;
  daysLeft?: number | null;
  usesRemaining?: number | null;
}): string {
  const hola = `¡Hola ${firstName(fullName)}! Te escribimos de ${gymName}.`;
  const byDate = daysLeft == null || daysLeft <= 3 || usesRemaining == null || usesRemaining > 2;
  const aviso = byDate
    ? `Tu pase vence ${whenLabel(periodEnd, daysLeft)}.`
    : usesRemaining === 1
      ? "Te queda 1 sola entrada en el pase."
      : usesRemaining === 0
        ? "Ya usaste todas las entradas del pase."
        : `Te quedan ${usesRemaining} entradas en el pase.`;
  return `${hola} ${aviso} Si querés renovarlo, lo hacemos cuando vengas. ¡Te esperamos!`;
}

/** Pase vencido (por fecha o porque se quedó sin entradas). */
export function expiredMessage({
  fullName,
  gymName,
  periodEnd,
  exhausted = false,
}: Base & { periodEnd: string | null; exhausted?: boolean }): string {
  const aviso = exhausted
    ? "se te terminaron las entradas del pase"
    : `tu pase venció el ${formatDayMonth(periodEnd)}`;
  return `¡Hola ${firstName(fullName)}! ¿Cómo andás? Te escribimos de ${gymName}: ${aviso}. Cuando quieras lo renovamos y seguís entrenando. ¡Te esperamos!`;
}

export function birthdayMessage({ fullName, gymName }: Base): string {
  return `¡Feliz cumpleaños, ${firstName(fullName)}! 🎂 Todo el equipo de ${gymName} te desea un día genial. ¡Que lo disfrutes mucho!`;
}

/** No viene hace un tiempo. Si nunca vino en este pase, lo dice así. */
export function inactiveMessage({
  fullName,
  gymName,
  days,
  neverCame = false,
}: Base & { days: number; neverCame?: boolean }): string {
  const hace = neverCame
    ? `Todavía no te vimos por ${gymName} desde que arrancó tu pase.`
    : `Hace ${days} días que no te vemos por ${gymName}.`;
  return `¡Hola ${firstName(fullName)}! ${hace} ¿Está todo bien? Tu pase sigue vigente, así que cuando quieras te esperamos para volver a entrenar.`;
}

export function genericMessage({ fullName, gymName }: Base): string {
  return `¡Hola ${firstName(fullName)}! Te escribimos de ${gymName}.`;
}

/**
 * El mensaje que más sentido tiene para la situación del socio (ficha):
 * cumpleaños, pase vencido, por vencer, no viene hace rato o un saludo.
 */
export function suggestedMessage(
  m: Pick<
    MemberOverview,
    | "full_name"
    | "effective_status"
    | "period_start"
    | "period_end"
    | "days_left"
    | "uses_remaining"
    | "last_check_in_at"
    | "is_birthday_today"
  >,
  gymName: string,
  today: string
): string {
  const base = { fullName: m.full_name, gymName };
  if (m.is_birthday_today) return birthdayMessage(base);
  if (m.effective_status === "expired" || m.effective_status === "exhausted") {
    return expiredMessage({
      ...base,
      periodEnd: m.period_end,
      exhausted: m.effective_status === "exhausted",
    });
  }
  if (m.effective_status === "active") {
    if ((m.days_left ?? 99) <= 3 || (m.uses_remaining ?? 99) <= 2) {
      return expiringMessage({
        ...base,
        periodEnd: m.period_end,
        daysLeft: m.days_left,
        usesRemaining: m.uses_remaining,
      });
    }
    if (isInactive(m, today)) {
      const days = daysWithoutComing(m, today) ?? 0;
      return inactiveMessage({ ...base, days, neverCame: !cameDuringCurrentPass(m) });
    }
  }
  return genericMessage(base);
}
