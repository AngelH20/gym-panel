import Link from "next/link";

/** Anidado en /panel: ver app/panel/error.tsx — misma idea, para 404. */
export default function PanelNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
      <span
        className="block scoreboard text-[5rem] text-txt-faint"
        aria-hidden="true"
      >
        404
      </span>

      <div className="space-y-1.5">
        <h1 className="h2">No encontramos esto</h1>
        <p className="text-base text-txt-soft max-w-sm">
          Puede que se haya borrado o que el link esté mal escrito.
        </p>
      </div>

      <Link href="/panel" className="btn-primary">
        Ir al panel
      </Link>
    </div>
  );
}
