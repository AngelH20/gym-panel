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
      <div className="hidden md:flex flex-col bg-ink text-txt-onDark p-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-40 object-contain" />
          <span className="mt-6 font-display text-huge font-bold tracking-tight">
            CAREF
          </span>
        </div>

        <p className="text-tiny text-txt-onDarkSoft text-center">Panel de gestión</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="md:hidden flex items-center gap-2.5 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-caref.svg" alt="" className="size-9 object-contain" />
            <span className="font-display text-title font-semibold">CAREF</span>
          </div>

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
