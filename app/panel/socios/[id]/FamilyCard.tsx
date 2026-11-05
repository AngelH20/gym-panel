"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkFamily, unlinkFamily } from "../actions";
import { FormError, SubmitButton } from "@/components/Form";
import { StatusBadge } from "@/components/StatusBadge";
import type { EffectiveStatus } from "@/lib/types";

export type FamilyCandidate = { id: string; full_name: string; family_id: string | null };
export type FamilyMember = {
  id: string;
  full_name: string;
  plan_name: string | null;
  effective_status: EffectiveStatus;
};

/**
 * Pack familiar: los dos primeros de una familia pagan el pase que quieran a
 * precio normal; del tercero en adelante, el Pase Libre Familiar. Acá se arma
 * la familia. La regla de "3 o más" la hace cumplir la base al vender.
 */
export function FamilyCard({
  memberId,
  family,
  candidates,
}: {
  memberId: string;
  family: FamilyMember[];
  candidates: FamilyCandidate[];
}) {
  const [linkState, linkAction] = useActionState(linkFamily, null);
  const [unlinkState, unlinkAction] = useActionState(unlinkFamily, null);
  const size = family.length + 1;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="h3">Familia</h2>
        {family.length > 0 && (
          <span className="text-tiny text-txt-faint">
            {size} integrantes{size >= 3 ? " · pack familiar" : ""}
          </span>
        )}
      </div>

      {family.length === 0 ? (
        <p className="text-base text-txt-soft mb-3">
          Sin familia cargada. Desde el tercer integrante, el pase libre sale con el pack familiar.
        </p>
      ) : (
        <ul className="datalist mb-3">
          {family.map((f) => (
            <li key={f.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/panel/socios/${f.id}`}
                  className="text-base font-semibold hover:text-plate-blue truncate block"
                >
                  {f.full_name}
                </Link>
                <p className="text-tiny text-txt-faint">{f.plan_name ?? "Sin pase"}</p>
              </div>
              <StatusBadge status={f.effective_status} />
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <form action={linkAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="member_id" value={memberId} />
          <select name="relative_id" required defaultValue="" className="field flex-1 min-w-48">
            <option value="" disabled>
              Vincular con un familiar…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <SubmitButton className="btn-ghost btn-sm" pendingLabel="Vinculando…">
            Vincular
          </SubmitButton>
        </form>
      )}
      <FormError message={linkState?.error} />

      {family.length > 0 && (
        <form action={unlinkAction} className="mt-2">
          <input type="hidden" name="member_id" value={memberId} />
          <SubmitButton className="btn-ghost btn-sm" pendingLabel="Quitando…">
            Quitar de la familia
          </SubmitButton>
        </form>
      )}
      <FormError message={unlinkState?.error} />
    </section>
  );
}
