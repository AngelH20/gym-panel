"use client";

import { useActionState, useEffect, useState } from "react";
import { updateMember } from "../actions";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/Form";
import { formatDate, todayLocal } from "@/lib/labels";
import type { MemberOverview } from "@/lib/types";

type Draft = {
  full_name: string;
  dni: string;
  phone: string;
  email: string;
  photo_url: string;
  birth_date: string;
  welcome_message: string;
};

function draftFrom(member: MemberOverview): Draft {
  return {
    full_name: member.full_name,
    dni: member.dni ?? "",
    phone: member.phone ?? "",
    email: member.email ?? "",
    photo_url: member.photo_url ?? "",
    birth_date: member.birth_date ?? "",
    welcome_message: member.welcome_message ?? "",
  };
}

export function EditMemberForm({ member }: { member: MemberOverview }) {
  const [open, setOpen] = useState(false);
  // Controlados: React 19 vacía (vuelve al valor inicial) los campos no
  // controlados después de cada envío, también si vuelve un error, y se
  // perdía lo que se había corregido (por ejemplo, con un DNI repetido).
  const [draft, setDraft] = useState<Draft>(() => draftFrom(member));
  const bind = (name: keyof Draft) => ({
    name,
    value: draft[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [name]: e.target.value })),
  });
  const [state, action] = useActionState(updateMember, null);
  // Antes, al guardar bien el formulario seguía abierto igual y no había
  // forma de saber si se había guardado. Ahora se cierra y lo dice.
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state && !state.error) {
      setOpen(false);
      setSaved(true);
    }
  }, [state]);

  if (!open) {
    return (
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="h3">Datos</h2>
          <button
            type="button"
            onClick={() => {
              setDraft(draftFrom(member));
              setOpen(true);
              setSaved(false);
            }}
            className="btn-ghost btn-sm"
          >
            Editar
          </button>
        </div>

        {saved && (
          <div className="mb-2">
            <FormSuccess message="Cambios guardados." />
          </div>
        )}

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
    <form action={action} className="card p-5 space-y-4 border-line-strong">
      <h2 className="h3">Editar datos</h2>
      <input type="hidden" name="id" value={member.id} />

      <Field label="Nombre y apellido">
        <input
          {...bind("full_name")}
          required
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          className="field"
        />
      </Field>

      <Field label="DNI" hint="8 dígitos. Los puntos se sacan solos. Es lo que tipea en el kiosco de la entrada.">
        <input
          name="dni"
          value={draft.dni}
          required
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          pattern="[0-9]{8}"
          minLength={8}
          title="8 dígitos numéricos"
          onChange={(e) => {
            // Si lo tipean o pegan con puntos ("30.123.456"), quedan los números.
            const dni = e.target.value.replace(/\D/g, "").slice(0, 8);
            setDraft((d) => ({ ...d, dni }));
          }}
          className="field font-mono"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input
            {...bind("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="field font-mono"
          />
        </Field>
        <Field label="Email">
          <input
            {...bind("email")}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="field"
          />
        </Field>
      </div>

      <Field label="Foto (URL)">
        <input
          {...bind("photo_url")}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://…"
          className="field"
        />
      </Field>

      <Field
        label="Fecha de nacimiento"
        hint="Opcional: si la cargás, le decimos feliz cumpleaños el día que entra."
      >
        <input
          {...bind("birth_date")}
          type="date"
          max={todayLocal()}
          className="field font-mono"
        />
      </Field>

      <Field
        label="Mensaje de bienvenida personalizado"
        hint="Opcional: reemplaza el saludo genérico cuando este socio marca su primera entrada del día."
      >
        <textarea
          {...bind("welcome_message")}
          rows={2}
          className="field resize-y"
        />
      </Field>

      <FormError message={state?.error} />

      <div className="flex gap-2">
        <SubmitButton className="btn-primary" pendingLabel="Guardando…">
          Guardar cambios
        </SubmitButton>
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
      <dt className="text-tiny text-txt-faint w-24 shrink-0">{label}</dt>
      <dd className={`text-base truncate ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-txt-faint">—</span>}
      </dd>
    </div>
  );
}
