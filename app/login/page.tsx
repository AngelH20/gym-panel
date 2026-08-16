import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;

  return (
    <main className="min-h-dvh grid md:grid-cols-2">
      {/* En celular: barra azul con el logo, angosta, arriba de todo. */}
      <div className="md:hidden flex items-center gap-2.5 bg-plate-blue text-white px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-caref.svg" alt="" className="size-9 object-contain" />
        <span className="font-display text-title font-semibold">CAREF</span>
      </div>

      {/*
        Panel oscuro: el mismo cromo que la barra del panel, así el login no
        parece de otra aplicación. En celular se oculta.
      */}
      <div className="hidden md:flex flex-col bg-ink text-txt-onDark p-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-caref.svg"
            alt="CAREF"
            className="w-full max-w-[640px] object-contain"
          />
        </div>

        <p className="text-tiny text-txt-onDarkSoft text-center">Panel de gestión</p>
      </div>

      <div
        className="flex items-center justify-center px-6 py-12 bg-surface"
        style={
          {
            colorScheme: "light",
            "--color-txt": "23 27 31",
            "--color-txt-soft": "86 92 92",
            "--color-txt-faint": "138 144 144",
            "--color-surface": "251 251 250",
            "--color-surface-sunk": "241 242 240",
            "--color-surface-hover": "245 246 244",
            "--color-line": "223 225 221",
            "--color-line-strong": "200 204 199",
          } as React.CSSProperties
        }
      >
        <div className="w-full max-w-md">
          <h1 className="h1 md:text-huge">Entrar al panel</h1>
          <p className="mt-2 mb-8 text-base md:text-lg text-txt-soft">
            Usá el email con el que te dieron de alta.
          </p>

          <LoginForm volver={volver ?? "/panel"} />
        </div>
      </div>
    </main>
  );
}
