"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CheckInResult } from "@/lib/types";

const IP_FORMAT = /^[0-9a-fA-F:.]+$/;

/**
 * Clave del rate limit: la IPv4 tal cual, o el /64 de una IPv6.
 *
 * Con IPv6 cada conexión hogareña o celular recibe un /64 entero (2^64
 * direcciones) y puede usar una distinta en cada pedido: contando por
 * dirección exacta, el tope de intentos de perform_check_in_by_dni() no
 * frenaba a nadie. Se manda como red ("2001:db8:1:2::/64"), que la columna
 * inet de checkin_attempts guarda y compara igual que una IP suelta.
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

/** IP real del que escanea, para el rate limit de perform_check_in_by_dni().
 *  Vercel siempre manda x-forwarded-for (y pisa el que mande el cliente);
 *  el primer valor es el cliente. */
function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headerList.get("x-real-ip");
  return candidate && IP_FORMAT.test(candidate) ? rateLimitKey(candidate) : null;
}

/**
 * Invoca perform_check_in_by_dni() con el service_role: esta ruta es pública
 * y anónima, no hay sesión de admin. El QR fijo del mostrador rota cada 40s
 * (ver /panel/acceso); ese token viaja oculto en el form, no lo tipea nadie.
 */
export async function checkIn(
  _prev: CheckInResult | null,
  formData: FormData
): Promise<CheckInResult> {
  // Ruta pública y anónima: todo lo que llega del form se valida antes de
  // tocar la base con la service_role.
  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const rawToken = String(formData.get("qr_token") ?? "").trim();
  // El token es un HMAC-SHA256 en hex (64 caracteres). Cualquier otra cosa
  // es basura: se manda null y la base contesta BAD_QR como siempre.
  const qrToken = /^[0-9a-f]{64}$/i.test(rawToken) ? rawToken.toLowerCase() : null;

  if (!/^\d{8}$/.test(dni)) {
    return {
      ok: false,
      code: "INVALID_DNI",
      message: "El DNI tiene que tener 8 dígitos, sin puntos ni espacios.",
    };
  }

  const supabase = createAdminClient();
  const headerList = await headers();

  const { data, error } = await supabase.rpc("perform_check_in_by_dni", {
    p_dni: dni,
    p_source: "qr",
    // Se guarda en check_ins: con un tope, para que nadie llene la tabla
    // mandando un User-Agent de megas.
    p_user_agent: headerList.get("user-agent")?.slice(0, 256) ?? null,
    p_qr_token: qrToken,
    p_client_ip: clientIp(headerList),
  });

  if (error) {
    return {
      ok: false,
      code: "INVALID_DNI",
      message: "No se pudo registrar la entrada. Probá de nuevo en un momento.",
    };
  }

  return data as CheckInResult;
}
