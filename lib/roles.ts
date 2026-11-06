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
 *   celular      NO es staff: el teléfono del mostrador. Solo muestra el QR
 *                de la entrada (/qr-movil). No entra al panel y en la base no
 *                puede leer ni tocar nada más (sql/38_rol_celular.sql).
 */
export const ROLE_LABEL: Record<AdminRole, string> = {
  programador: "Programador",
  dueno: "Dueño",
  profesor: "Profesor",
  celular: "Celular (QR)",
};

export const ROLE_HINT: Record<AdminRole, string> = {
  programador: "Control total, incluidos los roles de todas las cuentas.",
  dueno:
    "Todo el gimnasio: precios, anular cobros, corregir vencimientos, reabrir la caja y cuentas de profesor.",
  profesor:
    "Socios, cobrar pases, abrir y cerrar la caja, QR. No anula ni modifica cobros, no reabre la caja, no ve precios ni cuentas.",
  celular:
    "Para el teléfono del mostrador: solo muestra el QR de la entrada. No ve socios, caja ni nada del panel.",
};

export const ALL_ROLES = Object.keys(ROLE_LABEL) as AdminRole[];

/** Roles que el dueño puede crear y borrar (el programador, todos). */
export const MANAGER_CREATABLE_ROLES: AdminRole[] = ["profesor", "celular"];

/** Del staff: puede entrar al panel. El celular no. */
export function isStaffRole(role: AdminRole | null | undefined): boolean {
  return role != null && role !== "celular";
}

/** Dueño o programador: lo que antes era "admin o superadmin". */
export function isManagerRole(role: AdminRole | null | undefined): boolean {
  return role === "programador" || role === "dueno";
}

export function isProgramadorRole(role: AdminRole | null | undefined): boolean {
  return role === "programador";
}
