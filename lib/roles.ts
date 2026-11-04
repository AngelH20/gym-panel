import type { AdminRole } from "@/lib/types";

/**
 * Los tres roles del panel, de más a menos permisos (ver
 * sql/28_roles_programador_dueno.sql, que es la barrera de verdad: esto es
 * solo para mostrar u ocultar cosas en pantalla).
 *
 *   programador  Control total. Además de lo del dueño: cambiar roles,
 *                crear o borrar cuentas de dueño/programador y borrar un
 *                socio para siempre.
 *   dueno        Todo el uso del gimnasio: precios, anular cobros, corregir
 *                vencimientos, dar de baja socios, reabrir la caja, y dar de
 *                alta o borrar cuentas de profesor.
 *   profesor     El que está en la sala: socios, cobrar pases, abrir y cerrar
 *                la caja, QR. No toca la caja una vez cerrada, no anula ni
 *                modifica cobros, no ve precios ni cuentas.
 */
export const ROLE_LABEL: Record<AdminRole, string> = {
  programador: "Programador",
  dueno: "Dueño",
  profesor: "Profesor",
};

export const ROLE_HINT: Record<AdminRole, string> = {
  programador: "Control total, incluidos los roles de todas las cuentas.",
  dueno:
    "Todo el gimnasio: precios, anular cobros, corregir vencimientos, reabrir la caja y cuentas de profesor.",
  profesor:
    "Socios, cobrar pases, abrir y cerrar la caja, QR. No anula ni modifica cobros, no reabre la caja, no ve precios ni cuentas.",
};

export const ALL_ROLES = Object.keys(ROLE_LABEL) as AdminRole[];

/** Dueño o programador: lo que antes era "admin o superadmin". */
export function isManagerRole(role: AdminRole | null | undefined): boolean {
  return role === "programador" || role === "dueno";
}

export function isProgramadorRole(role: AdminRole | null | undefined): boolean {
  return role === "programador";
}
