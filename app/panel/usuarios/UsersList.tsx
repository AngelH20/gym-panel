"use client";

import { useActionState, useState } from "react";
import { createStaffAccount, updateStaffRole, deleteStaffAccount } from "./actions";
import { Field, FormError, SubmitButton, EmptyState } from "@/components/Form";
import type { AdminRole, Staff } from "@/lib/types";
import { ALL_ROLES, MANAGER_CREATABLE_ROLES, ROLE_HINT, ROLE_LABEL } from "@/lib/roles";

export function UsersList({
  staff,
  currentUserId,
  actorRole,
}: {
  staff: Staff[];
  currentUserId: string | null;
  actorRole: AdminRole;
}) {
  const isProgramador = actorRole === "programador";
  // El dueño crea cuentas de profesor y de celular (el del QR del mostrador).
  const creatableRoles: AdminRole[] = isProgramador ? ALL_ROLES : MANAGER_CREATABLE_ROLES;
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      {staff.length === 0 ? (
        <EmptyState
          title="Solo estás vos"
          description="Todavía no diste de alta ninguna otra cuenta."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
          {staff.map((s) => (
            <StaffRow
              key={s.id}
              staff={s}
              isSelf={s.user_id === currentUserId}
              canChangeRole={isProgramador}
              canDelete={isProgramador || MANAGER_CREATABLE_ROLES.includes(s.role)}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <CreateForm roles={creatableRoles} onDone={() => setCreating(false)} />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-card border border-dashed border-line-strong
                     min-h-12 py-3 text-tiny font-medium text-txt-soft
                     hover:border-txt-faint hover:text-txt hover:bg-surface-hover
                     transition-colors"
        >
          + Agregar cuenta
        </button>
      )}
    </div>
  );
}

function StaffRow({
  staff,
  isSelf,
  canChangeRole,
  canDelete,
}: {
  staff: Staff;
  isSelf: boolean;
  canChangeRole: boolean;
  canDelete: boolean;
}) {
  const [roleState, roleAction] = useActionState(updateStaffRole, null);
  const [deleteState, deleteAction] = useActionState(deleteStaffAccount, null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="card h-full p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium truncate">
            {staff.full_name || staff.email}
            {isSelf && <span className="ml-1.5 text-tiny text-txt-faint">(vos)</span>}
          </p>
          <p className="text-tiny text-txt-faint truncate">{staff.email}</p>
        </div>
        <span className="badge shrink-0">
          {ROLE_LABEL[staff.role]}
        </span>
      </div>

      {isSelf ? (
        <p className="text-tiny text-txt-faint">
          No podés cambiarte el rol ni borrarte a vos mismo desde acá.
        </p>
      ) : !canChangeRole && !canDelete ? (
        <p className="text-tiny text-txt-faint">Esta cuenta solo la maneja el programador.</p>
      ) : (
        <>
          {canChangeRole && (
            <form action={roleAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={staff.id} />
              <select
                name="role"
                defaultValue={staff.role}
                className="field md:text-tiny md:min-h-9 py-1.5 w-auto"
                aria-label={`Rol de ${staff.full_name || staff.email}`}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn-ghost btn-sm" pendingLabel="Guardando…">
                Cambiar rol
              </SubmitButton>
            </form>
          )}
          <FormError message={roleState?.error} />

          {!canDelete ? null : confirmDelete ? (
            <form action={deleteAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={staff.id} />
              <span className="text-tiny text-plate-red">
                ¿Borrar esta cuenta? Pierde el acceso al panel.
              </span>
              <SubmitButton className="btn-danger btn-sm" pendingLabel="Borrando…">
                Confirmar
              </SubmitButton>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="btn-ghost btn-sm"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-danger btn-sm"
            >
              Borrar cuenta
            </button>
          )}
          <FormError message={deleteState?.error} />
        </>
      )}
    </li>
  );
}

function CreateForm({ roles, onDone }: { roles: AdminRole[]; onDone: () => void }) {
  const [state, action] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const res = await createStaffAccount(prev, formData);
      if (!res.error) onDone();
      return res;
    },
    null
  );
  const [role, setRole] = useState<AdminRole>("profesor");
  // Controlados: React 19 vacía los campos no controlados después de cada
  // envío, también con un error ("ya existe ese email"), y había que volver
  // a escribir todo.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="card p-5 space-y-3 border-line-strong">
      <h2 className="h3">Nueva cuenta</h2>

      <Field label="Nombre (opcional)">
        <input
          name="full_name"
          autoComplete="off"
          autoCapitalize="words"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="field"
        />
      </Field>

      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </Field>

      <Field label="Contraseña" hint="Al menos 8 caracteres. Se la pasás vos a esa persona.">
        {/* new-password: que el navegador no la guarde como la contraseña de
            quien la está creando (ni la autocomplete con la suya). */}
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field font-mono"
        />
      </Field>

      <Field label="Rol" hint={ROLE_HINT[role]}>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          className="field"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>

      <FormError message={state?.error} />

      <div className="flex gap-2">
        <SubmitButton className="btn-primary" pendingLabel="Creando…">
          Crear cuenta
        </SubmitButton>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
