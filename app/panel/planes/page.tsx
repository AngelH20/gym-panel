import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import { isManagerRole } from "@/lib/roles";
import type { Plan } from "@/lib/types";
import { PlanList } from "./PlanList";
import { PageHeader } from "@/components/PageHeader";

type PlanWithUsage = Plan & { memberships: { count: number }[] | null };

export default async function PlanesPage() {
  const supabase = await createClient();

  // Precios y planes son terreno de dueño y programador. Un profesor
  // que entre por URL directa se va de vuelta al panel, no solo se le oculta
  // el link del nav. Salen juntas: si no es manager, los datos se descartan
  // sin mostrarse.
  //  - El rol viene de la caché de la request (el layout ya lo pidió): antes
  //    era un rpc("is_manager") aparte, la misma pregunta otra vez.
  //  - Cuántos pases se vendieron de cada plan lo cuenta Postgres
  //    (memberships(count), con memberships_plan_idx). Antes se traían TODOS
  //    los pases de la historia para contarlos acá: crecía sin techo y,
  //    pasado el máximo de filas de la API (1000 por defecto en Supabase),
  //    los números quedaban cortos sin avisar.
  const [role, { data: plansRaw }] = await Promise.all([
    getCurrentAdminRole(),
    supabase.from("plans").select("*, memberships(count)").order("sort_order").order("name"),
  ]);
  if (!isManagerRole(role)) redirect("/panel");

  const usage: Record<string, number> = {};
  const plans: Plan[] = ((plansRaw ?? []) as PlanWithUsage[]).map(
    ({ memberships, ...plan }) => {
      usage[plan.id] = memberships?.[0]?.count ?? 0;
      return plan;
    }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planes"
        description="Cuántas entradas trae cada pase. El vencimiento no se toca acá: depende del día en que paga cada socio."
      />

      <PlanList plans={plans} usage={usage} />
    </div>
  );
}

export const metadata: Metadata = { title: "Planes" };
