import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { PlanList } from "./PlanList";

export default async function PlanesPage() {
  const supabase = await createClient();

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
          Un plan define cuántas entradas incluye el pase y cuántos días dura.
          El período arranca el día que el socio paga.
        </p>
      </div>

      <PlanList plans={(plans ?? []) as Plan[]} usage={Object.fromEntries(counts)} />
    </div>
  );
}
