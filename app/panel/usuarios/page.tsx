import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import type { Staff } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import { UsersList } from "./UsersList";
import { PageHeader } from "@/components/PageHeader";

export default async function UsuariosPage() {
  const supabase = await createClient();

  // Dueño y programador. Un profesor que entre por URL directa se va de
  // vuelta al panel: esta pantalla ni aparece en su nav (PanelNav.tsx), y la
  // RLS de admins tampoco le deja ver otras cuentas
  // (sql/28_roles_programador_dueno.sql).
  // Las tres consultas salen juntas: la lista ya la filtra la RLS, y si el rol
  // no alcanza se descarta sin mostrarse. Antes la lista esperaba al rol.
  const [role, { data: staff }, { data: userData }] = await Promise.all([
    // Cacheado por request: el layout ya lo pidió, no es otro viaje.
    getCurrentAdminRole(),
    supabase
      .from("admins")
      .select("id, user_id, email, full_name, role, created_at")
      .order("created_at"),
    supabase.auth.getUser(),
  ]);
  const actorRole = role;
  if (!isManagerRole(actorRole)) redirect("/panel");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description={
          actorRole === "programador"
            ? "Quién puede entrar al panel y con qué rol."
            : "Quién puede entrar al panel. Podés dar de alta y borrar cuentas de profesor."
        }
      />

      <UsersList
        staff={(staff ?? []) as Staff[]}
        currentUserId={userData?.user?.id ?? null}
        actorRole={actorRole!}
      />
    </div>
  );
}
