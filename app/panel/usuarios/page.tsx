import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Staff } from "@/lib/types";
import { UsersList } from "./UsersList";

export default async function UsuariosPage() {
  const supabase = await createClient();

  // Solo superadmin gestiona cuentas. Un admin o profesor que entre por URL
  // directa se va de vuelta al panel: esta pantalla ni siquiera aparece en
  // el nav para ellos (ver PanelNav.tsx), pero la RLS de admins también lo
  // exige (sql/18_roles.sql), así que esto es un aviso temprano, no la única
  // barrera.
  const { data: isSuperadmin } = await supabase.rpc("is_superadmin");
  if (!isSuperadmin) redirect("/panel");

  const [{ data: staff }, { data: userData }] = await Promise.all([
    supabase.from("admins").select("*").order("created_at"),
    supabase.auth.getUser(),
  ]);

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="h1">Usuarios</h1>
        <p className="mt-1.5 text-base text-txt-soft max-w-prose">
          Quién puede entrar al panel y con qué rol. Esta pantalla solo la ves
          vos.
        </p>
      </div>

      <UsersList
        staff={(staff ?? []) as Staff[]}
        currentUserId={userData?.user?.id ?? null}
      />
    </div>
  );
}
