"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";

export function LoginForm({ volver }: { volver: string }) {
  const [state, action] = useActionState(signIn, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="volver" value={volver} />

      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          placeholder="vos@gimnasio.com"
          autoFocus
        />
      </Field>

      <Field label="Contraseña">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </Field>

      <FormError message={state?.error} />

      <SubmitButton pendingLabel="Entrando…" className="btn-primary w-full min-h-11">
        Entrar
      </SubmitButton>
    </form>
  );
}
