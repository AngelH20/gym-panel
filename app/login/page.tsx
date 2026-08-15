import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;

  return (
    <main className="min-h-dvh grid md:grid-cols-2">
      {/*
        Panel oscuro: el mismo cromo que la barra del panel, así el login no
        parece de otra aplicación. En celular se oculta.
      */}
      <div className="hidden md:flex flex-col justify-between bg-ink text-txt-onDark p-10">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-10 object-contain" />
          <span className="font-display text-title font-semibold">CAREF</span>
        </div>

        <div className="max-w-sm">
          <p className="font-display text-huge font-bold leading-tight">
            Quién entra,
            <br />
            cuánto le queda.
          </p>
          <p className="mt-4 text-base text-txt-onDarkSoft">
            Socios, pases y entradas del día en una sola pantalla.
          </p>
        </div>

        <p className="text-tiny text-txt-onDarkSoft">Panel de gestión</p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2.5 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-caref.svg" alt="" className="size-9 object-contain" />
            <span className="font-display text-title font-semibold">CAREF</span>
          </div>

          <h1 className="h1">Entrar al panel</h1>
          <p className="mt-1.5 mb-6 text-base text-txt-soft">
            Usá el email con el que te dieron de alta.
          </p>

          <LoginForm volver={volver ?? "/panel"} />
        </div>
      </div>
    </main>
  );
}
