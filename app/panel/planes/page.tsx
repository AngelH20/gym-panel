import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { PlanList } from "./PlanList";
import { PageHeader } from "@/components/PageHeader";

export default async function PlanesPage() {
  const supabase = await createClient();

  // Precios y planes son terreno de dueño y programador. Un profesor
  // que entre por URL directa se va de vuelta al panel, no solo se le oculta
  // el link del nav. Las tres consultas salen juntas (antes iban de a una):
  // si no es manager, los datos se descartan sin mostrarse.
  const [{ data: isManager }, { data: plans }, { data: usage }] = await Promise.all([
    supabase.rpc("is_manager"),
    supabase.from("plans").select("*").order("sort_order").order("name"),
    supabase.from("memberships").select("plan_id"),
  ]);
  if (!isManager) redirect("/panel");

  const counts = new Map<string, number>();
  for (const row of usage ?? []) {
    counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planes"
        description="Cuántas entradas trae cada pase. El vencimiento no se toca acá: depende del día en que paga cada socio."
      />

      <PlanList plans={(plans ?? []) as Plan[]} usage={Object.fromEntries(counts)} />
    </div>
  );
}
