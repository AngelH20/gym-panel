/**
 * Links de WhatsApp (wa.me) para que recepción le escriba a un socio en un
 * toque. Abren el chat sin texto: no hay mensajes prearmados.
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
  // características empiezan con 2 o 3, salvo la de Buenos Aires (11): un
  // "15 2345 6789" (el 15 sin la característica) no es un número válido.
  if (digits.length !== 10 || !/^(11|[23])/.test(digits)) return null;
  return `549${digits}`;
}

/** Link de wa.me que abre el chat vacío: el mensaje lo escribe quien lo
 *  manda. Null si el teléfono no sirve. */
export function whatsappLink(phone: string | null | undefined): string | null {
  const number = normalizeArgentinePhone(phone);
  return number ? `https://wa.me/${number}` : null;
}
