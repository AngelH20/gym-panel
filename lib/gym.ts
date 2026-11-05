import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Nombre del gimnasio si todavía no se cargó en settings. */
export const DEFAULT_GYM_NAME = "CAREF";

/**
 * Nombre del gimnasio (settings.gym_name). Cacheado por request, igual que
 * getCurrentAdminRole: el layout de /panel y las páginas que arman mensajes
 * de WhatsApp lo piden en la misma request y así es un solo viaje.
 */
export const getGymName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "gym_name").maybeSingle();
  const value = typeof data?.value === "string" ? data.value.trim() : "";
  return value || DEFAULT_GYM_NAME;
});
