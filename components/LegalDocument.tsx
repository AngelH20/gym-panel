import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** Tema claro fijo, igual que /login y /c: los textos legales se leen igual
 *  tenga el dispositivo el modo oscuro o no. */
const LIGHT_TOKENS = {
  colorScheme: "light",
  "--color-txt": "22 24 29",
  "--color-txt-soft": "86 91 103",
  "--color-txt-faint": "112 117 129",
  "--color-txt-onAccent": "255 255 255",
  "--color-surface": "255 255 255",
  "--color-surface-sunk": "245 246 248",
  "--color-surface-hover": "246 247 249",
  "--color-line": "232 234 238",
  "--color-line-strong": "211 214 221",
  "--color-plate-red": "200 42 42",
  "--color-plate-blue": "36 82 194",
} as React.CSSProperties;

/** Marco común de /privacidad y /terminos: logo, título, texto y pie. */
export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-surface text-txt px-6 pt-12 pb-16" style={LIGHT_TOKENS}>
      <article className="mx-auto w-full max-w-prose">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-10 object-contain" />
          <p className="text-base font-semibold">{LEGAL.owner}</p>
        </div>

        <h1 className="mt-8 h1">{title}</h1>
        <p className="mt-1 text-tiny text-txt-faint">Última actualización: {LEGAL.updatedOn}</p>

        <div className="legal mt-8">{children}</div>

        <p className="mt-12 text-tiny text-txt-faint">
          <Link href="/privacidad" className="underline underline-offset-2">Privacidad</Link>
          {" · "}
          <Link href="/terminos" className="underline underline-offset-2">Términos</Link>
        </p>
      </article>
    </main>
  );
}
