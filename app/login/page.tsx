import { LoginForm } from "./LoginForm";

/** Los tokens del tema claro, fijos: el formulario de entrada se ve siempre
 *  igual, tenga el dispositivo el modo oscuro o no. */
const LIGHT_TOKENS = {
  colorScheme: "light",
  "--color-txt": "13 24 43",
  "--color-txt-soft": "66 79 100",
  "--color-txt-faint": "98 111 132",
  "--color-txt-onAccent": "255 255 255",
  "--color-surface": "255 255 255",
  "--color-surface-sunk": "233 237 242",
  "--color-surface-hover": "243 245 248",
  "--color-line": "218 224 231",
  "--color-line-strong": "168 179 194",
  "--color-plate-red": "180 35 45",
  "--color-plate-blue": "31 95 175",
} as React.CSSProperties;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;

  return (
    <main className="min-h-dvh flex flex-col md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] bg-ink">
      {/*
        Cromo marino del escudo, el mismo de la barra del panel: el login no
        parece de otra aplicación. En celular queda como una franja arriba;
        en escritorio ocupa la mitad, con el escudo grande.
      */}
      <div className="chrome text-txt-onDark flex md:flex-col items-center md:items-start md:justify-between gap-4 px-6 py-6 md:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-caref.svg"
          alt=""
          className="size-14 md:size-auto md:w-full md:max-w-[420px] md:mx-auto md:my-auto object-contain"
        />

        <div>
          <p className="font-display text-[2.5rem] md:text-[5.5rem] leading-[0.9] font-black">
            CAREF
          </p>
          <p className="mt-1 md:mt-3 text-tiny md:text-lg text-txt-onDarkSoft">Panel de gestión</p>
        </div>
      </div>

      <div
        className="flex-1 flex items-start md:items-center justify-center px-6 pt-10 pb-12 md:p-12
                   bg-surface rounded-t-[20px] md:rounded-none"
        style={LIGHT_TOKENS}
      >
        <div className="w-full max-w-sm">
          <h1 className="h1 md:text-[2.75rem] md:leading-[2.75rem]">Entrar al panel</h1>
          <p className="mt-3 mb-8 text-base md:text-lg text-txt-soft">
            Usá el email con el que te dieron de alta.
          </p>

          <LoginForm volver={volver ?? "/panel"} />
        </div>
      </div>
    </main>
  );
}
