import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { PanelNav } from "./PanelNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DateRefresher } from "./DateRefresher";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "gym_name")
    .single();

  const gymName = (setting?.value as string) ?? "CAREF";

  const logo = (
    <Link href="/panel" className="flex items-center gap-2.5 min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-caref.svg" alt="" className="size-7 shrink-0 object-contain" />
      <span className="font-display text-lg font-semibold truncate">{gymName}</span>
    </Link>
  );

  const salir = (
    <form action={signOut}>
      <button className="text-tiny text-txt-onDarkSoft hover:text-txt-onDark transition-colors">
        Salir
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh md:flex">
      <DateRefresher />
      {/*
        Sidebar fija a la izquierda en escritorio. Cromo oscuro contra
        contenido claro, mismo criterio que antes tenía la barra de arriba:
        el contraste ordena la jerarquía.
      */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-dvh
                   bg-ink text-txt-onDark border-r border-ink-raised/50"
      >
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-ink-raised/50">
          {logo}
        </div>

        <PanelNav variant="sidebar" />

        <div className="shrink-0 p-4 flex items-center justify-between gap-3 border-t border-ink-raised/50">
          <ThemeToggle />
          {salir}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/*
          En el celular no hay lugar para una columna lateral: el header
          queda arriba, con la navegación pegada abajo del todo, a mano del
          pulgar sin competir con la barra de estado del teléfono.
        */}
        <header className="md:hidden bg-ink text-txt-onDark sticky top-0 z-30 shadow-chrome">
          <div className="px-4 h-14 flex items-center justify-between gap-3">
            {logo}
            <div className="flex items-center gap-3 shrink-0">
              <ThemeToggle />
              {salir}
            </div>
          </div>
          <PanelNav variant="mobile" />
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
