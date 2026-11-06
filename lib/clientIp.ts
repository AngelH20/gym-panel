import "server-only";

const IP_FORMAT = /^[0-9a-fA-F:.]+$/;

/**
 * Clave del rate limit: la IPv4 tal cual, o el /64 de una IPv6.
 *
 * Con IPv6 cada conexión hogareña o celular recibe un /64 entero (2^64
 * direcciones) y puede usar una distinta en cada pedido: contando por
 * dirección exacta, el tope de intentos no frenaba a nadie. Se manda como
 * red ("2001:db8:1:2::/64"), que una columna inet guarda y compara igual que
 * una IP suelta.
 *
 * Lo usan el check-in público (perform_check_in_by_dni) y el login
 * (sql/39_login_rate_limit.sql).
 */
function rateLimitKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;

  const [head, tail, ...rest] = ip.split("::");
  if (rest.length > 0) return ip;
  const groupsOf = (part: string | undefined) =>
    part ? part.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])) : [];
  const left = groupsOf(head);
  const right = groupsOf(tail);
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return ip;

  const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill("0"), ...right];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/** IP real del cliente, ya como clave de rate limit (ver arriba), o null si
 *  no se puede saber. Vercel siempre manda x-forwarded-for (y pisa el que
 *  mande el cliente); el primer valor es el cliente. */
export function clientIpKey(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headerList.get("x-real-ip");
  return candidate && IP_FORMAT.test(candidate) ? rateLimitKey(candidate) : null;
}
