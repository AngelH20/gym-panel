import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-surface-sunk">
      <div className="w-full max-w-sm text-center space-y-5">
        <span
          className="block scoreboard text-[5rem] text-txt-faint"
          aria-hidden="true"
        >
          404
        </span>

        <div className="space-y-1.5">
          <h1 className="h2">No encontramos esta página</h1>
          <p className="text-base text-txt-soft">
            Puede que el link esté vencido o mal escrito.
          </p>
        </div>

        <Link href="/" className="btn-primary inline-flex">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
