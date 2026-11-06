"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/Form";

export function LoginForm({ volver }: { volver: string }) {
  const [state, action] = useActionState(signIn, null);
  // En el celular se tipea con un dedo y sin ver: poder mirar la contraseña
  // ahorra el "no me deja entrar" por una letra mal puesta.
  const [showPassword, setShowPassword] = useState(false);
  // Controlado: React 19 vacía los campos no controlados después de cada
  // envío, y con un error había que volver a escribir el email.
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="volver" value={volver} />

      <Field label="Email">
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          autoFocus
        />
      </Field>

      {/* Sin <Field>: el botón de ver la contraseña no puede ir dentro del
          <label> (se sumaría a su nombre accesible). */}
      <div>
        <label htmlFor="login-password" className="block mb-1.5 text-tiny font-medium text-txt">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            className="field pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label="Mostrar contraseña"
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control text-txt-faint hover:text-txt"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
      </div>

      <FormError message={state?.error} />

      <SubmitButton pendingLabel="Entrando…" className="btn-primary w-full min-h-11">
        Entrar
      </SubmitButton>
    </form>
  );
}
