import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { todayLocal } from "@/lib/labels";
import { NewMemberForm, type Relative } from "./NewMemberForm";
import { PageHeader } from "@/components/PageHeader";

export default async function NuevoSocioPage() {
  const supabase = await createClient();
  const today = todayLocal();

  const [{ data: plans }, { data: opening }, { data: closing }, { data: members }] =
    await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("cash_openings").select("id").eq("opening_date", today).maybeSingle(),
      supabase.from("cash_closings").select("id").eq("closing_date", today).maybeSingle(),
      // Para "Es familiar de…" (pack familiar).
      supabase
        .from("members")
        .select("id, full_name, family_id")
        .is("archived_at", null)
        .order("full_name"),
    ]);

  const cajaAbierta = Boolean(opening) && !closing;

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo socio" back={{ href: "/panel/socios", label: "Socios" }} />

      <NewMemberForm
        plans={(plans ?? []) as Plan[]}
        members={(members ?? []) as Relative[]}
        cajaAbierta={cajaAbierta}
        today={today}
      />
    </div>
  );
}
