/**
 * Formatos de email y teléfono de los socios. Una sola regla para el
 * navegador (atributo pattern de los inputs) y para el servidor
 * (app/panel/socios/actions.ts), así no pueden quedar distintas.
 *
 * Todo puro, sin dependencias: sirve igual en el servidor que en el cliente.
 */

/** Teléfono: de 8 a 15 dígitos, con espacios, guiones, puntos, paréntesis o +
 *  entre medio. Un celular argentino con 54 y 9 tiene 13; un fijo, 10. Para
 *  el atributo pattern (que el navegador ancla solo y compila con el flag v,
 *  por eso los escapes dentro de la clase). */
export const PHONE_PATTERN = String.raw`(?:[ +\(\)\-\.]*[0-9]){8,15}[ +\(\)\-\.]*`;

export const PHONE_HINT = "Entre 8 y 15 números. Podés usar espacios, guiones o +.";

export function isValidPhone(phone: string): boolean {
  // Sin flags: esos escapes son válidos igual, y así no depende del target.
  return new RegExp(`^${PHONE_PATTERN}$`).test(phone);
}

/** Email: algo@algo.dominio, sin espacios. El navegador ya lo chequea con
 *  type="email"; esto es la misma idea del lado del servidor. */
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
