"use client";

import { useActionState } from "react";
import { invalidateAccessSecret } from "./actions";
import { FormError, SubmitButton } from "@/components/Form";

/**
 * Botón de pánico al lado del QR: regenera el secreto de firma, así que
 * cualquier QR ya mostrado (foto, pantalla compartida, captura vieja) deja
 * de servir en el acto. Pide confirmación porque también invalida el QR
 * que está en pantalla en este mismo momento.
 */
export function InvalidateAccessButton() {
  const [state, action] = useActionState(invalidateAccessSecret, null);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Esto invalida TODOS los QR generados hasta ahora, incluido el que está en pantalla. ¿Confirmás?"
          )
        ) {
          e.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <SubmitButton pendingLabel="Invalidando…" className="btn-ghost btn-sm w-full">
        Invalidar todos los QR ahora
      </SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}
