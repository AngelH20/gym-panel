import Link from "next/link";

/**
 * Links a los textos legales. Va en las pantallas que ve gente de afuera del
 * staff (/login y el check-in /c); el panel no lo necesita.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-tiny text-txt-faint ${className}`}>
      <nav aria-label="Textos legales" className="flex justify-center gap-1">
        <Link href="/privacidad" className="px-2 py-2 underline-offset-2 hover:underline">
          Privacidad
        </Link>
        <span aria-hidden="true" className="py-2">·</span>
        <Link href="/terminos" className="px-2 py-2 underline-offset-2 hover:underline">
          Términos
        </Link>
      </nav>
    </footer>
  );
}
