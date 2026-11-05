import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import { PanelNav } from "./PanelNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconSettings } from "@/components/icons";
import { DateRefresher } from "./DateRefresher";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // El middleware ya exige que haya una sesión para llegar hasta acá, pero
  // no chequea la allowlist de admins (para no pagar ese viaje extra a
  // Supabase en CADA request del sitio, incluido /c). Lo verificamos acá,
  // que solo corre para /panel/*: si alguna vez se habilita el alta pública
  // en el proyecto de Supabase, un usuario autenticado no-admin no llega a
  // ver ni la cáscara del panel (las tablas ya estaban protegidas por RLS,
  // esto además le corta el paso a la página).
  // Los dos van juntos: son viajes independientes a Supabase y encadenarlos
  // le sumaba una ida y vuelta de red a CADA navegación del panel. El rol ya
  // dice si está en la allowlist (null = no es admin), así que no hace falta
  // preguntar is_admin() aparte. getCurrentAdminRole está cacheado por
  // request: si la página también pide el rol, no hay un segundo viaje.
  const [role, { data: setting }] = await Promise.all([
    getCurrentAdminRole(),
    supabase.from("settings").select("value").eq("key", "gym_name").single(),
  ]);

  if (!role) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const gymName = (setting?.value as string) ?? "CAREF";

  const logo = (
    <Link href="/panel" className="flex items-center gap-2.5 min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-caref.svg" alt="" className="size-11 shrink-0 object-contain" />
      <span className="font-display text-xl font-semibold truncate">{gymName}</span>
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
        <div className="h-20 shrink-0 flex items-center px-4 border-b border-ink-raised/50">
          {logo}
        </div>

        <PanelNav variant="sidebar" role={role} />

        <div className="shrink-0 px-3 pt-3 border-t border-ink-raised/50">
          <Link
            href="/panel/settings"
            className="flex items-center gap-3 rounded-control px-3.5 py-2.5 text-base font-medium
                       text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised/60 transition-colors"
          >
            <IconSettings className="size-[18px] shrink-0" />
            Configuración
          </Link>
        </div>

        <div className="shrink-0 p-4 flex items-center justify-between gap-3">
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
          <div className="px-4 h-20 flex items-center justify-between gap-3">
            {logo}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/panel/settings"
                aria-label="Personalización"
                title="Personalización"
                className="flex size-8 items-center justify-center rounded-control
                           text-txt-onDarkSoft hover:text-txt-onDark hover:bg-ink-raised transition-colors"
              >
                <IconSettings className="size-4.5" />
              </Link>
              <ThemeToggle />
              {salir}
            </div>
          </div>
          <PanelNav variant="mobile" role={role} />
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
