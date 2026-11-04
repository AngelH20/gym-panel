import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminRole, Staff } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import { UsersList } from "./UsersList";

export default async function UsuariosPage() {
  const supabase = await createClient();

  // Dueño y programador. Un profesor que entre por URL directa se va de
  // vuelta al panel: esta pantalla ni aparece en su nav (PanelNav.tsx), y la
  // RLS de admins tampoco le deja ver otras cuentas
  // (sql/28_roles_programador_dueno.sql).
  const { data: role } = await supabase.rpc("current_admin_role");
  const actorRole = (role as AdminRole | null) ?? null;
  if (!isManagerRole(actorRole)) redirect("/panel");

  const [{ data: staff }, { data: userData }] = await Promise.all([
    supabase.from("admins").select("*").order("created_at"),
    supabase.auth.getUser(),
  ]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="h1">Usuarios</h1>
        <p className="mt-1.5 text-base text-txt-soft max-w-prose">
          {actorRole === "programador"
            ? "Quién puede entrar al panel y con qué rol."
            : "Quién puede entrar al panel. Podés dar de alta y borrar cuentas de profesor."}
        </p>
      </div>

      <UsersList
        staff={(staff ?? []) as Staff[]}
        currentUserId={userData?.user?.id ?? null}
        actorRole={actorRole!}
      />
    </div>
  );
}
