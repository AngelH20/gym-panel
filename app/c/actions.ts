"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const dni = String(formData.get("dni") ?? "").trim();
  const qrToken = String(formData.get("qr_token") ?? "").trim();

  const supabase = createAdminClient();
  const headerList = await headers();

  const { data, error } = await supabase.rpc("perform_check_in_by_dni", {
    p_dni: dni,
    p_source: "qr",
    p_user_agent: headerList.get("user-agent"),
    p_qr_token: qrToken || null,
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
