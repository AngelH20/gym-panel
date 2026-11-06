"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpKey } from "@/lib/clientIp";
import type { CheckInResult } from "@/lib/types";

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
    p_client_ip: clientIpKey(headerList),
  });

  if (error || !data) {
    console.error("[check-in] perform_check_in_by_dni:", error);
    return {
      ok: false,
      code: "INVALID_DNI",
      message: "No se pudo registrar la entrada. Probá de nuevo en un momento.",
    };
  }

  return publicResult(data as CheckInResult);
}

/** "Juan Pablo Pérez" -> "Juan P.": alcanza para el saludo y para las mismas
 *  iniciales del avatar ("JP"), sin mandar el nombre completo. */
function shortName(fullName: string): string {
  const [first = "", second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

/**
 * Lo que vuelve al navegador, campo por campo. La página es pública y
 * cualquiera con un QR vigente puede probar DNIs (con el tope de intentos por
 * IP de la base): no tiene sentido mandarle el nombre completo, el plan, el
 * vencimiento ni ids internos que la pantalla no muestra. Lo que no está en
 * esta lista no sale, aunque mañana la función de la base devuelva más cosas.
 */
function publicResult(r: CheckInResult): CheckInResult {
  return {
    ok: r.ok === true,
    code: r.code,
    message: typeof r.message === "string" ? r.message : "",
    member_name: r.member_name ? shortName(r.member_name) : undefined,
    photo_url: r.photo_url ?? null,
    uses_remaining: r.uses_remaining,
    uses_total: r.uses_total,
    visits_today: r.visits_today,
    is_birthday: r.is_birthday === true,
  };
}
