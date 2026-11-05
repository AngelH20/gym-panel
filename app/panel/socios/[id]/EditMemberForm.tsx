"use client";

import { useActionState, useState } from "react";
import { updateMember } from "../actions";
import { Field, FormError, SubmitButton } from "@/components/Form";
import { formatDate } from "@/lib/labels";
import type { MemberOverview } from "@/lib/types";

export function EditMemberForm({ member }: { member: MemberOverview }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateMember, null);

  if (!open) {
    return (
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="h3">Datos</h2>
          <button onClick={() => setOpen(true)} className="btn-ghost btn-sm">
            Editar
          </button>
        </div>

        <dl className="datalist sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
          <Row label="DNI" value={member.dni} mono />
          <Row label="Teléfono" value={member.phone} mono />
          <Row label="Email" value={member.email} />
          <Row label="Socio desde" value={formatDate(member.joined_on)} mono />
          <Row
            label="Cumpleaños"
            value={member.birth_date ? formatDate(member.birth_date) : null}
            mono
          />
          <Row label="Bienvenida" value={member.welcome_message} wide />
        </dl>
      </section>
    );
  }

  return (
    <form action={action} className="card p-5 space-y-4 border-plate-blue ring-[3px] ring-plate-blue/20">
      <h2 className="h3">Editar datos</h2>
      <input type="hidden" name="id" value={member.id} />

      <Field label="Nombre y apellido">
        <input name="full_name" required defaultValue={member.full_name} className="field" />
      </Field>

      <Field label="DNI" hint="8 dígitos, sin puntos ni espacios. Es lo que tipea en el kiosco de la entrada.">
        <input
          name="dni"
          required
          inputMode="numeric"
          pattern="[0-9]{8}"
          minLength={8}
          maxLength={8}
          title="8 dígitos numéricos"
          defaultValue={member.dni ?? ""}
          className="field font-mono"
          placeholder="30111222"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input name="phone" defaultValue={member.phone ?? ""} className="field font-mono" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={member.email ?? ""} className="field" />
        </Field>
      </div>

      <Field label="Foto (URL)">
        <input name="photo_url" defaultValue={member.photo_url ?? ""} className="field" />
      </Field>

      <Field
        label="Fecha de nacimiento"
        hint="Opcional: si la cargás, le decimos feliz cumpleaños el día que entra."
      >
        <input
          name="birth_date"
          type="date"
          defaultValue={member.birth_date ?? ""}
          className="field font-mono"
        />
      </Field>

      <Field
        label="Mensaje de bienvenida personalizado"
        hint="Opcional: reemplaza el saludo genérico cuando este socio marca su primera entrada del día."
      >
        <textarea
          name="welcome_message"
          rows={2}
          className="field resize-y"
          placeholder="Bienvenido a CAREF, wachín"
          defaultValue={member.welcome_message ?? ""}
        />
      </Field>

      <FormError message={state?.error} />

      <div className="flex gap-2">
        <SubmitButton className="btn-primary">Guardar cambios</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`py-2.5 flex items-baseline gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-tiny font-medium text-txt-faint w-24 shrink-0">{label}</dt>
      <dd className={`text-base truncate ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-txt-faint">—</span>}
      </dd>
    </div>
  );
}
