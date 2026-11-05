"use client";

import { useActionState } from "react";
import { unarchiveMember } from "../actions";
import { FormError, SubmitButton } from "@/components/Form";
import { formatDateTime } from "@/lib/labels";

/** Reemplaza a las acciones de la ficha mientras el socio está dado de baja:
 *  lo único que tiene sentido hacer es reactivarlo. */
export function ArchivedBanner({
  memberId,
  archivedAt,
  archivedByName,
  canReactivate,
}: {
  memberId: string;
  archivedAt: string;
  archivedByName: string | null;
  canReactivate: boolean;
}) {
  const [state, action] = useActionState(unarchiveMember, null);

  return (
    <section className="card p-5 space-y-3 border-t-4 border-t-plate-amber">
      <div>
        <h2 className="h3">Dado de baja</h2>
        <p className="mt-1 text-tiny text-txt-soft">
          Por {archivedByName ?? "un admin"} el {formatDateTime(archivedAt)}. No aparece en las
          listas y no tiene pase vigente. Sus pagos y entradas se conservan.
        </p>
      </div>

      {canReactivate ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={memberId} />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Reactivando…">
            Reactivar socio
          </SubmitButton>
          <p className="text-tiny text-txt-faint">
            Vuelve a las listas. Para que pueda entrar, vendele un pase.
          </p>
          <FormError message={state?.error} />
        </form>
      ) : (
        <p className="text-tiny text-txt-faint">Solo un admin puede reactivarlo.</p>
      )}
    </section>
  );
}
