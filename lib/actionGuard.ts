import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import { isManagerRole, isProgramadorRole, isStaffRole } from "@/lib/roles";
import type { AdminRole } from "@/lib/types";

/**
 * Chequeos comunes de las Server Actions del panel.
 *
 * Una Server Action es un endpoint POST público: cualquiera puede llamarla
 * con el id de la acción, haya o no un botón en pantalla. La barrera de
 * verdad es la base (RLS y los chequeos de rol dentro de cada función, ver
 * sql/28, sql/34 y sql/38), pero acá se repite el control por dos motivos:
 *   - que una sesión vencida, una cuenta borrada, el celular del mostrador o
 *     un profesor que llama algo de dueño reciban un mensaje claro y no un
 *     error crudo de Postgres o un "guardado" que en realidad no tocó nada
 *     (un UPDATE que la RLS filtra no da error: afecta 0 filas);
 *   - que nada llegue a la base si el que llama no tiene el rol, por si
 *     alguna política o función queda mal en una migración futura.
 */

export type Requirement = "staff" | "manager" | "programador";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Guard =
  | { ok: true; supabase: Supabase; role: AdminRole }
  | { ok: false; error: string };

const SESSION_EXPIRED = "Tu sesión venció. Volvé a entrar al panel.";

const DENIED: Record<Requirement, string> = {
  staff: "No tenés permiso para hacer esto.",
  manager: "Solo el dueño o el programador pueden hacer esto.",
  programador: "Solo el programador puede hacer esto.",
};

function meets(role: AdminRole, need: Requirement): boolean {
  if (need === "programador") return isProgramadorRole(role);
  if (need === "manager") return isManagerRole(role);
  return isStaffRole(role);
}

/** Sesión + rol del que llama. Usa el rol cacheado por request
 *  (getCurrentAdminRole): sin sesión la función de la base no se puede ni
 *  llamar y el rol sale null. */
export async function requireRole(need: Requirement): Promise<Guard> {
  const [supabase, role] = await Promise.all([createClient(), getCurrentAdminRole()]);
  if (!role) return { ok: false, error: SESSION_EXPIRED };
  if (!meets(role, need)) return { ok: false, error: DENIED[need] };
  return { ok: true, supabase, role };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids que llegan del form: si no son un UUID, ni se manda la consulta (si
 *  no, Postgres devuelve 'invalid input syntax for type uuid: "..."'). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Campo de texto del form, recortado. */
export function formText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/** AAAA-MM-DD de un día que existe ("2026-02-30" no). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Monto de dinero de un form (en pesos, como lo tipean) -> centavos, o null
 * si no es un número válido, es negativo o pasa el tope. Las columnas de
 * montos son integer (hasta ~21 millones de pesos en centavos): sin tope,
 * un "1e12" llegaba a la base y volvía como error crudo de rango.
 */
export const MAX_AMOUNT_PESOS = 10_000_000;

export function parsePesosToCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT_PESOS) return null;
  return Math.round(n * 100);
}

type DbError = { code?: string; message: string };

/**
 * Mensaje de error de la base apto para mostrar en pantalla.
 *
 * Las funciones del panel (sell_membership_split, void_sale, etc.) avisan
 * con RAISE EXCEPTION y un texto en castellano pensado para el usuario
 * ("La caja de hoy ya está cerrada"): esos (código P0001, o 42501/22023
 * cuando la función los pone a mano) se muestran tal cual. Todo lo demás es
 * un error interno (restricción violada, tipo inválido, función que no
 * existe en PostgREST, permiso denegado de Postgres) con nombres de tablas y
 * columnas: va al log del servidor y en pantalla sale el mensaje genérico.
 */
export function dbErrorMessage(scope: string, error: DbError, fallback: string): string {
  const code = error.code ?? "";
  const custom =
    code === "P0001" ||
    ((code === "42501" || code === "22023") && !/^permission denied/i.test(error.message));
  if (custom && error.message) return error.message;

  console.error(`[${scope}]`, error);
  if (code === "42501") return DENIED.staff;
  return fallback;
}

export const GENERIC_ERROR = "No se pudo guardar. Probá de nuevo en un momento.";
