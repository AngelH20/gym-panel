import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import { getSessionClaims } from "@/lib/supabase/claims";
import { getGymName } from "@/lib/gym";
import { PanelNav, PanelTitle } from "./PanelNav";
import { ROLE_LABEL } from "@/lib/roles";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  // El rol y el nombre del gimnasio no dependen de quién es: arrancan ya,
  // mientras se verifica el JWT. getClaims casi siempre es local, pero en un
  // arranque en frío baja la clave pública (JWKS) de Supabase Auth, y ese
  // viaje ya no frena a los otros dos.
  const rolePromise = getCurrentAdminRole();
  const gymNamePromise = getGymName();

  // Quién está logueado, para mostrar su nombre abajo del menú. getClaims
  // verifica el JWT acá mismo (sin ir a Supabase Auth); cacheado por request
  // para que Usuarios lo reuse.
  const claims = await getSessionClaims();
  const userId = (claims?.sub as string | undefined) ?? "";
  const userEmail = (claims?.email as string | undefined) ?? "";

  const [role, gymName, { data: me }] = await Promise.all([
    rolePromise,
    gymNamePromise,
    supabase.from("admins").select("full_name, email").eq("user_id", userId).maybeSingle(),
  ]);

  if (!role) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  // El celular del mostrador no es staff: lo único que puede ver es el QR.
  // (En la base tampoco puede leer nada: sql/38_rol_celular.sql.)
  if (role === "celular") {
    redirect("/qr-movil");
  }

  const roleLabel = ROLE_LABEL[role];
  const displayName = staffDisplayName(me?.full_name, me?.email ?? userEmail);

  const salir = (
    <form action={signOut}>
      <button
        title="Salir"
        className="inline-flex items-center gap-2 min-h-9 px-2.5 rounded-control text-tiny font-medium
                   text-txt-soft hover:text-txt hover:bg-surface-hover transition-colors"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
        </svg>
        Salir
      </button>
    </form>
  );

  // Cuenta, tema y salir: abajo de la barra lateral en escritorio, y al
  // final del menú "Más" en el celular.
  const account = (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="min-w-0 px-2">
        <p className="text-tiny font-medium text-txt truncate" title={me?.email ?? userEmail}>
          {displayName}
        </p>
        <p className="text-micro text-txt-faint truncate">{roleLabel}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ThemeToggle />
        {salir}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      <DateRefresher />

      <aside
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-dvh
                   border-r border-line bg-surface"
      >
        <Link
          href="/panel"
          className="mx-3 mt-4 mb-4 flex items-center gap-2.5 min-h-10 px-2 rounded-control"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-caref.svg" alt="" className="size-8 shrink-0 object-contain" />
          <span className="text-base font-semibold truncate">{gymName}</span>
        </Link>

        <PanelNav variant="sidebar" role={role} />

        <div className="shrink-0 border-t border-line px-2 py-3">{account}</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Celular: cabecera mínima con el título de la pantalla. La
            navegación va abajo, a mano del pulgar (ver PanelNav "mobile"). */}
        <header className="md:hidden sticky top-0 z-30 border-b border-line bg-surface">
          <div className="px-4 h-14 flex items-center gap-3">
            <Link href="/panel" aria-label={`${gymName}, inicio`} className="shrink-0 rounded-control">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-caref.svg" alt="" className="size-7 object-contain" />
            </Link>
            <PanelTitle />
          </div>
        </header>

        <PanelNav variant="mobile" role={role} footer={account} />

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-10 pt-5 pb-24 md:pt-10 md:pb-12">
          {children}
        </main>
      </div>
    </div>
  );
}

/** El nombre cargado en la cuenta; si no tiene, uno armado con el email
 *  ("juan.perez92@gmail.com" → "Juan Perez"). */
function staffDisplayName(fullName: string | null | undefined, email: string): string {
  if (fullName?.trim()) return fullName.trim();
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/\d+/g, " ")
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ") || "Mi cuenta";
}
