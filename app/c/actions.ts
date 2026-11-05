"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CheckInResult } from "@/lib/types";

const IP_FORMAT = /^[0-9a-fA-F:.]+$/;

/** IP real del que escanea, para el rate limit de perform_check_in_by_dni().
 *  Vercel siempre manda x-forwarded-for; el primer valor es el cliente. */
function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headerList.get("x-real-ip");
  return candidate && IP_FORMAT.test(candidate) ? candidate : null;
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
