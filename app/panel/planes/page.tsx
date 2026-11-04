import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { PlanList } from "./PlanList";

export default async function PlanesPage() {
  const supabase = await createClient();

  // Precios y planes son terreno de dueño y programador. Un profesor
  // que entre por URL directa se va de vuelta al panel, no solo se le oculta
  // el link del nav.
  const { data: isManager } = await supabase.rpc("is_manager");
  if (!isManager) redirect("/panel");

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .order("sort_order")
    .order("name");

  const { data: usage } = await supabase.from("memberships").select("plan_id");

  const counts = new Map<string, number>();
  for (const row of usage ?? []) {
    counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Planes</h1>
        <p className="mt-1.5 text-base text-txt-soft max-w-prose">
          Cuántas entradas trae cada pase. El vencimiento no se toca acá: depende del día en
          que paga cada socio.
        </p>
      </div>

      <PlanList plans={(plans ?? []) as Plan[]} usage={Object.fromEntries(counts)} />
    </div>
  );
}
